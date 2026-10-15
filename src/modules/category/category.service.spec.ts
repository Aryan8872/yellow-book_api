import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CategoryService } from './category.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

describe('CategoryService', () => {
  let service: CategoryService;

  const mockPrisma = {
    category: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    offer: {
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(CategoryService);
  });

  describe('getCategories', () => {
    it('filters by isActive only when provided', async () => {
      mockPrisma.category.findMany.mockResolvedValue([]);

      await service.getCategories({} as any);
      expect(mockPrisma.category.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      });

      await service.getCategories({ isActive: true } as any);
      expect(mockPrisma.category.findMany).toHaveBeenLastCalledWith({
        where: { isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      });
    });
  });

  describe('getCategoryById', () => {
    it('throws NotFound with the ID in the message', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);

      await expect(service.getCategoryById('nope')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getCategoryById('nope')).rejects.toThrow('nope');
    });

    it('maps _count.offers to offerCount', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({
        id: 'c1',
        name: 'Dining',
        _count: { offers: 7 },
      });

      const result = await service.getCategoryById('c1');

      expect(result.offerCount).toBe(7);
      expect(result.name).toBe('Dining');
    });
  });

  describe('getCategoryBySlug', () => {
    it('throws NotFound for an unknown slug and maps offerCount on success', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);
      await expect(service.getCategoryBySlug('ghost')).rejects.toThrow(
        NotFoundException,
      );

      mockPrisma.category.findUnique.mockResolvedValue({
        id: 'c1',
        slug: 'dining',
        _count: { offers: 3 },
      });
      const result = await service.getCategoryBySlug('dining');
      expect(result.offerCount).toBe(3);
    });
  });

  describe('createCategory', () => {
    it('defaults displayOrder to 0', async () => {
      mockPrisma.category.create.mockResolvedValue({ id: 'c2' });

      await service.createCategory({ name: 'X', slug: 'x' } as any);

      expect(mockPrisma.category.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ displayOrder: 0 }),
      });
    });
  });

  describe('updateCategory', () => {
    it('sends only the defined fields in data (partial update)', async () => {
      mockPrisma.category.update.mockResolvedValue({ id: 'c1' });

      await service.updateCategory('c1', { name: 'New Name' } as any);

      expect(mockPrisma.category.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { name: 'New Name' },
      });
    });
  });

  describe('deleteCategory', () => {
    it('delegates to prisma.category.delete', async () => {
      mockPrisma.category.delete.mockResolvedValue({ id: 'c1' });

      await service.deleteCategory('c1');

      expect(mockPrisma.category.delete).toHaveBeenCalledWith({
        where: { id: 'c1' },
      });
    });
  });

  describe('updateCategoryOfferCount', () => {
    it('counts ACTIVE offers only and persists the result', async () => {
      mockPrisma.offer.count.mockResolvedValue(12);

      await service.updateCategoryOfferCount('c1');

      expect(mockPrisma.offer.count).toHaveBeenCalledWith({
        where: { categoryId: 'c1', isActive: true },
      });
      expect(mockPrisma.category.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { offerCount: 12 },
      });
    });
  });
});
