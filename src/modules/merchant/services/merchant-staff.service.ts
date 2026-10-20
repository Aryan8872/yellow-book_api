import { Injectable, NotFoundException, ForbiddenException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { CreateStaffDto } from '../dto/create-staff.dto';
import { UpdateStaffDto } from '../dto/update-staff.dto';
import { UpdatePinDto } from '../dto/update-pin.dto';
import { MERCHANT_CONSTANTS } from '../merchant.constants';
import { AuthenticatedUser } from '../../auth/auth.types';

@Injectable()
export class MerchantStaffService {
  constructor(private readonly prisma: PrismaService) {}

  private generatePin(): string {
    const { PIN_MIN, PIN_MAX } = MERCHANT_CONSTANTS;
    return Math.floor(PIN_MIN + Math.random() * (PIN_MAX - PIN_MIN + 1)).toString();
  }

  private async hashPin(pin: string): Promise<string> {
    const saltRounds = MERCHANT_CONSTANTS.PIN_SALT_ROUNDS;
    return bcrypt.hash(pin, saltRounds);
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

  async createStaff(merchantId: string, dto: CreateStaffDto, user: AuthenticatedUser) {
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

    const pin = this.generatePin();
    const pinHash = await this.hashPin(pin);

    const staff = await this.prisma.merchantStaff.create({
      data: {
        merchantId,
        userId: newUser.id,
        role: dto.role,
        ...(dto.permissions ? { permissions: dto.permissions } : {}),
        isActive: true,
      },
    });

    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { merchantPinHash: pinHash },
    });

    const { passwordHash: _omit, ...safeUser } = newUser;
    return { staff, user: safeUser, pin };
  }

  async getStaff(merchantId: string, dto?: { page?: number; limit?: number; search?: string; isActive?: boolean }, user?: AuthenticatedUser) {
    const page = dto?.page && dto.page > 0 ? Number(dto.page) : 1;
    const limit = dto?.limit && dto.limit > 0 ? Number(dto.limit) : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.MerchantStaffWhereInput = { merchantId };

    if (dto?.isActive !== undefined) {
      where.isActive = dto.isActive;
    }

    if (dto?.search?.trim()) {
      const q = dto.search.trim();
      where.user = {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
        ],
      };
    }

    const [staff, total] = await Promise.all([
      this.prisma.merchantStaff.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          merchantId: true,
          userId: true,
          role: true,
          permissions: true,
          deviceId: true,
          isActive: true,
          createdAt: true,
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
      }),
      this.prisma.merchantStaff.count({ where }),
    ]);

    return {
      data: staff,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasNext: page * limit < total,
        hasPrevious: page > 1,
      },
    };
  }

  async updateStaff(staffId: string, merchantId: string, dto: UpdateStaffDto, user: AuthenticatedUser) {
    const staff = await this.prisma.merchantStaff.findUnique({
      where: { id: staffId },
      include: { user: true },
    });

    if (!staff) {
      throw new NotFoundException('Staff not found');
    }

    if (staff.merchantId !== merchantId) {
      throw new ForbiddenException('Staff does not belong to this merchant');
    }

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
    const passwordValid = await this.verifyMerchantPassword(merchantId, dto.currentPassword);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid merchant password');
    }

    const pinHash = await this.hashPin(dto.newPin);

    return this.prisma.merchant.update({
      where: { id: merchantId },
      data: { merchantPinHash: pinHash },
    });
  }
}
