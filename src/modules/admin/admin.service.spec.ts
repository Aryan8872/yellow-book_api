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
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    merchantStaff: {
      create: jest.fn(),
    },
    offer: {
      count: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    fraudFlag: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    redemptionSession: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock transaction to resolve with the first callback result
    mockPrisma.$transaction.mockImplementation((callback) => callback(mockPrisma));

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

  describe('getDashboardStats', () => {
    it('returns dashboard statistics', async () => {
      mockPrisma.merchant.count.mockResolvedValueOnce(100);
      mockPrisma.merchant.count.mockResolvedValueOnce(10);
      mockPrisma.user.count.mockResolvedValue(500);
      mockPrisma.offer.count.mockResolvedValue(50);

      const result = await service.getDashboardStats();

      expect(result).toEqual({
        totalMerchants: 100,
        pendingMerchants: 10,
        totalUsers: 500,
        activeOffers: 50,
      });
    });
  });

  describe('listMerchants', () => {
    it('returns paginated merchants with default sorting', async () => {
      mockPrisma.merchant.findMany.mockResolvedValue([{ id: 'm1' }]);
      mockPrisma.merchant.count.mockResolvedValue(1);

      const result = await service.listMerchants({ page: 1, limit: 20 } as any);

      expect(result.data).toHaveLength(1);
      expect(result.pagination).toHaveProperty('total', 1);
      expect(mockPrisma.merchant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('filters by status and search', async () => {
      mockPrisma.merchant.findMany.mockResolvedValue([]);
      mockPrisma.merchant.count.mockResolvedValue(0);

      await service.listMerchants({
        page: 1,
        limit: 20,
        status: MerchantStatus.ACTIVE,
        search: 'test',
      } as any);

      expect(mockPrisma.merchant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: MerchantStatus.ACTIVE,
            OR: expect.arrayContaining([
              expect.objectContaining({ name: expect.any(Object) }),
            ]),
          }),
        }),
      );
    });
  });

  describe('approveMerchant', () => {
    it('approves a pending merchant and logs audit', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: 'm1',
        status: MerchantStatus.PENDING_REVIEW,
      });
      mockPrisma.merchant.update.mockResolvedValue({
        id: 'm1',
        status: MerchantStatus.ACTIVE,
      });

      const result = await service.approveMerchant(
        { merchantId: 'm1', notes: 'approved' } as any,
        'admin-1',
      );

      expect(result.status).toBe(MerchantStatus.ACTIVE);
      expect(mockPrisma.merchant.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: expect.objectContaining({
          status: MerchantStatus.ACTIVE,
          onboardedAt: expect.any(Date),
        }),
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'approve',
          actorId: 'admin-1',
        }),
      });
    });

    it('throws if merchant not found', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue(null);

      await expect(
        service.approveMerchant({ merchantId: 'm1' } as any, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws if merchant not pending', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: 'm1',
        status: MerchantStatus.ACTIVE,
      });

      await expect(
        service.approveMerchant({ merchantId: 'm1' } as any, 'admin-1'),
      ).rejects.toThrow('not pending review');
    });
  });

  describe('rejectMerchant', () => {
    it('rejects a pending merchant and logs audit', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: 'm1',
        status: MerchantStatus.PENDING_REVIEW,
      });
      mockPrisma.merchant.update.mockResolvedValue({
        id: 'm1',
        status: MerchantStatus.ARCHIVED,
      });

      const result = await service.rejectMerchant(
        { merchantId: 'm1', reason: 'invalid docs' } as any,
        'admin-1',
      );

      expect(result.status).toBe(MerchantStatus.ARCHIVED);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'reject',
          metadata: { reason: 'invalid docs' },
        }),
      });
    });
  });

  describe('getMerchantDetails', () => {
    it('returns merchant with branches and offers', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: 'm1',
        name: 'Test Merchant',
        branches: [],
        offers: [],
        _count: { branches: 0, offers: 0 },
      });

      const result = await service.getMerchantDetails('m1');

      expect(result).toHaveProperty('id', 'm1');
      expect(mockPrisma.merchant.findUnique).toHaveBeenCalledWith({
        where: { id: 'm1' },
        include: expect.objectContaining({
          branches: true,
          offers: expect.objectContaining({
            where: { isActive: true },
          }),
          _count: expect.any(Object),
        }),
      });
    });

    it('throws if merchant not found', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue(null);

      await expect(service.getMerchantDetails('m1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateMerchant', () => {
    it('updates merchant and logs audit', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({ id: 'm1' });
      mockPrisma.merchant.update.mockResolvedValue({
        id: 'm1',
        name: 'Updated Name',
      });

      const result = await service.updateMerchant(
        'm1',
        { name: 'Updated Name' } as any,
        'admin-1',
      );

      expect(result.name).toBe('Updated Name');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'update',
          actorId: 'admin-1',
        }),
      });
    });
  });

  describe('listUsers', () => {
    it('returns paginated users', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.listUsers({ page: 1, limit: 20 } as any);

      expect(result.data).toHaveLength(1);
      expect(result.pagination).toHaveProperty('total', 1);
    });

    it('filters by role and status', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await service.listUsers({
        page: 1,
        limit: 20,
        role: UserRole.ADMIN,
        isActive: true,
      } as any);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: UserRole.ADMIN,
            isActive: true,
          }),
        }),
      );
    });
  });

  describe('suspendUser', () => {
    it('suspends user and logs audit', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        role: UserRole.USER,
        isActive: true,
      });
      mockPrisma.user.update.mockResolvedValue({
        id: 'u1',
        isActive: false,
      });

      const result = await service.suspendUser(
        { userId: 'u1', reason: 'violation' } as any,
        'admin-1',
      );

      expect(result.isActive).toBe(false);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'suspend',
          metadata: { reason: 'violation' },
        }),
      });
    });

    it('throws if user is admin', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        role: UserRole.ADMIN,
      });

      await expect(
        service.suspendUser({ userId: 'u1' } as any, 'admin-1'),
      ).rejects.toThrow('Cannot suspend admin users');
    });

    it('throws if user already suspended', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        role: UserRole.USER,
        isActive: false,
      });

      await expect(
        service.suspendUser({ userId: 'u1' } as any, 'admin-1'),
      ).rejects.toThrow('already suspended');
    });
  });

  describe('activateUser', () => {
    it('activates user and logs audit', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        isActive: false,
      });
      mockPrisma.user.update.mockResolvedValue({
        id: 'u1',
        isActive: true,
      });

      const result = await service.activateUser(
        { userId: 'u1', notes: 'reactivated' } as any,
        'admin-1',
      );

      expect(result.isActive).toBe(true);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'activate',
          metadata: { notes: 'reactivated' },
        }),
      });
    });

    it('throws if user already active', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        isActive: true,
      });

      await expect(
        service.activateUser({ userId: 'u1' } as any, 'admin-1'),
      ).rejects.toThrow('already active');
    });
  });

  describe('getUserDetails', () => {
    it('returns user details', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const result = await service.getUserDetails('u1');

      expect(result).toHaveProperty('id', 'u1');
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'u1' },
        select: expect.any(Object),
      });
    });

    it('throws if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getUserDetails('u1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateUser', () => {
    it('updates user and logs audit', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      mockPrisma.user.update.mockResolvedValue({
        id: 'u1',
        name: 'Updated Name',
      });

      const result = await service.updateUser(
        'u1',
        { name: 'Updated Name' } as any,
        'admin-1',
      );

      expect(result.name).toBe('Updated Name');
    });

    it('throws if admin tries to change own role', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1' });

      await expect(
        service.updateUser(
          'admin-1',
          { role: UserRole.USER } as any,
          'admin-1',
        ),
      ).rejects.toThrow('Cannot change your own role');
    });
  });

  describe('deleteUser', () => {
    it('deletes user and logs audit', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        role: UserRole.USER,
      });
      mockPrisma.user.delete.mockResolvedValue(undefined);

      const result = await service.deleteUser('u1', 'admin-1');

      expect(result).toEqual({ message: 'User deleted successfully' });
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'u1' },
      });
    });

    it('throws if user is admin', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        role: UserRole.ADMIN,
      });

      await expect(service.deleteUser('u1', 'admin-1')).rejects.toThrow(
        'Cannot delete admin users',
      );
    });

    it('throws if deleting own account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        role: UserRole.USER,
      });

      await expect(service.deleteUser('admin-1', 'admin-1')).rejects.toThrow(
        'Cannot delete your own account',
      );
    });
  });

  describe('listFraudFlags', () => {
    it('returns unresolved fraud flags', async () => {
      mockPrisma.fraudFlag.findMany.mockResolvedValue([{ id: 'f1' }]);
      mockPrisma.fraudFlag.count.mockResolvedValue(1);

      const result = await service.listFraudFlags({ page: 1, limit: 20 } as any);

      expect(result.data).toHaveLength(1);
      expect(mockPrisma.fraudFlag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            resolvedAt: null,
          }),
        }),
      );
    });

    it('filters by severity', async () => {
      mockPrisma.fraudFlag.findMany.mockResolvedValue([]);
      mockPrisma.fraudFlag.count.mockResolvedValue(0);

      await service.listFraudFlags({
        page: 1,
        limit: 20,
        severity: 'HIGH',
      } as any);

      expect(mockPrisma.fraudFlag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            severity: 'HIGH',
            resolvedAt: null,
          }),
        }),
      );
    });
  });

  describe('reviewFraudFlag', () => {
    it('reviews fraud flag and suspends user if confirmed', async () => {
      mockPrisma.fraudFlag.findUnique.mockResolvedValue({
        id: 'f1',
        resolvedAt: null,
        redemptionId: 'r1',
      });
      mockPrisma.fraudFlag.update.mockResolvedValue({
        id: 'f1',
        resolution: 'CONFIRMED',
      });
      mockPrisma.redemptionSession.findUnique.mockResolvedValue({
        userId: 'u1',
      });
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', isActive: false });

      const result = await service.reviewFraudFlag(
        {
          fraudFlagId: 'f1',
          decision: 'CONFIRMED',
          notes: 'confirmed fraud',
        } as any,
        'admin-1',
      );

      expect(result.resolution).toBe('CONFIRMED');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { isActive: false },
      });
    });

    it('throws if fraud flag already resolved', async () => {
      mockPrisma.fraudFlag.findUnique.mockResolvedValue({
        id: 'f1',
        resolvedAt: new Date(),
      });

      await expect(
        service.reviewFraudFlag(
          { fraudFlagId: 'f1', decision: 'DISMISSED' } as any,
          'admin-1',
        ),
      ).rejects.toThrow('already resolved');
    });
  });

  describe('getFraudFlagDetails', () => {
    it('returns fraud flag with redemption session and user', async () => {
      mockPrisma.fraudFlag.findUnique.mockResolvedValue({
        id: 'f1',
        redemptionId: 'r1',
      });
      mockPrisma.redemptionSession.findUnique.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
      });

      const result = await service.getFraudFlagDetails('f1');

      expect(result).toHaveProperty('id', 'f1');
      expect(result).toHaveProperty('redemptionSession');
      expect(result.redemptionSession).toHaveProperty('user');
    });

    it('throws if fraud flag not found', async () => {
      mockPrisma.fraudFlag.findUnique.mockResolvedValue(null);

      await expect(service.getFraudFlagDetails('f1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

