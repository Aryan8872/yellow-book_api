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

  // Staff CRUD
  async createStaff(merchantId: string, dto: CreateStaffDto, user: AuthenticatedUser) {
    // Verify merchant ownership
    await this.getMerchant(merchantId, user);

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Create user with temporary password (will be reset)
    const tempPassword = Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const newUser = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
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

    // Return PIN only once (for communication to staff)
    return { staff, user: newUser, pin, tempPassword };
  }

  async getStaff(merchantId: string, user: AuthenticatedUser) {
    const where: Prisma.MerchantStaffWhereInput = { merchantId };

    // Application-level data scoping
    if (user.role === UserRole.MERCHANT_STAFF || user.role === UserRole.MERCHANT_ADMIN) {
      if (user.merchantId !== merchantId) {
        throw new ForbiddenException('Access denied');
      }
    }

    return this.prisma.merchantStaff.findMany({
      where,
      include: { user: true },
    });
  }

  async updateStaff(staffId: string, dto: UpdateStaffDto, user: AuthenticatedUser) {
    const staff = await this.prisma.merchantStaff.findUnique({
      where: { id: staffId },
      include: { user: true },
    });

    if (!staff) {
      throw new NotFoundException('Staff not found');
    }

    // Verify merchant ownership
    await this.getMerchant(staff.merchantId, user);

    // Update user isActive status (disable on departure)
    if (dto.isActive !== undefined) {
      await this.prisma.user.update({
        where: { id: staff.userId },
        data: { isActive: dto.isActive },
      });
    }

    return this.prisma.merchantStaff.update({
      where: { id: staffId },
      data: { isActive: dto.isActive },
    });
  }

  async updateMerchantPin(merchantId: string, dto: UpdatePinDto, user: AuthenticatedUser) {
    // Verify merchant ownership
    await this.getMerchant(merchantId, user);

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
}
