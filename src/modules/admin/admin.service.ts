import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { Prisma, MerchantStatus, UserRole } from '@prisma/client';
import { ListMerchantsDto } from './dto/list-merchants.dto';
import { ApproveMerchantDto } from './dto/approve-merchant.dto';
import { RejectMerchantDto } from './dto/reject-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { SuspendMerchantDto } from './dto/suspend-merchant.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { ActivateUserDto } from './dto/activate-user.dto';
import { ListFraudFlagsDto } from './dto/list-fraud-flags.dto';
import { ReviewFraudDto, FraudReviewDecision } from './dto/review-fraud.dto';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

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

  async listMerchants(dto: ListMerchantsDto) {
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
        include: {
          branches: true,
        },
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

    const updated = await this.prisma.merchant.update({
      where: { id: dto.merchantId },
      data: {
        status: MerchantStatus.ACTIVE,
        onboardedAt: new Date(),
      },
    });

    // Log audit entry using existing schema
    await this.prisma.auditLog.create({
      data: {
        entity: 'Merchant',
        entityId: dto.merchantId,
        action: 'approve',
        actorId: adminId,
        merchantId: dto.merchantId,
        metadata: { notes: dto.notes },
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

    const updated = await this.prisma.merchant.update({
      where: { id: dto.merchantId },
      data: {
        status: MerchantStatus.ARCHIVED,
      },
    });

    // Log audit entry using existing schema
    await this.prisma.auditLog.create({
      data: {
        entity: 'Merchant',
        entityId: dto.merchantId,
        action: 'reject',
        actorId: adminId,
        merchantId: dto.merchantId,
        metadata: { reason: dto.reason },
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

    return merchant;
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
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.panNumber !== undefined && { panNumber: dto.panNumber }),
        ...(dto.vatNumber !== undefined && { vatNumber: dto.vatNumber }),
        ...(dto.status && { status: dto.status }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
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

  async listUsers(dto: ListUsersDto) {
    const { page = 1, limit = 20, search, role, isActive } = dto;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (role) {
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
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
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
        phone: true,
        avatarUrl: true,
        isVerified: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
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

    return { fraudFlags, total, page: dto.page || 1, limit: dto.limit || 20 };
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
}
