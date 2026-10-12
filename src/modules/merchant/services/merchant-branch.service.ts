import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { CreateBranchDto } from '../dto/create-branch.dto';
import { UpdateBranchDto } from '../dto/update-branch.dto';
import { ListBranchesDto } from '../../admin/dto/list-branches.dto';
import { AuthenticatedUser } from '../../auth/auth.types';

@Injectable()
export class MerchantBranchService {
  constructor(private readonly prisma: PrismaService) {}

  async createBranch(merchantId: string, dto: CreateBranchDto, user: AuthenticatedUser) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

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
}
