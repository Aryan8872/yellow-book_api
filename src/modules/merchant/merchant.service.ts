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

    return this.prisma.merchantStaff.update({
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

  async getMerchantOffers(merchantId: string, query: any, user: AuthenticatedUser) {
    // Verify ownership
    await this.verifyMerchantAccess(merchantId, user);

    const { page = 1, limit = 20, search, category, isActive, isFeatured, sortBy = 'createdAt', sortOrder = 'desc' } = query;

    const where: Prisma.OfferWhereInput = { merchantId };

    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    if (category) {
      where.category = category;
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
    } else {
      // 30d default
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return { startDate, endDate };
  }
}
