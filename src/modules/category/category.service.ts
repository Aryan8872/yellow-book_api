import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto, QueryCategoriesDto } from './dto/category.dto';

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all categories with filtering
   */
  async getCategories(query: QueryCategoriesDto) {
    const where: Prisma.CategoryWhereInput = {
      ...(query.isActive !== undefined && { isActive: query.isActive }),
    };

    const categories = await this.prisma.category.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });

    return categories;
  }

  /**
   * Get category by ID
   */
  async getCategoryById(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { offers: { where: { isActive: true } } },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    return {
      ...category,
      offerCount: category._count.offers,
    };
  }

  /**
   * Get category by slug
   */
  async getCategoryBySlug(slug: string) {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: {
        _count: {
          select: { offers: { where: { isActive: true } } },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with slug ${slug} not found`);
    }

    return {
      ...category,
      offerCount: category._count.offers,
    };
  }

  /**
   * Create a new category
   */
  async createCategory(dto: CreateCategoryDto) {
    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        iconUrl: dto.iconUrl,
        imageUrl: dto.imageUrl,
        color: dto.color,
        displayOrder: dto.displayOrder ?? 0,
      },
    });

    return category;
  }

  /**
   * Update a category
   */
  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.iconUrl !== undefined && { iconUrl: dto.iconUrl }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.displayOrder !== undefined && { displayOrder: dto.displayOrder }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    return category;
  }

  /**
   * Delete a category
   */
  async deleteCategory(id: string) {
    await this.prisma.category.delete({
      where: { id },
    });
  }

  /**
   * Recalculate offer counts for all categories
   * This should be called periodically or after offer changes
   */
  async recalculateOfferCounts() {
    const categories = await this.prisma.category.findMany();

    for (const category of categories) {
      const count = await this.prisma.offer.count({
        where: {
          categoryId: category.id,
          isActive: true,
        },
      });

      await this.prisma.category.update({
        where: { id: category.id },
        data: { offerCount: count },
      });
    }

    this.logger.log('Recalculated offer counts for all categories');
  }

  /**
   * Update offer count for a specific category
   */
  async updateCategoryOfferCount(categoryId: string) {
    const count = await this.prisma.offer.count({
      where: {
        categoryId,
        isActive: true,
      },
    });

    await this.prisma.category.update({
      where: { id: categoryId },
      data: { offerCount: count },
    });
  }
}
