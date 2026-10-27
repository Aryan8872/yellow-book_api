import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, RedemptionStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DistributedLockService } from '../../infrastructure/redis/distributed-lock.service';
import { MetricsService } from '../../infrastructure/metrics/metrics.service';
import {
  RedeemInitDto,
  MerchantRedeemDto,
  VerifyQrDto,
} from './dto/redemption.dto';
import { AuthenticatedUser, UserRole } from '../auth/auth.types';
import { REDEMPTION_CONSTANTS } from './redemption.constants';
import {
  generateRedemptionCode,
  calculateRemainingSeconds,
  generateQrPayload,
  extractRedemptionCode,
  renderQrDataUrl,
  getRedemptionLockKey,
} from './redemption.utils';
import { ListRedemptionsDto } from '../admin/dto/list-redemptions.dto';
import { AppErrorCode } from '../../common/constants/error-codes';

// Offer selection fields for redemption queries
const OFFER_SELECT_FIELDS = {
  id: true,
  merchantId: true,
  title: true,
  category: true,
  description: true,
  terms: true,
  estimatedSavingsNpr: true,
  isActive: true,
  merchant: {
    select: { id: true, name: true, merchantPinHash: true },
  },
} as const;

export interface RedemptionInitResult {
  sessionId: string;
  code: string;
  expiresInSeconds: number;
  expiresAt: string;
  merchantName: string;
  offerTitle: string;
  qrPayload: string;
}

export interface MerchantRedeemResult {
  success: boolean;
  redemptionId: string;
  redeemedAt: string;
  savingsNpr: number;
  offerTitle: string;
  merchantName: string;
}

type BranchBriefRow = {
  id: string;
  name: string;
  address: string;
  district: string;
  lat: unknown;
  lng: unknown;
};

/**
 * Normalizes a MerchantBranch row into the mobile-facing branch brief.
 * lat/lng arrive as Prisma Decimal (JSON-serializes as string) — the map
 * consumers do arithmetic on them, so they are converted to numbers here.
 */
const mapBranchForClient = (b: BranchBriefRow) => ({
  id: b.id,
  name: b.name,
  address: b.address,
  district: b.district,
  lat: b.lat == null ? null : Number(b.lat),
  lng: b.lng == null ? null : Number(b.lng),
});

const mapSessionBranch = (b: BranchBriefRow | null) =>
  b ? mapBranchForClient(b) : null;

@Injectable()
export class RedemptionService {
  private readonly logger = new Logger(RedemptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lockService: DistributedLockService,
    private readonly metrics: MetricsService,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  // Step 1: User taps "Redeem" → get short-lived code
  // ─────────────────────────────────────────────────────────────────

  async initRedemption(
    offerId: string,
    user: AuthenticatedUser,
    _dto: RedeemInitDto,
  ): Promise<RedemptionInitResult> {
    // 1. Subscription entitlement & Free-Tier 3-redemption limit check
    // Check if user has an active Club subscription or active system trial
    let isClubActive = user.subscriptionActive;
    if (!isClubActive) {
      const activeRecord = await this.prisma.subscriptionRecord.findFirst({
        where: {
          userId: user.id,
          status: 'ACTIVE',
          currentPeriodEnd: { gt: new Date() },
        },
      });
      if (activeRecord) {
        isClubActive = true;
      } else {
        const userTrialConfig = await this.prisma.systemTrialConfig.findFirst({
          where: { audience: 'USER', isEnabled: true },
        });
        if (userTrialConfig) {
          isClubActive = true;
        }
      }
    }

    if (!isClubActive) {
      // Free tier: cap at 3 redemptions per calendar month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const monthlyRedeemedCount = await this.prisma.redemptionSession.count({
        where: {
          userId: user.id,
          status: RedemptionStatus.REDEEMED,
          createdAt: { gte: startOfMonth },
        },
      });

      if (monthlyRedeemedCount >= 3) {
        throw new ForbiddenException({
          message: 'Free voucher limit reached (3/3 this month). Join OfferNepal Club for unlimited redemptions!',
          errorCode: 'VOUCHER_LIMIT_REACHED',
          monthlyUsed: monthlyRedeemedCount,
          monthlyLimit: 3,
        });
      }
    }

