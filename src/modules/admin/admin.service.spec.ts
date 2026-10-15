import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MerchantStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AdminService } from './admin.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

jest.mock('bcrypt');

describe('AdminService', () => {
  let service: AdminService;

  const mockPrisma = {
    merchant: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    merchantStaff: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(AdminService);
  });

  describe('reactivateMerchant', () => {
    it('throws NotFound for an unknown merchant', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue(null);

      await expect(
        service.reactivateMerchant({ merchantId: 'm1' } as any, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an already-ACTIVE merchant', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: 'm1',
        status: MerchantStatus.ACTIVE,
      });

      await expect(
        service.reactivateMerchant({ merchantId: 'm1' } as any, 'admin-1'),
      ).rejects.toThrow('already active');
    });

    it('reactivates a SUSPENDED merchant and writes a reactivate audit row', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: 'm1',
        status: MerchantStatus.SUSPENDED,
      });
      mockPrisma.merchant.update.mockResolvedValue({
        id: 'm1',
        status: MerchantStatus.ACTIVE,
      });

      const result = await service.reactivateMerchant(
        { merchantId: 'm1', notes: 'appeal approved' } as any,
        'admin-1',
      );

      expect(result.status).toBe(MerchantStatus.ACTIVE);
      expect(mockPrisma.merchant.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { status: MerchantStatus.ACTIVE },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entity: 'Merchant',
          entityId: 'm1',
          action: 'reactivate',
          actorId: 'admin-1',
          metadata: { notes: 'appeal approved' },
        }),
      });
    });
  });

  describe('suspendMerchant', () => {
    it('throws NotFound for an unknown merchant', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue(null);

      await expect(
        service.suspendMerchant(
          { merchantId: 'm1', reason: 'violations' } as any,
          'admin-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an already-SUSPENDED merchant', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: 'm1',
        status: MerchantStatus.SUSPENDED,
      });

      await expect(
        service.suspendMerchant(
          { merchantId: 'm1', reason: 'x' } as any,
          'admin-1',
        ),
      ).rejects.toThrow('already suspended');
    });

    it('suspends and writes a suspend audit row with the reason', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: 'm1',
        status: MerchantStatus.ACTIVE,
      });
      mockPrisma.merchant.update.mockResolvedValue({
        id: 'm1',
        status: MerchantStatus.SUSPENDED,
      });

      await service.suspendMerchant(
        { merchantId: 'm1', reason: 'fraud reports' } as any,
        'admin-1',
      );

      expect(mockPrisma.merchant.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { status: MerchantStatus.SUSPENDED },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'suspend',
          metadata: { reason: 'fraud reports' },
        }),
      });
    });
  });

  describe('createMerchant', () => {
    it('rejects a duplicate contactEmail', async () => {
      mockPrisma.merchant.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createMerchant(
          { name: 'X', contactEmail: 'dup@x.com' } as any,
          'admin-1',
        ),
      ).rejects.toThrow('already exists');
    });

    it('creates an ACTIVE merchant, maps panNumber to registrationNumber, audits', async () => {
      mockPrisma.merchant.findFirst.mockResolvedValue(null);
      mockPrisma.merchant.create.mockResolvedValue({
        id: 'm-new',
        name: 'New Shop',
        status: MerchantStatus.ACTIVE,
      });

      const result = await service.createMerchant(
        {
          name: 'New Shop',
          contactEmail: 'new@x.com',
          panNumber: 'PAN-123',
          vatNumber: 'VAT-9',
        } as any,
        'admin-1',
      );

      expect(result.id).toBe('m-new');
      expect(mockPrisma.merchant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: MerchantStatus.ACTIVE,
          registrationNumber: 'PAN-123',
          vatNumber: 'VAT-9',
          contactEmail: 'new@x.com',
        }),
      });
      expect(
        mockPrisma.merchant.create.mock.calls[0][0].data.onboardedAt,
      ).toBeInstanceOf(Date);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'create_merchant' }),
      });
    });
  });

  describe('createUser', () => {
    it('rejects a duplicate email (case-insensitive, trimmed)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createUser(
          { email: '  Dup@Example.COM ', password: 'Pw1!' } as any,
          'admin-1',
        ),
      ).rejects.toThrow('already exists');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'dup@example.com' } }),
      );
    });

    it('hashes the password, defaults role to USER, and audits', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
      mockPrisma.user.create.mockResolvedValue({
        id: 'u-new',
        email: 'new@x.com',
        role: UserRole.USER,
      });

      const result = await service.createUser(
        { email: 'New@Example.com', password: 'Pw1!' } as any,
        'admin-1',
      );

      expect(bcrypt.hash).toHaveBeenCalledWith('Pw1!', 10);
      expect(result.id).toBe('u-new');
      expect(result).not.toHaveProperty('passwordHash');
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'new@example.com',
            passwordHash: 'hashed-pw',
            role: UserRole.USER,
            emailVerified: true,
            isActive: true,
          }),
        }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'create_user' }),
      });
    });

    it('links a merchantStaff row when role is merchant-scoped and merchantId given', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
      mockPrisma.user.create.mockResolvedValue({
        id: 'u-staff',
        email: 's@x.com',
        role: UserRole.MERCHANT_STAFF,
      });

      await service.createUser(
        {
          email: 's@x.com',
          password: 'Pw1!',
          role: UserRole.MERCHANT_STAFF,
          merchantId: 'mer-9',
        } as any,
        'admin-1',
      );

      expect(mockPrisma.merchantStaff.create).toHaveBeenCalledWith({
        data: {
          userId: 'u-staff',
          merchantId: 'mer-9',
          role: UserRole.MERCHANT_STAFF,
        },
      });
    });

    it('does NOT link a staff row for a plain USER even with merchantId', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
      mockPrisma.user.create.mockResolvedValue({
        id: 'u-plain',
        email: 'p@x.com',
        role: UserRole.USER,
      });

      await service.createUser(
        { email: 'p@x.com', password: 'Pw1!', merchantId: 'mer-9' } as any,
        'admin-1',
      );

      expect(mockPrisma.merchantStaff.create).not.toHaveBeenCalled();
    });
  });
});

