import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { AuthenticatedUser } from '../auth/auth.types';

@Injectable()
export class MerchantService {
  constructor(private readonly prisma: PrismaService) {}

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

  async getMerchant(id: string, user: AuthenticatedUser) {
    // Application-level data scoping
    if (user.role === UserRole.MERCHANT_STAFF || user.role === UserRole.MERCHANT_ADMIN) {
      if (user.merchantId !== id) {
        throw new ForbiddenException('Access denied');
      }
    }

    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }
    return merchant;
  }

  async updateMerchant(id: string, dto: UpdateMerchantDto, user: AuthenticatedUser) {
    // Verify ownership
    await this.getMerchant(id, user);

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

    // Application-level data scoping
    if (user.role === UserRole.MERCHANT_STAFF || user.role === UserRole.MERCHANT_ADMIN) {
      if (user.merchantId !== merchantId) {
        throw new ForbiddenException('Access denied');
      }
    }

    return this.prisma.merchantBranch.findMany({ where });
  }

  async updateBranch(branchId: string, dto: UpdateBranchDto, user: AuthenticatedUser) {
    const branch = await this.prisma.merchantBranch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    // Verify merchant ownership
    await this.getMerchant(branch.merchantId, user);

    return this.prisma.merchantBranch.update({
      where: { id: branchId },
      data: dto,
    });
  }

  async deleteBranch(branchId: string, user: AuthenticatedUser) {
    const branch = await this.prisma.merchantBranch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    // Verify merchant ownership
    await this.getMerchant(branch.merchantId, user);

    return this.prisma.merchantBranch.delete({
      where: { id: branchId },
    });
  }
}
