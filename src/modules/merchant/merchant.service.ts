import { Injectable, NotFoundException, ForbiddenException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { UpdatePinDto } from './dto/update-pin.dto';
import { MERCHANT_CONSTANTS } from './merchant.constants';
import { AuthenticatedUser } from '../auth/auth.types';
import { ListMerchantsDto } from '../admin/dto/list-merchants.dto';
import { ListBranchesDto } from '../admin/dto/list-branches.dto';
import { ListMerchantRedemptionsDto } from './dto/list-merchant-redemptions.dto';
import { ListMerchantOffersDto } from './dto/list-merchant-offers.dto';
import { TimeRangeDto } from '../analytics/dto/time-range.dto';

@Injectable()
export class MerchantService {
  constructor(private readonly prisma: PrismaService) {}

  // PIN utilities
  private generatePin(): string {
    const { PIN_MIN, PIN_MAX } = MERCHANT_CONSTANTS;
    return Math.floor(PIN_MIN + Math.random() * (PIN_MAX - PIN_MIN + 1)).toString();
  }

  private async hashPin(pin: string): Promise<string> {
    const saltRounds = MERCHANT_CONSTANTS.PIN_SALT_ROUNDS;
    return bcrypt.hash(pin, saltRounds);
  }

  private async verifyPin(pin: string, hash: string): Promise<boolean> {
    return bcrypt.compare(pin, hash);
  }

  private async verifyMerchantPassword(merchantId: string, password: string): Promise<boolean> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { staff: { include: { user: true } } },
    });

    if (!merchant?.staff?.[0]?.user?.passwordHash) {
      return false;
    }

    return bcrypt.compare(password, merchant.staff[0].user.passwordHash);
  }

  // Merchant CRUD
  async createMerchant(dto: CreateMerchantDto, user: AuthenticatedUser) {
    const merchant = await this.prisma.merchant.create({
      data: {
        ...dto,
        status: 'PENDING_REVIEW',
      },
    });
    return merchant;
  }

  async listAllMerchants(dto: ListMerchantsDto) {
    const { page, limit, search, status, sortBy, sortOrder } = dto;
    const skip = (page - 1) * limit;

    const where: Prisma.MerchantWhereInput = {};

    if (status) {
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
        orderBy,
      }),
      this.prisma.merchant.count({ where }),
    ]);

    return {
      data: merchants,
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

  async getMerchant(id: string, user: AuthenticatedUser) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }
    return merchant;
  }

  async updateMerchant(id: string, dto: UpdateMerchantDto, user: AuthenticatedUser) {
    return this.prisma.merchant.update({
      where: { id },
      data: dto,
    });
  }

  // Branch CRUD
  async createBranch(merchantId: string, dto: CreateBranchDto, user: AuthenticatedUser) {
    // Verify merchant ownership
    await this.getMerchant(merchantId, user);

    return this.prisma.merchantBranch.create({
      data: {
        merchantId,
        ...dto,
      },
    });
  }

  async getBranches(merchantId: string, user: AuthenticatedUser) {
    const where: Prisma.MerchantBranchWhereInput = { merchantId };
    return this.prisma.merchantBranch.findMany({ where });
  }

  async listAllBranches(dto: ListBranchesDto) {
    const { page, limit, search, merchantId, district, isActive, sortBy, sortOrder } = dto;
    const skip = (page - 1) * limit;

    const where: Prisma.MerchantBranchWhereInput = {};

    if (merchantId) {
      where.merchantId = merchantId;
    }

    if (district) {
      where.district = district;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.MerchantBranchOrderByWithRelationInput = {};
    if (sortBy) {
      orderBy[sortBy] = sortOrder || 'asc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [branches, total] = await Promise.all([
      this.prisma.merchantBranch.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          merchant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.merchantBranch.count({ where }),
    ]);

    return {
      data: branches,
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

  async updateBranch(branchId: string, merchantId: string, dto: UpdateBranchDto, user: AuthenticatedUser) {
    const branch = await this.prisma.merchantBranch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    // Verify branch belongs to the merchant
    if (branch.merchantId !== merchantId) {
      throw new ForbiddenException('Branch does not belong to this merchant');
    }

    const dataToUpdate: Record<string, unknown> = {};
    if (dto.name !== undefined) dataToUpdate.name = dto.name;
    if (dto.address !== undefined) dataToUpdate.address = dto.address;
    if (dto.district !== undefined) dataToUpdate.district = dto.district;
    if (dto.lat !== undefined) dataToUpdate.lat = dto.lat;
    if (dto.lng !== undefined) dataToUpdate.lng = dto.lng;
    if (dto.phone !== undefined) dataToUpdate.phone = dto.phone;
    if (dto.isActive !== undefined) dataToUpdate.isActive = dto.isActive;
    if (dto.operatingHours !== undefined) dataToUpdate.operatingHours = dto.operatingHours;

    return this.prisma.merchantBranch.update({
      where: { id: branchId },
      data: dataToUpdate,
    });
  }

  async deleteBranch(branchId: string, merchantId: string, user: AuthenticatedUser) {
    const branch = await this.prisma.merchantBranch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (branch.merchantId !== merchantId) {
      throw new ForbiddenException('Branch does not belong to this merchant');
    }

    return this.prisma.merchantBranch.delete({
      where: { id: branchId },
    });
  }

  // Staff CRUD
  async createStaff(merchantId: string, dto: CreateStaffDto, user: AuthenticatedUser) {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    if (dto.phone) {
      const existingPhone = await this.prisma.user.findFirst({
        where: { phone: dto.phone },
        select: { id: true },
      });
      if (existingPhone) {
        throw new ConflictException('A user with this phone number already exists');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const newUser = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        ...(dto.phone ? { phone: dto.phone } : {}),
        role: dto.role,
        isActive: true,
      },
    });

    // Generate and hash PIN
    const pin = this.generatePin();
    const pinHash = await this.hashPin(pin);

    // Create merchant staff record
    const staff = await this.prisma.merchantStaff.create({
      data: {
        merchantId,
        userId: newUser.id,
        role: dto.role,
        ...(dto.permissions ? { permissions: dto.permissions } : {}),
        isActive: true,
      },
    });

    // Store PIN hash on merchant (not staff - per decision D-03/D-04)
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { merchantPinHash: pinHash },
    });

    // Return PIN only once (for communication to staff). Omit passwordHash.
    const { passwordHash: _omit, ...safeUser } = newUser;
    return { staff, user: safeUser, pin };
  }

  async getStaff(merchantId: string, user: AuthenticatedUser) {
    const where: Prisma.MerchantStaffWhereInput = { merchantId };
    return this.prisma.merchantStaff.findMany({
      where,
      select: {
        id: true,
        merchantId: true,
        userId: true,
        role: true,
        permissions: true,
        deviceId: true,
        isActive: true,
        createdAt: true,
        // Never expose passwordHash to clients
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            role: true,
            isActive: true,
          },
        },
      },
    });
  }

  async updateStaff(staffId: string, merchantId: string, dto: UpdateStaffDto, user: AuthenticatedUser) {
    const staff = await this.prisma.merchantStaff.findUnique({
      where: { id: staffId },
      include: { user: true },
    });

    if (!staff) {
      throw new NotFoundException('Staff not found');
    }

    // Verify staff belongs to the merchant
    if (staff.merchantId !== merchantId) {
      throw new ForbiddenException('Staff does not belong to this merchant');
    }

    // Update user profile fields if provided. An empty-string phone means
    // "clear the field", not "store empty string" (unique constraint).
    const userUpdate: Record<string, any> = {};
    if (dto.name !== undefined) userUpdate.name = dto.name;
    if (dto.email !== undefined) userUpdate.email = dto.email;
    if (dto.phone !== undefined) userUpdate.phone = dto.phone.trim() || null;
    if (dto.isActive !== undefined) userUpdate.isActive = dto.isActive;

    if (Object.keys(userUpdate).length > 0) {
      try {
        await this.prisma.user.update({
          where: { id: staff.userId },
          data: userUpdate,
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
          throw new ConflictException(
            target.includes('phone')
              ? 'A user with this phone number already exists'
              : 'A user with this email already exists',
          );
        }
        throw err;
      }
    }

    // Update staff record
    const staffUpdate: Record<string, any> = {};
    if (dto.role !== undefined) staffUpdate.role = dto.role;
    if (dto.isActive !== undefined) staffUpdate.isActive = dto.isActive;
    if (dto.permissions !== undefined) {
      staffUpdate.permissions = dto.permissions;
    }

    const updated = await this.prisma.merchantStaff.update({
      where: { id: staffId },
      data: staffUpdate,
      include: {
        // Never expose passwordHash to clients
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    // Audit staff permission changes (Task 10). Mirrors the admin.service
    // AuditLog write pattern.
    if (dto.permissions !== undefined) {
      await this.prisma.auditLog.create({
        data: {
          entity: 'MerchantStaff',
          entityId: staffId,
          action: 'update_permissions',
          actorId: user.id,
          merchantId: staff.merchantId,
          metadata: { permissions: dto.permissions },
        },
      });
    }

    return updated;
  }

  async updateMerchantPin(merchantId: string, dto: UpdatePinDto, user: AuthenticatedUser) {
    // Verify merchant's current password
    const passwordValid = await this.verifyMerchantPassword(merchantId, dto.currentPassword);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid merchant password');
    }

    // Hash new PIN
    const pinHash = await this.hashPin(dto.newPin);

    // Update merchant PIN hash
    return this.prisma.merchant.update({
      where: { id: merchantId },
      data: { merchantPinHash: pinHash },
    });
  }

  // Merchant Dashboard & Analytics
  async getMerchantDashboard(merchantId: string, user: AuthenticatedUser) {
    // Verify ownership
    await this.verifyMerchantAccess(merchantId, user);

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: {
        _count: {
          select: {
            branches: true,
            staff: true,
            offers: true,
          },
        },
      },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    const activeOffers = await this.prisma.offer.count({
      where: {
        merchantId,
        isActive: true,
      },
    });

    const totalRedemptions = await this.prisma.redemptionSession.count({
      where: {
        offer: { merchantId },
      },
    });

    return {
      totalOffers: merchant._count.offers,
      activeOffers,
      totalRedemptions,
      totalBranches: merchant._count.branches,
      totalStaff: merchant._count.staff,
    };
  }

  async getMerchantAnalytics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    // Verify ownership
    await this.verifyMerchantAccess(merchantId, user);

    const { startDate, endDate } = this.getTimeRange(dto);

    const redemptions = await this.prisma.redemptionSession.findMany({
      where: {
        offer: { merchantId },
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        offer: {
          select: {
            id: true,
            title: true,
            category: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by date
    const dailyRedemptions: Record<string, number> = {};
    redemptions.forEach((r) => {
      const date = r.createdAt.toISOString().split('T')[0];
      dailyRedemptions[date] = (dailyRedemptions[date] || 0) + 1;
    });

    // Group by offer
    const offerPerformance: Record<string, number> = {};
    redemptions.forEach((r) => {
      offerPerformance[r.offer.title] = (offerPerformance[r.offer.title] || 0) + 1;
    });

    return {
      totalRedemptions: redemptions.length,
      dailyRedemptions: Object.entries(dailyRedemptions).map(([date, count]) => ({
        date,
        count,
      })),
      topOffers: Object.entries(offerPerformance)
        .map(([title, count]) => ({ title, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }

  async getMerchantRedemptions(merchantId: string, dto: ListMerchantRedemptionsDto, user: AuthenticatedUser) {
    // Verify ownership
    await this.verifyMerchantAccess(merchantId, user);

    const { page = 1, limit = 20, search, status, startDate, endDate, offerId, branchId, sortBy = 'createdAt', sortOrder = 'desc' } = dto;

    const where: Prisma.RedemptionSessionWhereInput = {
      offer: { merchantId },
    };

    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { offer: { title: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (offerId) {
      where.offerId = offerId;
    }

    if (branchId) {
      where.branchId = branchId;
    }

    const [redemptions, total] = await Promise.all([
      this.prisma.redemptionSession.findMany({
        where,
        include: {
          offer: {
            select: {
              id: true,
              title: true,
              category: true,
              originalPriceNpr: true,
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.redemptionSession.count({ where }),
    ]);

    return {
      data: redemptions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMerchantOffers(
    merchantId: string,
    dto: ListMerchantOffersDto,
    user: AuthenticatedUser,
  ) {
    // Verify ownership
    await this.verifyMerchantAccess(merchantId, user);

    const { page = 1, limit = 20, search, category, isActive, isFeatured, sortBy = 'createdAt', sortOrder = 'desc' } = dto;

    const where: Prisma.OfferWhereInput = { merchantId };

    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    if (category) {
      // Accept either the category id or its slug (mirrors the public
      // offers endpoint).
      where.OR = [
        { categoryId: category },
        { category: { slug: { equals: category.toLowerCase(), mode: 'insensitive' } } },
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (isFeatured !== undefined) {
      where.isFeatured = isFeatured;
    }

    const [offers, total] = await Promise.all([
      this.prisma.offer.findMany({
        where,
        // `sortBy` is whitelisted by the DTO, so this key is always valid.
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.offer.count({ where }),
    ]);

    return {
      data: offers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async verifyMerchantAccess(merchantId: string, user: AuthenticatedUser) {
    if (user.role === UserRole.ADMIN) return;

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { staff: true },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    const hasAccess = merchant.staff.some((s) => s.userId === user.id);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this merchant');
    }
  }

  private getTimeRange(dto: TimeRangeDto): { startDate: Date; endDate: Date } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    if (dto.range === 'custom') {
      startDate = dto.startDate ? new Date(dto.startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      endDate = dto.endDate ? new Date(dto.endDate) : now;
    } else if (dto.range === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (dto.range === '90d') {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    } else {
      // 30d default
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return { startDate, endDate };
  }

  async getMerchantRevenueAnalytics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    await this.verifyMerchantAccess(merchantId, user);
    const { startDate, endDate } = this.getTimeRange(dto);

    // Get total revenue
    const totalRevenueResult = await this.prisma.$queryRaw<Array<{ totalRevenue: bigint }>>`
      SELECT COALESCE(SUM(o."originalPriceNpr"), 0) as "totalRevenue"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
    `;

    const totalRevenue = Number(totalRevenueResult[0]?.totalRevenue || 0);

    // Get revenue by offer
    const revenueByOffer = await this.prisma.$queryRaw<Array<{
      offerId: string;
      offerTitle: string;
      revenue: bigint;
      redemptionCount: bigint;
    }>>`
      SELECT 
        o.id as "offerId",
        o.title as "offerTitle",
        COALESCE(SUM(o."originalPriceNpr"), 0) as revenue,
        COUNT(rs.id) as "redemptionCount"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
      GROUP BY o.id, o.title
      ORDER BY revenue DESC
      LIMIT 10
    `;

    // Get revenue by branch
    const revenueByBranch = await this.prisma.$queryRaw<Array<{
      branchId: string;
      branchName: string;
      revenue: bigint;
      redemptionCount: bigint;
    }>>`
      SELECT 
        b.id as "branchId",
        b.name as "branchName",
        COALESCE(SUM(o."originalPriceNpr"), 0) as revenue,
        COUNT(rs.id) as "redemptionCount"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      JOIN branches b ON rs."branchId" = b.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
      GROUP BY b.id, b.name
      ORDER BY revenue DESC
    `;

    // Get average order value
    const avgOrderValueResult = await this.prisma.$queryRaw<Array<{ avgOrderValue: bigint }>>`
      SELECT COALESCE(AVG(o."originalPriceNpr"), 0) as "avgOrderValue"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
        AND o."originalPriceNpr" IS NOT NULL
    `;

    const averageOrderValue = Number(avgOrderValueResult[0]?.avgOrderValue || 0);

    // Calculate MoM and YoY growth
    const now = new Date();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const lastYearStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const lastYearEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0);

    const lastMonthRevenue = await this.prisma.$queryRaw<Array<{ revenue: bigint }>>`
      SELECT COALESCE(SUM(o."originalPriceNpr"), 0) as revenue
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${lastMonthStart}
        AND rs."redeemedAt" <= ${lastMonthEnd}
    `;

    const lastYearRevenue = await this.prisma.$queryRaw<Array<{ revenue: bigint }>>`
      SELECT COALESCE(SUM(o."originalPriceNpr"), 0) as revenue
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${lastYearStart}
        AND rs."redeemedAt" <= ${lastYearEnd}
    `;

    const mom = Number(lastMonthRevenue[0]?.revenue || 0) > 0
      ? ((totalRevenue - Number(lastMonthRevenue[0]?.revenue || 0)) / Number(lastMonthRevenue[0]?.revenue || 1)) * 100
      : 0;
    const yoy = Number(lastYearRevenue[0]?.revenue || 0) > 0
      ? ((totalRevenue - Number(lastYearRevenue[0]?.revenue || 0)) / Number(lastYearRevenue[0]?.revenue || 1)) * 100
      : 0;

    // Get revenue trend
    const revenueTrend = await this.prisma.$queryRaw<Array<{ date: string; revenue: bigint }>>`
      SELECT 
        DATE(rs."redeemedAt") as date,
        COALESCE(SUM(o."originalPriceNpr"), 0) as revenue
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
      GROUP BY DATE(rs."redeemedAt")
      ORDER BY date ASC
    `;

    return {
      totalRevenue,
      revenueByOffer: revenueByOffer.map(r => ({
        offerId: r.offerId,
        offerTitle: r.offerTitle,
        revenue: Number(r.revenue),
        redemptionCount: Number(r.redemptionCount),
      })),
      revenueByBranch: revenueByBranch.map(r => ({
        branchId: r.branchId,
        branchName: r.branchName,
        revenue: Number(r.revenue),
        redemptionCount: Number(r.redemptionCount),
      })),
      averageOrderValue,
      revenueGrowth: { mom, yoy },
      revenueTrend: revenueTrend.map(r => ({
        date: r.date,
        revenue: Number(r.revenue),
      })),
    };
  }

  async getMerchantCustomerAnalytics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    await this.verifyMerchantAccess(merchantId, user);
    const { startDate, endDate } = this.getTimeRange(dto);

    // Get new vs returning customers
    const newCustomersResult = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT rs."userId") as count
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
        AND rs."userId" NOT IN (
          SELECT DISTINCT rs2."userId"
          FROM "redemption_sessions" rs2
          JOIN offers o2 ON rs2."offerId" = o2.id
          WHERE o2."merchantId" = ${merchantId}
            AND rs2.status = 'REDEEMED'
            AND rs2."redeemedAt" < ${startDate}
        )
    `;

    const returningCustomersResult = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT rs."userId") as count
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
        AND rs."userId" IN (
          SELECT DISTINCT rs2."userId"
          FROM "redemption_sessions" rs2
          JOIN offers o2 ON rs2."offerId" = o2.id
          WHERE o2."merchantId" = ${merchantId}
            AND rs2.status = 'REDEEMED'
            AND rs2."redeemedAt" < ${startDate}
        )
    `;

    const newCustomers = Number(newCustomersResult[0]?.count || 0);
    const returningCustomers = Number(returningCustomersResult[0]?.count || 0);
    const totalCustomers = newCustomers + returningCustomers;
    const retentionRate = totalCustomers > 0 ? (returningCustomers / totalCustomers) * 100 : 0;

    // Get top customers
    const topCustomers = await this.prisma.$queryRaw<Array<{
      userId: string;
      userName: string;
      userEmail: string;
      redemptionCount: bigint;
      totalSpent: bigint;
    }>>`
      SELECT 
        u.id as "userId",
        u.name as "userName",
        u.email as "userEmail",
        COUNT(rs.id) as "redemptionCount",
        COALESCE(SUM(o."originalPriceNpr"), 0) as "totalSpent"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      JOIN users u ON rs."userId" = u.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
      GROUP BY u.id, u.name, u.email
      ORDER BY "redemptionCount" DESC
      LIMIT 10
    `;

    // Get customer acquisition trend
    const customerAcquisitionTrend = await this.prisma.$queryRaw<Array<{ date: string; newCustomers: bigint }>>`
      SELECT 
        DATE(rs."redeemedAt") as date,
        COUNT(DISTINCT rs."userId") as "newCustomers"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
      GROUP BY DATE(rs."redeemedAt")
      ORDER BY date ASC
    `;

    // Get geographic distribution
    const geographicDistribution = await this.prisma.$queryRaw<Array<{ city: string; customerCount: bigint }>>`
      SELECT 
        u.city,
        COUNT(DISTINCT u.id) as "customerCount"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      JOIN users u ON rs."userId" = u.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
        AND u.city IS NOT NULL
      GROUP BY u.city
      ORDER BY "customerCount" DESC
      LIMIT 10
    `;

    return {
      newCustomers,
      returningCustomers,
      retentionRate,
      topCustomers: topCustomers.map(c => ({
        userId: c.userId,
        userName: c.userName,
        userEmail: c.userEmail,
        redemptionCount: Number(c.redemptionCount),
        totalSpent: Number(c.totalSpent),
      })),
      customerAcquisitionTrend: customerAcquisitionTrend.map(c => ({
        date: c.date,
        newCustomers: Number(c.newCustomers),
      })),
      geographicDistribution: geographicDistribution.map(g => ({
        city: g.city,
        customerCount: Number(g.customerCount),
      })),
    };
  }

  async getMerchantOfferPerformanceAnalytics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    await this.verifyMerchantAccess(merchantId, user);
    const { startDate, endDate } = this.getTimeRange(dto);

    // Get conversion rate (views to redemptions) - true views-to-redemptions conversion
    const totalRedemptions = await this.prisma.redemptionSession.count({
      where: {
        offer: { merchantId },
        status: 'REDEEMED',
        redeemedAt: { gte: startDate, lte: endDate },
      },
    });

    const totalViews = await this.prisma.offer.aggregate({
      where: { merchantId },
      _sum: { viewCount: true },
    });

    const totalViewCount = Number(totalViews._sum.viewCount || 0);
    const conversionRate = totalViewCount > 0 ? (totalRedemptions / totalViewCount) * 100 : 0;

    // Get average discount value
    const avgDiscountResult = await this.prisma.$queryRaw<Array<{ avgDiscount: bigint }>>`
      SELECT COALESCE(AVG(o."originalPriceNpr" - o."discountedPriceNpr"), 0) as "avgDiscount"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
    `;

    const averageDiscountValue = Number(avgDiscountResult[0]?.avgDiscount || 0);

    // Get engagement rate (redemptions per view)
    const engagementRate = totalViewCount > 0 ? (totalRedemptions / totalViewCount) * 100 : 0;

    // Get top categories
    const topCategories = await this.prisma.$queryRaw<Array<{
      categoryId: string;
      categoryName: string;
      redemptionCount: bigint;
      revenue: bigint;
    }>>`
      SELECT 
        c.id as "categoryId",
        c.name as "categoryName",
        COUNT(rs.id) as "redemptionCount",
        COALESCE(SUM(o."originalPriceNpr"), 0) as revenue
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      JOIN categories c ON o."categoryId" = c.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
      GROUP BY c.id, c.name
      ORDER BY "redemptionCount" DESC
      LIMIT 10
    `;

    // Get expiration impact
    const expiredOffers = await this.prisma.offer.count({
      where: {
        merchantId,
        validUntil: { lt: new Date() },
      },
    });

    const nearExpiringOffers = await this.prisma.offer.count({
      where: {
        merchantId,
        validUntil: {
          gte: new Date(),
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    });

    const expiredRedemptions = await this.prisma.redemptionSession.count({
      where: {
        offer: { merchantId },
        status: 'EXPIRED',
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    return {
      conversionRate,
      averageDiscountValue,
      engagementRate,
      topCategories: topCategories.map(c => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        redemptionCount: Number(c.redemptionCount),
        revenue: Number(c.revenue),
      })),
      expirationImpact: [
        { expiredOffers, nearExpiringOffers, expiredRedemptions },
      ],
    };
  }

  async getMerchantBranchPerformanceAnalytics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    await this.verifyMerchantAccess(merchantId, user);
    const { startDate, endDate } = this.getTimeRange(dto);

    // Get branch comparison
    const branchComparison = await this.prisma.$queryRaw<Array<{
      branchId: string;
      branchName: string;
      totalRedemptions: bigint;
      totalRevenue: bigint;
      averageRating: number;
      activeOffers: bigint;
    }>>`
      SELECT 
        b.id as "branchId",
        b.name as "branchName",
        COUNT(rs.id) as "totalRedemptions",
        COALESCE(SUM(o."originalPriceNpr"), 0) as "totalRevenue",
        COALESCE(AVG(b.rating), 0) as "averageRating",
        COUNT(DISTINCT o.id) as "activeOffers"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      JOIN branches b ON rs."branchId" = b.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
      GROUP BY b.id, b.name, b.rating
      ORDER BY "totalRedemptions" DESC
    `;

    // Get most/least active branches
    const mostActiveBranch = await this.prisma.$queryRaw<Array<{
      branchId: string;
      branchName: string;
      redemptionCount: bigint;
    }>>`
      SELECT 
        b.id as "branchId",
        b.name as "branchName",
        COUNT(rs.id) as "redemptionCount"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      JOIN branches b ON rs."branchId" = b.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
      GROUP BY b.id, b.name
      ORDER BY "redemptionCount" DESC
      LIMIT 1
    `;

    const leastActiveBranch = await this.prisma.$queryRaw<Array<{
      branchId: string;
      branchName: string;
      redemptionCount: bigint;
    }>>`
      SELECT 
        b.id as "branchId",
        b.name as "branchName",
        COUNT(rs.id) as "redemptionCount"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      JOIN branches b ON rs."branchId" = b.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
      GROUP BY b.id, b.name
      ORDER BY "redemptionCount" ASC
      LIMIT 1
    `;

    // Get branch trends
    const branchTrends = await this.prisma.$queryRaw<Array<{
      branchId: string;
      branchName: string;
      date: string;
      redemptionCount: bigint;
    }>>`
      SELECT 
        b.id as "branchId",
        b.name as "branchName",
        DATE(rs."redeemedAt") as date,
        COUNT(rs.id) as "redemptionCount"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      JOIN branches b ON rs."branchId" = b.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
      GROUP BY b.id, b.name, DATE(rs."redeemedAt")
      ORDER BY date ASC
    `;

    // Get staff efficiency
    const staffEfficiency = await this.prisma.$queryRaw<Array<{
      branchId: string;
      branchName: string;
      staffId: string;
      staffName: string;
      redemptionsHandled: bigint;
      averageTimeToProcess: number;
    }>>`
      SELECT 
        b.id as "branchId",
        b.name as "branchName",
        s.id as "staffId",
        u.name as "staffName",
        COUNT(rs.id) as "redemptionsHandled",
        COALESCE(AVG(EXTRACT(EPOCH FROM (rs."redeemedAt" - rs."createdAt"))), 0) as "averageTimeToProcess"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      JOIN branches b ON rs."branchId" = b.id
      JOIN staff s ON rs."processedByStaffId" = s.id
      JOIN users u ON s."userId" = u.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
      GROUP BY b.id, b.name, s.id, u.name
      ORDER BY "redemptionsHandled" DESC
    `;

    return {
      branchComparison: branchComparison.map(b => ({
        branchId: b.branchId,
        branchName: b.branchName,
        totalRedemptions: Number(b.totalRedemptions),
        totalRevenue: Number(b.totalRevenue),
        averageRating: Number(b.averageRating),
        activeOffers: Number(b.activeOffers),
      })),
      mostActiveBranch: mostActiveBranch[0] ? {
        branchId: mostActiveBranch[0].branchId,
        branchName: mostActiveBranch[0].branchName,
        redemptionCount: Number(mostActiveBranch[0].redemptionCount),
      } : null,
      leastActiveBranch: leastActiveBranch[0] ? {
        branchId: leastActiveBranch[0].branchId,
        branchName: leastActiveBranch[0].branchName,
        redemptionCount: Number(leastActiveBranch[0].redemptionCount),
      } : null,
      branchTrends: branchTrends.map(t => ({
        branchId: t.branchId,
        branchName: t.branchName,
        date: t.date,
        redemptionCount: Number(t.redemptionCount),
      })),
      staffEfficiency: staffEfficiency.map(s => ({
        branchId: s.branchId,
        branchName: s.branchName,
        staffId: s.staffId,
        staffName: s.staffName,
        redemptionsHandled: Number(s.redemptionsHandled),
        averageTimeToProcess: Number(s.averageTimeToProcess),
      })),
    };
  }

  async getMerchantTimeBasedAnalytics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    await this.verifyMerchantAccess(merchantId, user);
    const { startDate, endDate } = this.getTimeRange(dto);

    // Get hourly redemptions
    const hourlyRedemptions = await this.prisma.$queryRaw<Array<{ hour: number; redemptionCount: bigint }>>`
      SELECT 
        EXTRACT(HOUR FROM rs."redeemedAt") as hour,
        COUNT(*) as "redemptionCount"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
      GROUP BY EXTRACT(HOUR FROM rs."redeemedAt")
      ORDER BY hour ASC
    `;

    // Get day of week performance
    const dayOfWeekPerformance = await this.prisma.$queryRaw<Array<{
      day: string;
      redemptionCount: bigint;
      revenue: bigint;
    }>>`
      SELECT 
        TO_CHAR(rs."redeemedAt", 'Day') as day,
        COUNT(*) as "redemptionCount",
        COALESCE(SUM(o."originalPriceNpr"), 0) as revenue
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
      GROUP BY TO_CHAR(rs."redeemedAt", 'Day')
      ORDER BY "redemptionCount" DESC
    `;

    // Get seasonal trends
    const seasonalTrends = await this.prisma.$queryRaw<Array<{
      month: string;
      redemptionCount: bigint;
      revenue: bigint;
    }>>`
      SELECT 
        TO_CHAR(rs."redeemedAt", 'Mon') as month,
        COUNT(*) as "redemptionCount",
        COALESCE(SUM(o."originalPriceNpr"), 0) as revenue
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
      GROUP BY TO_CHAR(rs."redeemedAt", 'Mon')
      ORDER BY month ASC
    `;

    return {
      hourlyRedemptions: hourlyRedemptions.map(h => ({
        hour: Number(h.hour),
        redemptionCount: Number(h.redemptionCount),
      })),
      dayOfWeekPerformance: dayOfWeekPerformance.map(d => ({
        day: d.day.trim(),
        redemptionCount: Number(d.redemptionCount),
        revenue: Number(d.revenue),
      })),
      seasonalTrends: seasonalTrends.map(s => ({
        month: s.month,
        redemptionCount: Number(s.redemptionCount),
        revenue: Number(s.revenue),
      })),
    };
  }

  async getMerchantGrowthMetrics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    await this.verifyMerchantAccess(merchantId, user);
    const { startDate, endDate } = this.getTimeRange(dto);

    // Get MoM growth
    const momGrowth = await this.prisma.$queryRaw<Array<{
      date: string;
      redemptions: bigint;
      revenue: bigint;
      prev_revenue: bigint | null;
      growthRate: number;
    }>>`
      WITH monthly_data AS (
        SELECT 
          DATE_TRUNC('month', rs."redeemedAt") as month,
          COUNT(*) as redemptions,
          COALESCE(SUM(o."originalPriceNpr"), 0) as revenue
        FROM "redemption_sessions" rs
        JOIN offers o ON rs."offerId" = o.id
        WHERE o."merchantId" = ${merchantId}
          AND rs.status = 'REDEEMED'
          AND rs."redeemedAt" >= ${startDate}
          AND rs."redeemedAt" <= ${endDate}
        GROUP BY DATE_TRUNC('month', rs."redeemedAt")
      )
      SELECT 
        TO_CHAR(month, 'YYYY-MM') as date,
        redemptions,
        revenue,
        LAG(revenue) OVER (ORDER BY month) as prev_revenue
      FROM monthly_data
      ORDER BY month ASC
    `;

    const momGrowthWithRate = momGrowth.map((m, i) => ({
      date: m.date,
      redemptions: Number(m.redemptions),
      revenue: Number(m.revenue),
      growthRate: i > 0 && Number(m.prev_revenue) > 0
        ? ((Number(m.revenue) - Number(m.prev_revenue)) / Number(m.prev_revenue)) * 100
        : 0,
    }));

    // Get YoY comparison
    const yoyComparison = await this.prisma.$queryRaw<Array<{
      year: number;
      redemptions: bigint;
      revenue: bigint;
      prev_revenue: bigint | null;
      growthRate: number;
    }>>`
      WITH yearly_data AS (
        SELECT 
          EXTRACT(YEAR FROM rs."redeemedAt") as year,
          COUNT(*) as redemptions,
          COALESCE(SUM(o."originalPriceNpr"), 0) as revenue
        FROM "redemption_sessions" rs
        JOIN offers o ON rs."offerId" = o.id
        WHERE o."merchantId" = ${merchantId}
          AND rs.status = 'REDEEMED'
          AND rs."redeemedAt" >= ${startDate}
          AND rs."redeemedAt" <= ${endDate}
        GROUP BY EXTRACT(YEAR FROM rs."redeemedAt")
      )
      SELECT 
        year,
        redemptions,
        revenue,
        LAG(revenue) OVER (ORDER BY year) as prev_revenue
      FROM yearly_data
      ORDER BY year ASC
    `;

    const yoyComparisonWithRate = yoyComparison.map((y, i) => ({
      year: Number(y.year),
      redemptions: Number(y.redemptions),
      revenue: Number(y.revenue),
      growthRate: i > 0 && Number(y.prev_revenue) > 0
        ? ((Number(y.revenue) - Number(y.prev_revenue)) / Number(y.prev_revenue)) * 100
        : 0,
    }));

    // Get projections (simple linear projection based on recent trend)
    const recentRedemptions = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
    `;

    const recentRevenue = await this.prisma.$queryRaw<Array<{ revenue: bigint }>>`
      SELECT COALESCE(SUM(o."originalPriceNpr"), 0) as revenue
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
    `;

    const daysInRange = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const avgDailyRedemptions = Number(recentRedemptions[0]?.count || 0) / daysInRange;
    const avgDailyRevenue = Number(recentRevenue[0]?.revenue || 0) / daysInRange;

    const projections: Array<{
      date: string;
      projectedRedemptions: number;
      projectedRevenue: number;
    }> = [];
    for (let i = 1; i <= 30; i++) {
      const futureDate = new Date(endDate);
      futureDate.setDate(futureDate.getDate() + i);
      projections.push({
        date: futureDate.toISOString().split('T')[0],
        projectedRedemptions: Math.round(avgDailyRedemptions * i),
        projectedRevenue: Math.round(avgDailyRevenue * i),
      });
    }

    // Get milestones
    const totalRedemptions = await this.prisma.redemptionSession.count({
      where: {
        offer: { merchantId },
        status: 'REDEEMED',
      },
    });

    const milestones = [
      { milestone: '100 Redemptions', achieved: totalRedemptions >= 100 },
      { milestone: '500 Redemptions', achieved: totalRedemptions >= 500 },
      { milestone: '1000 Redemptions', achieved: totalRedemptions >= 1000 },
      { milestone: '5000 Redemptions', achieved: totalRedemptions >= 5000 },
    ];

    return {
      momGrowth: momGrowthWithRate,
      yoyComparison: yoyComparisonWithRate,
      projections,
      milestones,
    };
  }

  async getMerchantCategoryAnalytics(merchantId: string, dto: TimeRangeDto, user: AuthenticatedUser) {
    await this.verifyMerchantAccess(merchantId, user);
    const { startDate, endDate } = this.getTimeRange(dto);

    // Get category ranking
    const categoryRanking = await this.prisma.$queryRaw<Array<{
      categoryId: string;
      categoryName: string;
      redemptionCount: bigint;
      revenue: bigint;
      averageOrderValue: bigint;
    }>>`
      SELECT 
        c.id as "categoryId",
        c.name as "categoryName",
        COUNT(rs.id) as "redemptionCount",
        COALESCE(SUM(o."originalPriceNpr"), 0) as revenue,
        COALESCE(AVG(o."originalPriceNpr"), 0) as "averageOrderValue"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      JOIN categories c ON o."categoryId" = c.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
      GROUP BY c.id, c.name
      ORDER BY "redemptionCount" DESC
    `;

    // Get category trends
    const categoryTrends = await this.prisma.$queryRaw<Array<{
      categoryId: string;
      categoryName: string;
      date: string;
      redemptionCount: bigint;
    }>>`
      SELECT 
        c.id as "categoryId",
        c.name as "categoryName",
        DATE(rs."redeemedAt") as date,
        COUNT(*) as "redemptionCount"
      FROM "redemption_sessions" rs
      JOIN offers o ON rs."offerId" = o.id
      JOIN categories c ON o."categoryId" = c.id
      WHERE o."merchantId" = ${merchantId}
        AND rs.status = 'REDEEMED'
        AND rs."redeemedAt" >= ${startDate}
        AND rs."redeemedAt" <= ${endDate}
      GROUP BY c.id, c.name, DATE(rs."redeemedAt")
      ORDER BY date ASC
    `;

    // Get cross-category behavior
    const crossCategoryBehavior = await this.prisma.$queryRaw<Array<{
      fromCategory: string;
      toCategory: string;
      customerCount: bigint;
    }>>`
      WITH user_categories AS (
        SELECT 
          rs."userId",
          c.name as category,
          ROW_NUMBER() OVER (PARTITION BY rs."userId" ORDER BY rs."redeemedAt") as rn
        FROM "redemption_sessions" rs
        JOIN offers o ON rs."offerId" = o.id
        JOIN categories c ON o."categoryId" = c.id
        WHERE o."merchantId" = ${merchantId}
          AND rs.status = 'REDEEMED'
      ),
      category_transitions AS (
        SELECT 
          c1.category as "fromCategory",
          c2.category as "toCategory",
          COUNT(*) as "customerCount"
        FROM user_categories c1
        JOIN user_categories c2 ON c1."userId" = c2."userId" AND c1.rn + 1 = c2.rn
        WHERE c1.category != c2.category
        GROUP BY c1.category, c2.category
      )
      SELECT * FROM category_transitions
      ORDER BY "customerCount" DESC
      LIMIT 10
    `;

    return {
      categoryRanking: categoryRanking.map(c => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        redemptionCount: Number(c.redemptionCount),
        revenue: Number(c.revenue),
        averageOrderValue: Number(c.averageOrderValue),
      })),
      categoryTrends: categoryTrends.map(c => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        date: c.date,
        redemptionCount: Number(c.redemptionCount),
      })),
      crossCategoryBehavior: crossCategoryBehavior.map(c => ({
        fromCategory: c.fromCategory,
        toCategory: c.toCategory,
        customerCount: Number(c.customerCount),
      })),
    };
  }
}
