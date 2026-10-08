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
} from './dto/redemption.dto';
import { AuthenticatedUser } from '../auth/auth.types';
import { REDEMPTION_CONSTANTS } from './redemption.constants';
import {
  generateRedemptionCode,
  calculateRemainingSeconds,
  generateQrPayload,
  getRedemptionLockKey,
} from './redemption.utils';
import { ListRedemptionsDto } from '../admin/dto/list-redemptions.dto';

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
    // 1. Subscription entitlement check
    if (!user.subscriptionActive) {
      throw new ForbiddenException(
        'An active OfferNepal subscription is required to redeem vouchers.',
      );
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
      throw new BadRequestException(
        'Redemption code has expired. Please ask customer to regenerate.',
      );
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

  // ─────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────
}