    // Use transaction to prevent race conditions on redemption limits
    const result = await this.prisma.$transaction(async (tx) => {
      // 2. Load offer from DB
      const offerRow = await tx.offer.findFirst({
        where: { id: offerId, isActive: true },
        select: OFFER_SELECT_FIELDS,
      });

      if (!offerRow) {
        this.logger.warn(`Redemption failed: offer not found ${offerId}`);
        throw new NotFoundException('Offer not found');
      }

      // 3. Check if user already has an active unresolved session for this offer
      const existingSession = await tx.redemptionSession.findFirst({
        where: {
          userId: user.id,
          offerId,
          status: RedemptionStatus.INIT,
          codeExpiresAt: { gt: new Date() },
        },
      });

      if (existingSession) {
        const remainingSeconds = calculateRemainingSeconds(
          existingSession.codeExpiresAt,
        );
        return {
          type: 'existing' as const,
          session: existingSession,
          offerRow,
        };
      }

      // 4. Generate unique code and create session
      const code = generateRedemptionCode();
      const codeExpiresAt = new Date(
        Date.now() + REDEMPTION_CONSTANTS.CODE_TTL_SECONDS * 1000,
      );

      const session = await tx.redemptionSession.create({
        data: {
          userId: user.id,
          offerId,
          branchId: _dto.branchId ?? undefined,
          code,
          status: RedemptionStatus.INIT,
          savingsNpr: offerRow.estimatedSavingsNpr,
          codeExpiresAt,
        },
      });

      return {
        type: 'new' as const,
        session,
        offerRow,
        code,
      };
    });

    this.metrics.activeRedemptionSessions.inc();

    if (result.type === 'existing') {
      const remainingSeconds = calculateRemainingSeconds(
        result.session.codeExpiresAt,
      );
      return {
        sessionId: result.session.id,
        code: result.session.code,
        expiresInSeconds: remainingSeconds,
        expiresAt: result.session.codeExpiresAt.toISOString(),
        merchantName: result.offerRow.merchant.name,
        offerTitle: result.offerRow.title,
        qrPayload: generateQrPayload(result.session.code),
      };
    }

