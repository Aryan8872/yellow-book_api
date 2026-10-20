import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { Prisma, MerchantStatus, UserRole } from '@prisma/client';
import { ListMerchantsDto } from './dto/list-merchants.dto';
import { ApproveMerchantDto } from './dto/approve-merchant.dto';
import { RejectMerchantDto } from './dto/reject-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { SuspendMerchantDto } from './dto/suspend-merchant.dto';
import { ReactivateMerchantDto } from './dto/reactivate-merchant.dto';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { ActivateUserDto } from './dto/activate-user.dto';
import { ListFraudFlagsDto } from './dto/list-fraud-flags.dto';
import { ReviewFraudDto, FraudReviewDecision } from './dto/review-fraud.dto';
import { SubscriptionOverrideMode } from './dto/subscription-override.dto';
import * as bcrypt from 'bcrypt';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.constants';
import { Inject, Optional } from '@nestjs/common';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  async getDashboardStats() {
    const [totalMerchants, pendingMerchants, totalUsers, activeOffers] = await Promise.all([
      this.prisma.merchant.count(),
      this.prisma.merchant.count({ where: { status: MerchantStatus.PENDING_REVIEW } }),
      this.prisma.user.count(),
      this.prisma.offer.count({ where: { isActive: true } }),
    ]);

    return {
      totalMerchants,
      pendingMerchants,
      totalUsers,
      activeOffers,
    };
  }

  /**
   * Retrieves live active sessions (via Redis sliding-window) and real-time active subscriber metrics
   * partitioned by audience (User Club Members vs Merchant Partners) and plan tiers.
   */
  async getLiveSystemMetrics() {
    const now = new Date();
    const windowStartMs = Date.now() - 5 * 60 * 1000; // 5-minute sliding window

    // 1. Calculate live active sessions from Redis sliding window
    let totalLiveSessions = 0;
    let liveUserSessions = 0;
    let liveMerchantSessions = 0;

    if (this.redis) {
      try {
        // Prune expired sessions older than 5 minutes
        await this.redis.zremrangebyscore('active_sessions:sliding', '-inf', windowStartMs);
        // Get all active session keys in window
        const activeMembers = await this.redis.zrangebyscore('active_sessions:sliding', windowStartMs, '+inf');
        totalLiveSessions = activeMembers.length;
        for (const member of activeMembers) {
          if (member.startsWith('merchant:')) liveMerchantSessions++;
          else if (member.startsWith('user:')) liveUserSessions++;
        }
      } catch (err) {
        new Logger('AdminService').warn(`Redis live session retrieval fallback: ${(err as any)?.message}`);
      }
    }

    // Fallback if Redis is empty / disconnected: derive lower bound from recent activity
    if (totalLiveSessions === 0) {
      const recentThreshold = new Date(Date.now() - 15 * 60 * 1000);
      const [recentLogins, recentRedemptions] = await Promise.all([
        this.prisma.user.count({ where: { updatedAt: { gte: recentThreshold } } }),
        this.prisma.redemptionSession.count({ where: { createdAt: { gte: recentThreshold } } }),
      ]);
      totalLiveSessions = Math.max(1, recentLogins + recentRedemptions);
      liveUserSessions = Math.max(1, recentLogins);
      liveMerchantSessions = Math.max(0, recentRedemptions);
    }

    // 2. Active Subscribers Breakdown from Prisma (status = ACTIVE and currentPeriodEnd > now)
    const [
      activeUserSubsCount,
      activeMerchantSubsCount,
      plansWithActiveSubs,
    ] = await Promise.all([
      this.prisma.subscriptionRecord.count({
        where: {
          status: 'ACTIVE',
          userId: { not: null },
          currentPeriodEnd: { gt: now },
        },
      }),
      this.prisma.subscriptionRecord.count({
        where: {
          status: 'ACTIVE',
          merchantId: { not: null },
          currentPeriodEnd: { gt: now },
        },
      }),
      this.prisma.subscriptionRecord.groupBy({
        by: ['planId'],
        where: {
          status: 'ACTIVE',
          currentPeriodEnd: { gt: now },
        },
        _count: { id: true },
      }),
    ]);

    // Attach plan details
    const planIds = plansWithActiveSubs.map((p) => p.planId);
    const plansInfo = await this.prisma.subscriptionPlan.findMany({
      where: { id: { in: planIds } },
      select: { id: true, code: true, name: true, audience: true, billingCycle: true, priceNpr: true },
    });
    const planMap = new Map(plansInfo.map((p) => [p.id, p]));

    const subscribersByPlan = plansWithActiveSubs.map((item) => {
      const plan = planMap.get(item.planId);
      return {
        planId: item.planId,
        code: plan?.code ?? 'UNKNOWN',
        name: plan?.name ?? 'Unknown Plan',
        audience: plan?.audience ?? 'USER',
        billingCycle: plan?.billingCycle ?? 'MONTHLY',
        priceNpr: plan?.priceNpr ?? 0,
        activeCount: item._count.id,
      };
    });

    return {
      liveSessions: {
        total: totalLiveSessions,
        users: liveUserSessions,
        merchants: liveMerchantSessions,
        windowMinutes: 5,
      },
      activeSubscribers: {
        total: activeUserSubsCount + activeMerchantSubsCount,
        users: activeUserSubsCount,
        merchants: activeMerchantSubsCount,
        byPlan: subscribersByPlan,
      },
    };
  }

  async listMerchants(dto: ListMerchantsDto) {
    const { page, limit, search, status, sortBy, sortOrder } = dto;
    const skip = (page - 1) * limit;

    const where: Prisma.MerchantWhereInput = {};

    if (status && (status as any) !== 'all') {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { contactEmail: { contains: search, mode: 'insensitive' } },
        { contactPhone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.MerchantOrderByWithRelationInput = {};
    if (sortBy) {
      orderBy[sortBy] = sortOrder || 'asc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [merchants, total] = await Promise.all([
      this.prisma.merchant.findMany({
        where,
        skip,
        take: limit,
        include: {
          branches: true,
          // Include active subscription record with plan info for badge display
          subscriptions: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              plan: {
                select: { id: true, code: true, name: true, audience: true, priceNpr: true, billingCycle: true },
              },
            },
          },
        },
        orderBy,
      }),
      this.prisma.merchant.count({ where }),
    ]);

    // Flatten activeSubscription to top-level for clean API surface
    const data = merchants.map((m) => {
      const { subscriptions, ...rest } = m as any;
      return {
        ...rest,
        activeSubscription: subscriptions?.[0] ?? null,
      };
    });

    return {
      data,
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

  async approveMerchant(dto: ApproveMerchantDto, adminId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: dto.merchantId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    if (merchant.status !== MerchantStatus.PENDING_REVIEW) {
      throw new BadRequestException('Merchant is not pending review');
    }

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedMerchant = await tx.merchant.update({
        where: { id: dto.merchantId },
        data: {
          status: MerchantStatus.ACTIVE,
          onboardedAt: now,
        },
      });

      // Optionally assign an initial subscription plan upon approval
      if (dto.planId) {
        const plan = await tx.subscriptionPlan.findUnique({ where: { id: dto.planId } });
        if (!plan) throw new NotFoundException(`Subscription plan ${dto.planId} not found`);

        const durationDays = dto.durationDays ?? plan.durationDays ?? 180;
        const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

        // Deactivate any existing subscription for this merchant before creating new one
        await tx.subscriptionRecord.updateMany({
          where: { merchantId: dto.merchantId, status: 'ACTIVE' },
          data: { status: 'CANCELLED', cancelledAt: now },
        });

        await tx.subscriptionRecord.create({
          data: {
            planId: plan.id,
            merchantId: dto.merchantId,
            status: 'ACTIVE',
            isTrial: dto.isTrial ?? false,
            startedAt: now,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            isManualOverride: true,
            overrideReason: dto.notes ?? 'Assigned on merchant approval',
            overrideAdminId: adminId,
          },
        });
      } else {
        // Default: assign the active MERCHANT_FOUNDING plan if available (180-day founding partner tier)
        await this.assignDefaultMerchantPlan(dto.merchantId, adminId, dto.notes, tx as any);
      }

      return updatedMerchant;
    });

    // Log audit entry
    await this.prisma.auditLog.create({
      data: {
        entity: 'Merchant',
        entityId: dto.merchantId,
        action: 'approve',
        actorId: adminId,
        merchantId: dto.merchantId,
        metadata: { notes: dto.notes, planId: dto.planId ?? null, durationDays: dto.durationDays ?? null },
      },
    });

    return updated;
  }

  async rejectMerchant(dto: RejectMerchantDto, adminId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: dto.merchantId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    if (merchant.status !== MerchantStatus.PENDING_REVIEW) {
      throw new BadRequestException('Merchant is not pending review');
    }

    // Enforce non-empty rejection reason
    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException('A rejection reason is required');
    }

    const updated = await this.prisma.merchant.update({
      where: { id: dto.merchantId },
      data: {
        status: MerchantStatus.ARCHIVED,
      },
    });

    // Log audit entry with mandatory reason
    await this.prisma.auditLog.create({
      data: {
        entity: 'Merchant',
        entityId: dto.merchantId,
        action: 'reject',
        actorId: adminId,
        merchantId: dto.merchantId,
        metadata: { reason: dto.reason.trim() },
      },
    });

    return updated;
  }

  async getMerchantDetails(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: {
        branches: true,
        offers: {
          where: { isActive: true },
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            plan: true,
          },
        },
        _count: {
          select: {
            branches: true,
            offers: true,
          },
        },
      },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    const activeSubscription = merchant.subscriptions.find((s) => s.status === 'ACTIVE') ?? merchant.subscriptions[0] ?? null;

    return {
      ...merchant,
      activeSubscription,
    };
  }

  async updateMerchant(merchantId: string, dto: UpdateMerchantDto, adminId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    const updated = await this.prisma.merchant.update({
      where: { id: merchantId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.contactEmail && { contactEmail: dto.contactEmail }),
        ...(dto.contactPhone !== undefined && { contactPhone: dto.contactPhone }),
        ...(dto.vatNumber !== undefined && { vatNumber: dto.vatNumber }),
        ...(dto.panNumber !== undefined && { registrationNumber: dto.panNumber }),
        ...(dto.status && { status: dto.status }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.websiteUrl !== undefined && { websiteUrl: dto.websiteUrl }),
        ...(dto.coverUrl !== undefined && { coverUrl: dto.coverUrl }),
      },
    });

    // Log audit entry
    await this.prisma.auditLog.create({
      data: {
        entity: 'Merchant',
        entityId: merchantId,
        action: 'update',
        actorId: adminId,
        merchantId: merchantId,
        metadata: { changes: dto as any },
      },
    });

    return updated;
  }

  async suspendMerchant(dto: SuspendMerchantDto, adminId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: dto.merchantId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    if (merchant.status === MerchantStatus.SUSPENDED) {
      throw new BadRequestException('Merchant is already suspended');
    }

    const updated = await this.prisma.merchant.update({
      where: { id: dto.merchantId },
      data: {
        status: MerchantStatus.SUSPENDED,
      },
    });

    // Log audit entry
    await this.prisma.auditLog.create({
      data: {
        entity: 'Merchant',
        entityId: dto.merchantId,
        action: 'suspend',
        actorId: adminId,
        merchantId: dto.merchantId,
        metadata: { reason: dto.reason },
      },
    });

    return updated;
  }

  async reactivateMerchant(dto: ReactivateMerchantDto, adminId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: dto.merchantId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    if (merchant.status === MerchantStatus.ACTIVE) {
      throw new BadRequestException('Merchant is already active');
    }

    const updated = await this.prisma.merchant.update({
      where: { id: dto.merchantId },
      data: {
        status: MerchantStatus.ACTIVE,
      },
    });

    // Log audit entry
    await this.prisma.auditLog.create({
      data: {
        entity: 'Merchant',
        entityId: dto.merchantId,
        action: 'reactivate',
        actorId: adminId,
        merchantId: dto.merchantId,
        metadata: { notes: dto.notes },
      },
    });

    return updated;
  }

  async createMerchant(dto: CreateMerchantDto, adminId: string) {
    const existing = await this.prisma.merchant.findFirst({
      where: { contactEmail: dto.contactEmail },
    });

    if (existing) {
      throw new BadRequestException('A merchant with this contact email already exists');
    }

    const now = new Date();

    const merchant = await this.prisma.$transaction(async (tx) => {
      const newMerchant = await tx.merchant.create({
        data: {
          name: dto.name,
          contactEmail: dto.contactEmail,
          contactPhone: dto.contactPhone ?? null,
          description: dto.description ?? null,
          websiteUrl: dto.websiteUrl ?? null,
          registrationNumber: dto.panNumber ?? null,
          vatNumber: dto.vatNumber ?? null,
          logoUrl: dto.logoUrl ?? null,
          coverUrl: dto.coverUrl ?? null,
          status: MerchantStatus.ACTIVE,
          onboardedAt: now,
        },
      });

      // Optionally assign an initial subscription plan
      if (dto.planId) {
        const plan = await tx.subscriptionPlan.findUnique({ where: { id: dto.planId } });
        if (!plan) throw new NotFoundException(`Subscription plan ${dto.planId} not found`);

        const durationDays = dto.durationDays ?? plan.durationDays ?? 180;
        const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

        await tx.subscriptionRecord.create({
          data: {
            planId: plan.id,
            merchantId: newMerchant.id,
            status: 'ACTIVE',
            isTrial: dto.isTrial ?? false,
            startedAt: now,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            isManualOverride: true,
            overrideReason: 'Assigned on manual merchant creation',
            overrideAdminId: adminId,
          },
        });
      } else {
        // Default: try to assign the founding partner plan
        await this.assignDefaultMerchantPlan(newMerchant.id, adminId, 'Auto-assigned on merchant creation', tx as any);
      }

      return newMerchant;
    });

    await this.prisma.auditLog.create({
      data: {
        entity: 'Merchant',
        entityId: merchant.id,
        action: 'create_merchant',
        actorId: adminId,
        merchantId: merchant.id,
        metadata: { name: merchant.name, contactEmail: merchant.contactEmail, planId: dto.planId ?? null },
      },
    });

    return merchant;
  }

  /**
   * Assigns the default MERCHANT_FOUNDING plan to a merchant.
   * Silently skips if no founding plan is configured — avoids blocking the create/approve flow.
   */
  private async assignDefaultMerchantPlan(
    merchantId: string,
    adminId: string,
    reason?: string,
    tx?: any,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    try {
      const foundingPlan = await db.subscriptionPlan.findFirst({
        where: { code: 'MERCHANT_FOUNDING', isActive: true, isArchived: false },
      });
      if (!foundingPlan) return; // no default plan configured; skip silently

      const now = new Date();
      const durationDays = foundingPlan.durationDays ?? 180;
      const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

      await db.subscriptionRecord.create({
        data: {
          planId: foundingPlan.id,
          merchantId,
          status: 'ACTIVE',
          isTrial: true,
          startedAt: now,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          isManualOverride: true,
          overrideReason: reason ?? 'Auto-assigned founding partner plan',
          overrideAdminId: adminId,
        },
      });
    } catch (err) {
      new Logger('AdminService').warn(
        `assignDefaultMerchantPlan for ${merchantId} skipped: ${(err as any)?.message}`,
      );
    }
  }

  async createUser(dto: CreateUserDto, adminId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (existing) {
      throw new BadRequestException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        name: dto.name ?? null,
        phone: dto.phone ?? null,
        avatarUrl: dto.avatarUrl ?? null,
        role: dto.role ?? UserRole.USER,
        isActive: true,
        emailVerified: true,
        isVerified: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        avatarUrl: true,
      },
    });

    // If role is merchant admin or staff and merchantId is provided, link staff record
    if (dto.merchantId && (user.role === UserRole.MERCHANT_ADMIN || user.role === UserRole.MERCHANT_STAFF)) {
      await this.prisma.merchantStaff.create({
        data: {
          userId: user.id,
          merchantId: dto.merchantId,
          role: user.role,
        },
      });
    }

    // Auto-assign the default free tier plan for standard user accounts
    if (user.role === UserRole.USER) {
      await this.assignDefaultUserPlan(user.id, adminId);
    }

    await this.prisma.auditLog.create({
      data: {
        entity: 'User',
        entityId: user.id,
        action: 'create_user',
        actorId: adminId,
        metadata: { email: user.email, role: user.role },
      },
    });

    return user;
  }

  /**
   * Assigns the default free-tier USER plan to a newly created user.
   * Looks for an active plan with code 'USER_STANDARD' or priceNpr = 0.
   * Silently skips if no free plan is configured — avoids blocking registration.
   */
  async assignDefaultUserPlan(userId: string, adminId?: string): Promise<void> {
    try {
      // Prefer explicit code match, fall back to free (price = 0) plan
      const freePlan = await this.prisma.subscriptionPlan.findFirst({
        where: {
          OR: [
            { code: 'USER_STANDARD', isActive: true, isArchived: false },
            { audience: 'USER', priceNpr: 0, isActive: true, isArchived: false },
          ],
        },
        orderBy: [{ code: 'asc' }], // USER_STANDARD sorts first if both exist
      });

      if (!freePlan) return; // no default plan configured; skip silently

      // Don't assign if user already has an active subscription
      const existingSub = await this.prisma.subscriptionRecord.findFirst({
        where: { userId, status: 'ACTIVE' },
      });
      if (existingSub) return;

      const now = new Date();
      const durationDays = freePlan.durationDays ?? 30;
      const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

      await this.prisma.subscriptionRecord.create({
        data: {
          planId: freePlan.id,
          userId,
          status: 'ACTIVE',
          isTrial: false,
          startedAt: now,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          isManualOverride: !!adminId, // true for admin creation, false for self-registration
          overrideReason: adminId ? 'Auto-assigned free tier on admin user creation' : null,
          overrideAdminId: adminId ?? null,
        },
      });
    } catch (err) {
      new Logger('AdminService').warn(
        `assignDefaultUserPlan for ${userId} skipped: ${(err as any)?.message}`,
      );
    }
  }

  async listUsers(dto: ListUsersDto) {
    const { page = 1, limit = 20, search, role, isActive } = dto;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (role && (role as any) !== 'all') {
      where.role = role;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          // Include active subscription record with plan info for badge display
          subscriptionRecords: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              plan: {
                select: { id: true, code: true, name: true, audience: true, priceNpr: true, billingCycle: true },
              },
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    // Flatten activeSubscription to top-level, strip sensitive auth fields
    const data = users.map((u) => {
      const { subscriptionRecords, passwordHash, refreshToken, ...rest } = u as any;
      return {
        ...rest,
        activeSubscription: subscriptionRecords?.[0] ?? null,
      };
    });

    return {
      data,
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

  async suspendUser(dto: SuspendUserDto, adminId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException('Cannot suspend admin users');
    }

    if (!user.isActive) {
      throw new BadRequestException('User is already suspended');
    }

    const updated = await this.prisma.user.update({
      where: { id: dto.userId },
      data: {
        isActive: false,
      },
      select: { id: true, email: true, name: true, isActive: true },
    });

    // Log audit entry using existing schema
    await this.prisma.auditLog.create({
      data: {
        entity: 'User',
        entityId: dto.userId,
        action: 'suspend',
        actorId: adminId,
        metadata: { reason: dto.reason },
      },
    });

    return updated;
  }

  async activateUser(dto: ActivateUserDto, adminId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isActive) {
      throw new BadRequestException('User is already active');
    }

    const updated = await this.prisma.user.update({
      where: { id: dto.userId },
      data: {
        isActive: true,
      },
      select: { id: true, email: true, name: true, isActive: true },
    });

    // Log audit entry using existing schema
    await this.prisma.auditLog.create({
      data: {
        entity: 'User',
        entityId: dto.userId,
        action: 'activate',
        actorId: adminId,
        metadata: { notes: dto.notes },
      },
    });

    return updated;
  }

  async getUserDetails(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        phone: true,
        avatarUrl: true,
        isVerified: true,
        // merchantStaff gives us the merchant context for staff users
        merchantStaff: {
          select: { merchantId: true },
        },
        // Active subscription with plan details
        subscriptionRecords: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            isTrial: true,
            startedAt: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            gracePeriodEndsAt: true,
            autoRenew: true,
            isManualOverride: true,
            overrideReason: true,
            plan: {
              select: {
                id: true,
                code: true,
                name: true,
                audience: true,
                priceNpr: true,
                billingCycle: true,
                durationDays: true,
                entitlementsJson: true,
              },
            },
          },
        },
        // All subscription history
        _count: {
          select: {
            subscriptionRecords: true,
            redemptions: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { subscriptionRecords, ...rest } = user as any;
    return {
      ...rest,
      activeSubscription: subscriptionRecords?.[0] ?? null,
    };
  }

  async updateUser(userId: string, dto: UpdateUserDto, adminId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Prevent admin from changing their own role to non-admin
    if (dto.role && userId === adminId && dto.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Cannot change your own role');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.role && { role: dto.role }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(dto.merchantId !== undefined && { merchantId: dto.merchantId }),
      },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    // Log audit entry
    await this.prisma.auditLog.create({
      data: {
        entity: 'User',
        entityId: userId,
        action: 'update',
        actorId: adminId,
        metadata: { changes: dto as any },
      },
    });

    return updated;
  }

  async deleteUser(userId: string, adminId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException('Cannot delete admin users');
    }

    if (userId === adminId) {
      throw new ForbiddenException('Cannot delete your own account');
    }

    await this.prisma.user.delete({
      where: { id: userId },
    });

    // Log audit entry
    await this.prisma.auditLog.create({
      data: {
        entity: 'User',
        entityId: userId,
        action: 'delete',
        actorId: adminId,
      },
    });

    return { message: 'User deleted successfully' };
  }

  async listFraudFlags(dto: ListFraudFlagsDto) {
    const where: any = {};
    
    if (dto.severity) {
      where.severity = dto.severity;
    }
    
    // Only show unresolved flags (resolvedAt is null)
    where.resolvedAt = null;

    const skip = ((dto.page || 1) - 1) * (dto.limit || 20);

    const [fraudFlags, total] = await Promise.all([
      this.prisma.fraudFlag.findMany({
        where,
        skip,
        take: dto.limit || 20,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.fraudFlag.count({ where }),
    ]);

    const page = dto.page || 1;
    const limit = dto.limit || 20;

    return {
      data: fraudFlags,
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

  async reviewFraudFlag(dto: ReviewFraudDto, adminId: string) {
    const fraudFlag = await this.prisma.fraudFlag.findUnique({
      where: { id: dto.fraudFlagId },
    });

    if (!fraudFlag) {
      throw new NotFoundException('Fraud flag not found');
    }

    if (fraudFlag.resolvedAt) {
      throw new BadRequestException('Fraud flag is already resolved');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Update fraud flag
      const updatedFlag = await tx.fraudFlag.update({
        where: { id: dto.fraudFlagId },
        data: {
          reviewedBy: adminId,
          resolvedAt: new Date(),
          resolution: dto.decision,
        },
      });

      // If confirmed, suspend the user associated with the redemption
      if (dto.decision === FraudReviewDecision.CONFIRMED) {
        const redemption = await tx.redemptionSession.findUnique({
          where: { id: fraudFlag.redemptionId },
          select: { userId: true },
        });
        
        if (redemption?.userId) {
          await tx.user.update({
            where: { id: redemption.userId },
            data: {
              isActive: false,
            },
          });
        }
      }

      return updatedFlag;
    });

    // Log audit entry using existing schema
    await this.prisma.auditLog.create({
      data: {
        entity: 'FraudFlag',
        entityId: dto.fraudFlagId,
        action: 'review',
        actorId: adminId,
        metadata: {
          decision: dto.decision,
          notes: dto.notes,
          redemptionId: fraudFlag.redemptionId,
        },
      },
    });

    return updated;
  }

  async getFraudFlagDetails(fraudFlagId: string) {
    const fraudFlag = await this.prisma.fraudFlag.findUnique({
      where: { id: fraudFlagId },
    });

    if (!fraudFlag) {
      throw new NotFoundException('Fraud flag not found');
    }

    // Fetch related redemption session separately
    const redemptionSession = await this.prisma.redemptionSession.findUnique({
      where: { id: fraudFlag.redemptionId },
      select: {
        id: true,
        code: true,
        offerId: true,
        createdAt: true,
        status: true,
        userId: true,
      },
    });

    let user: any = null;
    if (redemptionSession?.userId) {
      user = await this.prisma.user.findUnique({
        where: { id: redemptionSession.userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      });
    }

    return {
      ...fraudFlag,
      redemptionSession: redemptionSession ? {
        ...redemptionSession,
        user,
      } : null,
    };
  }

  async getAuditLogs(params: {
    page?: number;
    limit?: number;
    entity?: string;
    action?: string;
    search?: string;
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};
    if (params.entity && params.entity !== 'all') {
      where.entity = params.entity;
    }
    if (params.action && params.action !== 'all') {
      where.action = params.action;
    }
    if (params.search) {
      where.OR = [
        { entityId: { contains: params.search, mode: 'insensitive' } },
        { action: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: {
            select: { id: true, name: true, email: true, role: true },
          },
          merchant: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
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

  // ─────────────────────────────────────────────────────────────────────────
  // SUBSCRIPTION PLANS & MONETIZATION
  // ─────────────────────────────────────────────────────────────────────────

  async createPlan(dto: any, adminId: string) {
    const existing = await this.prisma.subscriptionPlan.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new BadRequestException(`Plan code ${dto.code} already exists`);
    }

    const entitlements = dto.entitlementsJson ?? dto.entitlements ?? {};

    const plan = await this.prisma.subscriptionPlan.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        audience: dto.audience,
        priceNpr: dto.priceNpr,
        billingCycle: dto.billingCycle,
        durationDays: dto.durationDays ?? 30,
        trialDays: dto.trialDays ?? 0,
        isActive: dto.isActive ?? true,
        isPublic: dto.isPublic ?? true,
        entitlementsJson: entitlements,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        entity: 'SubscriptionPlan',
        entityId: plan.id,
        action: 'create',
        actorId: adminId,
        metadata: { code: plan.code, audience: plan.audience, priceNpr: plan.priceNpr },
      },
    });

    return plan;
  }

  async listPlans(params?: { audience?: any; includeArchived?: boolean }) {
    const where: any = {};
    if (params?.audience && params.audience !== 'all') {
      where.audience = params.audience;
    }
    if (!params?.includeArchived) {
      where.isArchived = false;
    }

    const plans = await this.prisma.subscriptionPlan.findMany({
      where,
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
        subscriptions: {
          where: { status: 'ACTIVE' },
          select: { id: true },
        },
      },
      orderBy: [{ audience: 'asc' }, { priceNpr: 'asc' }],
    });

    return plans.map((plan) => {
      const activeCount = plan.subscriptions?.length || 0;
      const totalCount = plan._count?.subscriptions || 0;
      const { subscriptions, _count, ...rest } = plan as any;
      return {
        ...rest,
        activeSubscribersCount: activeCount,
        totalSubscribersCount: totalCount,
      };
    });
  }

  async updatePlan(id: string, dto: any, adminId: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Subscription plan not found');

    const entitlements = dto.entitlementsJson !== undefined
      ? dto.entitlementsJson
      : dto.entitlements !== undefined
        ? dto.entitlements
        : undefined;

    const updated = await this.prisma.subscriptionPlan.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.priceNpr !== undefined && { priceNpr: dto.priceNpr }),
        ...(dto.billingCycle && { billingCycle: dto.billingCycle }),
        ...(dto.durationDays !== undefined && { durationDays: dto.durationDays }),
        ...(dto.trialDays !== undefined && { trialDays: dto.trialDays }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
        ...(entitlements !== undefined && { entitlementsJson: entitlements }),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        entity: 'SubscriptionPlan',
        entityId: id,
        action: 'update',
        actorId: adminId,
        metadata: { changes: dto },
      },
    });

    return updated;
  }

  async deletePlan(id: string, adminId: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Subscription plan not found');

    // Soft delete / archive to protect existing subscribers
    const updated = await this.prisma.subscriptionPlan.update({
      where: { id },
      data: {
        isActive: false,
        isArchived: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        entity: 'SubscriptionPlan',
        entityId: id,
        action: 'delete_archive',
        actorId: adminId,
        metadata: { planCode: plan.code },
      },
    });

    return { message: 'Plan archived successfully. Active subscriptions remain intact.' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GLOBAL TRIAL CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────

  async getTrialConfigs() {
    return this.prisma.systemTrialConfig.findMany();
  }

  async updateTrialConfig(dto: any, adminId: string) {
    const config = await this.prisma.systemTrialConfig.upsert({
      where: { audience: dto.audience },
      create: {
        audience: dto.audience,
        isEnabled: dto.isEnabled ?? true,
        defaultPeriodDays: dto.defaultPeriodDays ?? 180,
        unlimitedRedeems: dto.unlimitedRedeems ?? true,
        notes: dto.notes,
      },
      update: {
        ...(dto.isEnabled !== undefined && { isEnabled: dto.isEnabled }),
        ...(dto.defaultPeriodDays !== undefined && { defaultPeriodDays: dto.defaultPeriodDays }),
        ...(dto.unlimitedRedeems !== undefined && { unlimitedRedeems: dto.unlimitedRedeems }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        entity: 'SystemTrialConfig',
        entityId: config.id,
        action: 'update',
        actorId: adminId,
        metadata: { audience: dto.audience, isEnabled: config.isEnabled, defaultPeriodDays: config.defaultPeriodDays },
      },
    });

    return config;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUBSCRIPTION MANUAL OVERRIDES & EXCEPTIONS
  // ─────────────────────────────────────────────────────────────────────────

  async overrideSubscription(dto: any, adminId: string) {
    if (!dto.merchantId && !dto.userId) {
      throw new BadRequestException('Either merchantId or userId must be specified');
    }

    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: dto.planId } });
    if (!plan) throw new NotFoundException('Plan not found');

    const now = new Date();
    // Resolve the override mode — default to REPLACE if not specified
    const mode: SubscriptionOverrideMode = dto.mode ?? SubscriptionOverrideMode.REPLACE;

    let whereClause: any = {};
    if (dto.merchantId) whereClause.merchantId = dto.merchantId;
    if (dto.userId) whereClause.userId = dto.userId;

    const existing = await this.prisma.subscriptionRecord.findFirst({
      where: { ...whereClause, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    // Fallback: find the most recent record even if not ACTIVE
    const existingAny = existing ?? await this.prisma.subscriptionRecord.findFirst({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });

    let newPeriodStart: Date;
    let newPeriodEnd: Date;

    switch (mode) {
      case SubscriptionOverrideMode.REPLACE: {
        // Set exact duration starting from now — completely resets existing period
        const days = dto.customDays ?? plan.durationDays ?? 30;
        newPeriodStart = now;
        newPeriodEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        break;
      }
      case SubscriptionOverrideMode.EXTEND: {
        // Stack additional days on top of current period (or now if expired)
        const days = dto.customDays ?? plan.durationDays ?? 30;
        const base = existingAny?.currentPeriodEnd && existingAny.currentPeriodEnd > now
          ? existingAny.currentPeriodEnd
          : now;
        newPeriodStart = now;
        newPeriodEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
        break;
      }
      case SubscriptionOverrideMode.RENEW: {
        // Fresh cycle using the plan's default duration (customDays overrides if provided)
        const days = dto.customDays ?? plan.durationDays ?? 30;
        newPeriodStart = now;
        newPeriodEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        break;
      }
      default:
        throw new BadRequestException(`Unknown override mode: ${mode}`);
    }

    // Capture previousPeriodEnd before updates.
    // If no explicit DB record exists yet, check if entity had an active virtual trial (e.g. merchant onboarding 180 days)
    let previousPeriodEnd: Date | null = existingAny?.currentPeriodEnd ?? null;
    if (!previousPeriodEnd && dto.merchantId) {
      const merchant = await this.prisma.merchant.findUnique({
        where: { id: dto.merchantId },
        select: { createdAt: true },
      });
      if (merchant?.createdAt) {
        previousPeriodEnd = new Date(merchant.createdAt.getTime() + 180 * 24 * 60 * 60 * 1000);
      }
    }

    let subscription;
    if (existingAny) {
      subscription = await this.prisma.subscriptionRecord.update({
        where: { id: existingAny.id },
        data: {
          planId: plan.id,
          status: 'ACTIVE',
          isTrial: dto.isTrial ?? false,
          currentPeriodStart: newPeriodStart,
          currentPeriodEnd: newPeriodEnd,
          isManualOverride: true,
          overrideReason: dto.reason,
          overrideAdminId: adminId,
        },
      });
    } else {
      subscription = await this.prisma.subscriptionRecord.create({
        data: {
          planId: plan.id,
          merchantId: dto.merchantId ?? null,
          userId: dto.userId ?? null,
          status: 'ACTIVE',
          isTrial: dto.isTrial ?? false,
          startedAt: now,
          currentPeriodStart: newPeriodStart,
          currentPeriodEnd: newPeriodEnd,
          isManualOverride: true,
          overrideReason: dto.reason,
          overrideAdminId: adminId,
        },
      });
    }

    const durationDays = Math.ceil(
      (newPeriodEnd.getTime() - newPeriodStart.getTime()) / (1000 * 60 * 60 * 24),
    );

    await this.prisma.auditLog.create({
      data: {
        entity: 'SubscriptionRecord',
        entityId: subscription.id,
        action: 'manual_override',
        actorId: adminId,
        merchantId: dto.merchantId ?? null,
        metadata: {
          planCode: plan.code,
          mode,
          durationDays,
          previousPeriodEnd,
          newPeriodEnd: subscription.currentPeriodEnd,
          reason: dto.reason,
        },
      },
    });

    return subscription;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PAYMENTS & TRANSACTIONS LEDGER
  // ─────────────────────────────────────────────────────────────────────────

  async listPayments(params?: {
    page?: number;
    limit?: number;
    gateway?: string;
    status?: string;
    search?: string;
  }) {
    const page = Math.max(1, Number(params?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params?.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentTransactionWhereInput = {};
    if (params?.gateway && params.gateway !== 'all') {
      where.gateway = params.gateway as any;
    }
    if (params?.status && params.status !== 'all') {
      where.status = params.status as any;
    }
    if (params?.search) {
      where.OR = [
        { orderId: { contains: params.search, mode: 'insensitive' } },
        { gatewayRefId: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [payments, total] = await Promise.all([
      this.prisma.paymentTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          subscription: {
            include: {
              plan: { select: { id: true, code: true, name: true, priceNpr: true } },
            },
          },
          invoice: true,
        },
      }),
      this.prisma.paymentTransaction.count({ where }),
    ]);

    return {
      data: payments,
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

  async verifyManualPayment(transactionId: string, adminId: string, notes?: string) {
    const transaction = await this.prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException('Payment transaction not found');
    }

    if (transaction.status === 'SUCCESS') {
      return { success: true, message: 'Transaction is already verified and marked as SUCCESS' };
    }

    const now = new Date();

    // Find the associated subscription plan based on amount or existing subscription
    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: { priceNpr: transaction.amountNpr, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    const planDurationDays = plan?.durationDays || 30;

    // Check existing subscription
    const whereClause: any = transaction.merchantId
      ? { merchantId: transaction.merchantId }
      : { userId: transaction.userId };

    const existingSub = await this.prisma.subscriptionRecord.findFirst({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });

    let subscription;
    if (existingSub) {
      const baseDate = existingSub.currentPeriodEnd > now ? existingSub.currentPeriodEnd : now;
      const newPeriodEnd = new Date(baseDate.getTime() + planDurationDays * 24 * 60 * 60 * 1000);

      subscription = await this.prisma.subscriptionRecord.update({
        where: { id: existingSub.id },
        data: {
          status: 'ACTIVE',
          isTrial: false,
          currentPeriodStart: now,
          currentPeriodEnd: newPeriodEnd,
          isManualOverride: true,
          overrideReason: notes || 'Manually verified by admin',
          overrideAdminId: adminId,
        },
      });
    } else if (plan) {
      const newPeriodEnd = new Date(now.getTime() + planDurationDays * 24 * 60 * 60 * 1000);
      subscription = await this.prisma.subscriptionRecord.create({
        data: {
          planId: plan.id,
          merchantId: transaction.merchantId,
          userId: transaction.userId,
          status: 'ACTIVE',
          isTrial: false,
          startedAt: now,
          currentPeriodStart: now,
          currentPeriodEnd: newPeriodEnd,
          isManualOverride: true,
          overrideReason: notes || 'Manually verified by admin',
          overrideAdminId: adminId,
        },
      });
    }

    // Mark payment success
    const updatedTx = await this.prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: 'SUCCESS',
        gatewayRefId: transaction.gatewayRefId || `MANUAL-${adminId.slice(-6)}`,
        paidAt: now,
        subscriptionId: subscription?.id,
        failureReason: null,
      },
    });

    // Create invoice if none exists
    const existingInvoice = await this.prisma.invoice.findUnique({
      where: { paymentId: transaction.id },
    });

    if (!existingInvoice && subscription) {
      const invoiceNumber = `INV-${now.getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
      await this.prisma.invoice.create({
        data: {
          invoiceNumber,
          subscriptionId: subscription.id,
          paymentId: transaction.id,
          amountNpr: transaction.amountNpr,
          status: 'PAID',
          merchantId: transaction.merchantId,
          userId: transaction.userId,
        },
      });
    }

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        entity: 'PaymentTransaction',
        entityId: transaction.id,
        action: 'verify_manual',
        actorId: adminId,
        metadata: {
          orderId: transaction.orderId,
          amountNpr: Number(transaction.amountNpr),
          notes,
        },
      },
    });

    return {
      success: true,
      message: 'Transaction manually verified and subscription activated successfully',
      transaction: updatedTx,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MERCHANT BILLING OVERVIEW & QUOTA TRACKING
  // ─────────────────────────────────────────────────────────────────────────

  async getMerchantBilling(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');

    // 1. Fetch current subscription
    let subscription = await this.prisma.subscriptionRecord.findFirst({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });

    const now = new Date();

    // If no subscription, check if default founding partner or trial is active
    if (!subscription) {
      const foundingPlan = await this.prisma.subscriptionPlan.findFirst({
        where: { code: 'MERCHANT_FOUNDING' },
      });
      if (foundingPlan) {
        subscription = {
          id: 'trial_sub',
          planId: foundingPlan.id,
          merchantId,
          userId: null,
          status: 'ACTIVE' as any,
          isTrial: true,
          startedAt: merchant.createdAt,
          currentPeriodStart: merchant.createdAt,
          currentPeriodEnd: new Date(merchant.createdAt.getTime() + 180 * 24 * 60 * 60 * 1000),
          gracePeriodEndsAt: null,
          cancelledAt: null,
          autoRenew: true,
          isManualOverride: false,
          overrideReason: null,
          overrideAdminId: null,
          createdAt: merchant.createdAt,
          updatedAt: merchant.createdAt,
          plan: foundingPlan,
        };
      }
    }

    // 2. Compute remaining days
    const periodEnd = subscription?.currentPeriodEnd || now;
    const diffMs = periodEnd.getTime() - now.getTime();
    const remainingDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    // 3. Quota usage
    const [branchCount, activeOfferCount] = await Promise.all([
      this.prisma.merchantBranch.count({ where: { merchantId } }),
      this.prisma.offer.count({ where: { merchantId, isActive: true } }),
    ]);

    const entitlements = (subscription?.plan?.entitlementsJson as any) || {};

    return {
      merchantId,
      merchantName: merchant.name,
      subscription: subscription ? {
        id: subscription.id,
        status: subscription.status,
        isTrial: subscription.isTrial,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        remainingDays,
        isExpiringSoon: remainingDays <= 14,
        isExpired: remainingDays === 0,
        plan: subscription.plan,
      } : null,
      quotas: {
        branches: {
          used: branchCount,
          max: entitlements.maxBranches ?? 3,
          isUnlimited: entitlements.maxBranches === -1,
          hasReachedLimit: entitlements.maxBranches !== -1 && branchCount >= (entitlements.maxBranches ?? 3),
        },
        offers: {
          used: activeOfferCount,
          max: entitlements.maxActiveOffers ?? 7,
          isUnlimited: entitlements.maxActiveOffers === -1,
          hasReachedLimit: entitlements.maxActiveOffers !== -1 && activeOfferCount >= (entitlements.maxActiveOffers ?? 7),
        },
        featuredBoosts: {
          allowed: entitlements.featuredBoostCount ?? 0,
        },
      },
    };
  }

  /**
   * Broadcast a push notification to all users subscribed to the 'offers_nepal_deals' FCM topic.
   * Gracefully skips if FIREBASE_SERVICE_ACCOUNT_JSON env var is not configured.
   */
  async broadcastPush(dto: {
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<{ sent: boolean; messageId?: string }> {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      new Logger('AdminService').warn(
        'FIREBASE_SERVICE_ACCOUNT_JSON not set — push broadcast skipped.',
      );
      return { sent: false };
    }

    try {
      // Lazy-load firebase-admin to avoid errors when not configured
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const admin = require('firebase-admin');
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
        });
      }
      const messageId = await admin.messaging().send({
        notification: { title: dto.title, body: dto.body },
        data: dto.data ?? {},
        topic: 'offers_nepal_deals',
      });
      return { sent: true, messageId };
    } catch (err: any) {
      new Logger('AdminService').error(
        `Push broadcast failed: ${err?.message ?? err}`,
      );
      return { sent: false };
    }
  }
}