    return {
      sessionId: result.session.id,
      code: result.code,
      expiresInSeconds: REDEMPTION_CONSTANTS.CODE_TTL_SECONDS,
      expiresAt: result.session.codeExpiresAt.toISOString(),
      merchantName: result.offerRow.merchant.name,
      offerTitle: result.offerRow.title,
      qrPayload: generateQrPayload(result.code),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Step 2: Merchant cashier confirms code + PIN
  // ─────────────────────────────────────────────────────────────────

  async merchantRedeem(
    merchantUser: AuthenticatedUser,
    dto: MerchantRedeemDto,
  ): Promise<MerchantRedeemResult> {
    const codeNormalized = dto.code.trim().toUpperCase();

    // Load session by code
    const session = await this.prisma.redemptionSession.findUnique({
      where: { code: codeNormalized },
      include: {
        offer: {
          select: {
            id: true,
            title: true,
            merchant: {
              select: { id: true, name: true, merchantPinHash: true },
            },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Invalid or expired redemption code');
    }

    // Expiry check
    if (session.codeExpiresAt.getTime() < Date.now()) {
      // Mark expired in DB (fire and forget)
      this.prisma.redemptionSession
        .update({
          where: { id: session.id },
          data: { status: RedemptionStatus.EXPIRED },
        })
        .catch((err) => this.logger.error('Failed to expire session', err));

      this.metrics.activeRedemptionSessions.dec();
      throw new BadRequestException({
        message: 'Redemption code has expired. Please ask customer to regenerate.',
        errorCode: AppErrorCode.REDEMPTION_CODE_EXPIRED,
      });
    }

    // Already processed?
    if (session.status !== RedemptionStatus.INIT) {
      throw new ConflictException(
        `This voucher session has already been processed with status: ${session.status}`,
      );
    }

    // Verify Merchant PIN
    const { merchantPinHash } = session.offer.merchant;
    if (!merchantPinHash) {
      throw new UnauthorizedException(
        'Merchant account has no active verification PIN configured',
      );
    }

    const isPinValid = await bcrypt.compare(dto.merchantPin, merchantPinHash);
    if (!isPinValid) {
      this.metrics.fraudFlagsTotal.inc({
        reason: 'INVALID_MERCHANT_PIN',
        severity: 'MEDIUM',
      });
      throw new UnauthorizedException('Incorrect merchant verification PIN');
    }

    // Distributed lock to prevent double-spend race conditions
    return this.lockService.runWithLock(
      getRedemptionLockKey(session.id),
      REDEMPTION_CONSTANTS.LOCK_TTL_MS,
      async () => {
        // Re-read status inside lock
        const fresh = await this.prisma.redemptionSession.findUnique({
          where: { id: session.id },
          select: { status: true },
        });

        if (fresh?.status !== RedemptionStatus.INIT) {
          throw new ConflictException('Voucher has already been redeemed.');
        }

        const redeemedAt = new Date();

        // Atomic update
        const updated = await this.prisma.redemptionSession.update({
          where: { id: session.id },
          data: {
            status: RedemptionStatus.REDEEMED,
            redeemedAt,
            staffId: dto.staffId ?? null,
          },
        });

        this.metrics.activeRedemptionSessions.dec();
        this.metrics.redemptionsTotal.inc({
          merchant_id: session.offer.merchant.id,
          status: 'SUCCESS',
        });

        // Staff activity audit (Task 10). Existing code+PIN flow is unchanged;
        // we only record who confirmed the redemption.
        await this.writeStaffAudit(
          merchantUser.id,
          'redeem',
          {
            entity: 'RedemptionSession',
            entityId: updated.id,
            merchantId: session.offer.merchant.id,
          },
          {
            via: 'merchant_pin',
            offerId: session.offer.id,
            staffId: dto.staffId ?? null,
          },
        );

        return {
          success: true,
          redemptionId: updated.id,
          redeemedAt: redeemedAt.toISOString(),
          savingsNpr: Number(updated.savingsNpr),
          offerTitle: session.offer.title,
          merchantName: session.offer.merchant.name,
        };
      },
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Step 2b: Staff scans customer QR (no merchant PIN required)
  // ─────────────────────────────────────────────────────────────────

  async verifyQrRedemption(
    staffUser: AuthenticatedUser,
    dto: VerifyQrDto,
  ): Promise<MerchantRedeemResult> {
    const code = extractRedemptionCode(dto.qrPayload);

    const session = await this.prisma.redemptionSession.findUnique({
      where: { code },
      include: {
        offer: {
          select: {
            id: true,
            title: true,
            merchant: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Invalid or expired QR code');
    }

    // Expiry check (mirrors merchantRedeem)
    if (session.codeExpiresAt.getTime() < Date.now()) {
      this.prisma.redemptionSession
        .update({
          where: { id: session.id },
          data: { status: RedemptionStatus.EXPIRED },
        })
        .catch((err) => this.logger.error('Failed to expire session', err));

      this.metrics.activeRedemptionSessions.dec();
      throw new BadRequestException(
        'Redemption code has expired. Please ask customer to regenerate.',
      );
    }

    // Single-use / status check
    if (session.status !== RedemptionStatus.INIT) {
      throw new ConflictException(
        `This voucher session has already been processed with status: ${session.status}`,
      );
    }

    // Staff authorization (replaces the merchant PIN used by merchantRedeem):
    // the caller must be an active staff member of the session's merchant,
    // hold the `redeem` permission, and (when a branchId is provided) that
    // branch must belong to the same merchant.
    const staff = await this.assertStaffCanRedeem(
      staffUser,
      session.offer.merchant.id,
      dto.branchId,
    );

    // Distributed lock to prevent double-spend race conditions
    return this.lockService.runWithLock(
      getRedemptionLockKey(session.id),
      REDEMPTION_CONSTANTS.LOCK_TTL_MS,
      async () => {
        // Re-read status inside lock
        const fresh = await this.prisma.redemptionSession.findUnique({
          where: { id: session.id },
          select: { status: true },
        });

        if (fresh?.status !== RedemptionStatus.INIT) {
          throw new ConflictException('Voucher has already been redeemed.');
        }

        const redeemedAt = new Date();

        const updated = await this.prisma.redemptionSession.update({
          where: { id: session.id },
          data: {
            status: RedemptionStatus.REDEEMED,
            redeemedAt,
            staffId: staff.id,
            ...(dto.branchId ? { branchId: dto.branchId } : {}),
          },
        });

        this.metrics.activeRedemptionSessions.dec();
        this.metrics.redemptionsTotal.inc({
          merchant_id: session.offer.merchant.id,
          status: 'SUCCESS',
        });

        // Staff activity audit (Task 10)
        await this.writeStaffAudit(
          staffUser.id,
          'redeem',
          {
            entity: 'RedemptionSession',
            entityId: updated.id,
            merchantId: session.offer.merchant.id,
          },
          {
            via: 'staff_qr',
            offerId: session.offer.id,
            staffId: staff.id,
            branchId: dto.branchId ?? null,
          },
        );

        return {
          success: true,
          redemptionId: updated.id,
          redeemedAt: redeemedAt.toISOString(),
          savingsNpr: Number(updated.savingsNpr),
          offerTitle: session.offer.title,
          merchantName: session.offer.merchant.name,
        };
      },
    );
  }

  /**
   * Renders a QR payload string into a scannable PNG data URL (Task 13).
   * Thin wrapper so both the customer wallet and staff scanner can obtain an
   * image rather than only the raw payload string.
   */
  async renderQrImage(payload: string): Promise<{ dataUrl: string }> {
    if (!payload || !payload.trim()) {
      throw new BadRequestException('payload query parameter is required');
    }
    const dataUrl = await renderQrDataUrl(payload.trim());
    return { dataUrl };
  }

  async listRedemptions(dto: ListRedemptionsDto) {
    const { page, limit, search, merchantId, offerId, status, startDate, endDate, sortBy, sortOrder } = dto;
    const skip = (page - 1) * limit;

    const where: Prisma.RedemptionSessionWhereInput = {};

    if (merchantId) {
      where.offer = { merchantId };
    }

    if (offerId) {
      where.offerId = offerId;
    }

    if (status) {
      where.status = status as RedemptionStatus;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    if (search) {
      where.OR = [
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { offer: { title: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const orderBy: Prisma.RedemptionSessionOrderByWithRelationInput = {};
    if (sortBy) {
      orderBy[sortBy] = sortOrder || 'asc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [sessions, total] = await Promise.all([
      this.prisma.redemptionSession.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          offer: {
            select: {
              id: true,
              title: true,
              merchant: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.redemptionSession.count({ where }),
    ]);

    return {
      data: sessions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrevious: page > 1,
      },
    };
  }

  async getMyRedemptions(userId: string, offerId?: string) {
    const redemptions = await this.prisma.redemptionSession.findMany({
      // T-30-01 (Elevation of Privilege): offerId is ALWAYS anded with the
      // JWT user id — a bare offerId lookup must never be trusted.
      where: { userId, ...(offerId && { offerId }) },
      orderBy: { createdAt: 'desc' },
      include: {
        offer: {
          select: {
            id: true,
            title: true,
            description: true,
            terms: true,
            estimatedSavingsNpr: true,
            originalPriceNpr: true,
            discountPercentage: true,
            coverImage: true,
            images: true,
            categoryId: true,
            category: { select: { id: true, name: true, slug: true, iconUrl: true } },
            merchant: {
              select: {
                id: true,
                name: true,
                logoUrl: true,
                coverUrl: true,
                contactPhone: true,
                websiteUrl: true,
                branches: {
                  where: { isActive: true },
                  select: { id: true, name: true, address: true, district: true, lat: true, lng: true },
                },
              },
            },
          },
        },
        branch: {
          select: { id: true, name: true, address: true, district: true, lat: true, lng: true },
        },
      },
    });

    const now = new Date();
    const expiredIds: string[] = [];

    const mapped = redemptions.map((r) => {
      let effectiveStatus = r.status;
      if (
        (r.status === RedemptionStatus.INIT ||
          r.status === RedemptionStatus.PENDING_SYNC) &&
        r.codeExpiresAt < now
      ) {
        effectiveStatus = RedemptionStatus.EXPIRED;
        expiredIds.push(r.id);
      }

      return {
        // ── Legacy flat keys — preserved exactly (backward compat) ──────────
        id: r.id,
        offerId: r.offerId,
        offerTitle: r.offer.title,
        merchantName: r.offer.merchant.name,
        status: effectiveStatus,
        redemptionCode: r.code,
        qrPayload: `offernepal://redeem?code=${r.code}`,
        savingsNpr: r.savingsNpr,
        redeemedAt: r.redeemedAt
          ? r.redeemedAt.toISOString()
          : r.createdAt.toISOString(),
        expiresAt: r.codeExpiresAt.toISOString(),
        // ── Enriched nested payloads (RED-03 / RDS-02) ─────────────────────
      offer: {
        id: r.offer.id,
        title: r.offer.title,
        description: r.offer.description,
        terms: r.offer.terms,
        estimatedSavingsNpr: r.offer.estimatedSavingsNpr,
        originalPriceNpr: r.offer.originalPriceNpr,
        discountPercentage: r.offer.discountPercentage,
        coverImage: r.offer.coverImage,
        images: r.offer.images,
        categoryId: r.offer.categoryId,
        category: r.offer.category,
      },
      merchant: {
        id: r.offer.merchant.id,
        name: r.offer.merchant.name,
        logoUrl: r.offer.merchant.logoUrl,
        coverUrl: r.offer.merchant.coverUrl,
        contactPhone: r.offer.merchant.contactPhone,
        websiteUrl: r.offer.merchant.websiteUrl,
        branches: r.offer.merchant.branches.map(mapBranchForClient),
      },
      // Branch fallback (Pitfall 5): initRedemption creates sessions without
      // branchId, so most INIT sessions carry branch == null — fall back to
      // the merchant's first active branch; null only when both are absent.
      branch: mapSessionBranch(r.branch ?? r.offer.merchant.branches[0] ?? null),
    };
  });

    if (expiredIds.length > 0) {
      // Fire-and-forget background synchronization to keep DB status in sync
      this.prisma.redemptionSession
        .updateMany({
          where: {
            id: { in: expiredIds },
            status: { in: [RedemptionStatus.INIT, RedemptionStatus.PENDING_SYNC] },
          },
          data: { status: RedemptionStatus.EXPIRED },
        })
        .catch((err) => {
          this.logger.warn(
            `Failed to batch expire redemptions: ${err?.message ?? err}`,
          );
        });
    }

    return mapped;
  }

  // ─────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────

  /**
   * Writes a row into the existing AuditLog model (Task 10). Mirrors the
   * admin.service.ts audit pattern. Audit failures are logged and swallowed so
   * they never break the primary redemption flow.
   *
   * @param actorUserId - The acting user id (AuditLog.actorId -> User.id)
   * @param action      - Action verb, e.g. 'redeem' | 'update_permissions'
   * @param target      - { entity, entityId, merchantId? } describing the record
   * @param meta        - Arbitrary context stored in AuditLog.metadata
   */
  private async writeStaffAudit(
    actorUserId: string,
    action: string,
    target: { entity: string; entityId: string; merchantId?: string },
    meta: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          entity: target.entity,
          entityId: target.entityId,
          action,
          actorId: actorUserId,
          merchantId: target.merchantId ?? null,
          metadata:
            meta && Object.keys(meta).length > 0
              ? (meta as Prisma.InputJsonValue)
              : undefined,
        },
      });
    } catch (err) {
      this.logger.error('Failed to write staff audit log', err);
    }
  }

  /**
   * Authorizes a staff user to redeem a voucher for `merchantId` (Task 14).
   * Replaces the merchant-PIN gate used by the legacy `merchantRedeem` flow.
   * Returns the staff row (its id is stored on the RedemptionSession).
   */
  private async assertStaffCanRedeem(
    staffUser: AuthenticatedUser,
    merchantId: string,
    branchId?: string,
  ) {
    const staff = await this.prisma.merchantStaff.findUnique({
      where: { userId: staffUser.id },
      select: {
        id: true,
        merchantId: true,
        isActive: true,
        role: true,
        permissions: true,
      },
    });

    if (!staff || !staff.isActive) {
      this.metrics.fraudFlagsTotal.inc({
        reason: 'UNAUTHORIZED_STAFF',
        severity: 'MEDIUM',
      });
      throw new ForbiddenException(
        'Authenticated user is not an active staff member of this merchant',
      );
    }

    if (staff.merchantId !== merchantId) {
      this.metrics.fraudFlagsTotal.inc({
        reason: 'STAFF_WRONG_MERCHANT',
        severity: 'HIGH',
      });
      throw new ForbiddenException(
        'Staff does not belong to the merchant that owns this voucher',
      );
    }

    // `redeem` capability. Platform/merchant admins implicitly hold it so we do
    // not have to backfill their permissions[] array (documented decision).
    const isPrivileged =
      staffUser.role === UserRole.ADMIN ||
      staffUser.role === UserRole.MERCHANT_ADMIN ||
      staff.role === UserRole.MERCHANT_ADMIN;
    const hasRedeem =
      isPrivileged || (staff.permissions ?? []).includes('redeem');

    if (!hasRedeem) {
      this.metrics.fraudFlagsTotal.inc({
        reason: 'MISSING_REDEEM_PERMISSION',
        severity: 'MEDIUM',
      });
      throw new ForbiddenException(
        'Staff does not have the "redeem" permission',
      );
    }

    // MerchantStaff is not branch-assigned in the schema, so when a branchId is
    // supplied we verify it belongs to the same merchant as the staff.
    if (branchId) {
      const branch = await this.prisma.merchantBranch.findUnique({
        where: { id: branchId },
        select: { merchantId: true },
      });
      if (!branch || branch.merchantId !== staff.merchantId) {
        throw new ForbiddenException(
          'Provided branch does not belong to this merchant',
        );
      }
    }

    return staff;
  }

  /**
   * Cancel an active redemption session
   * Staff with redeem permission can cancel sessions for their merchant
   * CONSUMER users can cancel their own INIT or PENDING_SYNC sessions
   */
  async cancelRedemption(
    sessionId: string,
    user: AuthenticatedUser,
  ): Promise<{ success: boolean; sessionId: string }> {
    const session = await this.prisma.$transaction(async (tx) => {
      const currentSession = await tx.redemptionSession.findUnique({
        where: { id: sessionId },
        include: {
          offer: {
            select: {
              merchantId: true,
            },
          },
        },
      });

      if (!currentSession) {
        throw new NotFoundException('Redemption session not found');
      }

      const isConsumerUser =
        user.role === UserRole.USER || user.role === UserRole.CONSUMER;

      if (isConsumerUser) {
        if (currentSession.userId !== user.id) {
          throw new ForbiddenException(
            'You can only cancel your own redemption sessions',
          );
        }
      } else {
        await this.assertStaffCanRedeem(user, currentSession.offer.merchantId);
      }

      const isCancellableStatus =
        currentSession.status === RedemptionStatus.INIT ||
        currentSession.status === RedemptionStatus.PENDING_SYNC;
      if (!isCancellableStatus) {
        throw new BadRequestException(
          `Cannot cancel session with status ${currentSession.status}. Only INIT and PENDING_SYNC sessions can be cancelled.`,
        );
      }

      const updateResult = await tx.redemptionSession.updateMany({
        where: {
          id: sessionId,
          status: currentSession.status,
          ...(isConsumerUser ? { userId: user.id } : {}),
        },
        data: { status: RedemptionStatus.REJECTED },
      });
      if (updateResult.count !== 1) {
        throw new ConflictException(
          'Redemption status changed; refresh and try again',
        );
      }

      return currentSession;
    });

    // Write audit log
    try {
      await this.prisma.auditLog.create({
        data: {
          entity: 'RedemptionSession',
          entityId: sessionId,
          action: 'cancel',
          actorId: user.id,
          merchantId: session.offer.merchantId,
          metadata: {
            previousStatus: session.status,
            cancelledBy: user.id,
          },
        },
      });
    } catch (err: any) {
      this.logger.error('Failed to write audit log for cancellation', err);
    }

    return { success: true, sessionId };
  }
}
