import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { CreateStageCategoryDto } from './dto/create-stage-category.dto';
import type { UpdateStageCategoryDto } from './dto/update-stage-category.dto';

const DEFAULT_STAGE_CATEGORIES = [
  { value: 'CUTTING', label: 'CUTTING', sortOrder: 1 },
  { value: 'STITCHING', label: 'STITCHING', sortOrder: 2 },
  { value: 'ASSEMBLY', label: 'ASSEMBLY', sortOrder: 3 },
  { value: 'STOCK', label: 'STOCK', sortOrder: 4 },
] as const;

@Injectable()
export class StageCategoryService implements OnModuleInit {
  constructor(private readonly prismaService: PrismaService) {}

  async onModuleInit() {
    await this.ensureTable();
    await this.ensureSeedData();
  }

  async listCategories() {
    await this.ensureTable();

    const categories = await this.prismaService.stageCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });

    return {
      categories: categories.map((item) => ({
        id: item.id,
        value: item.value,
        label: item.label,
      })),
    };
  }

  async createCategory(payload: CreateStageCategoryDto) {
    await this.ensureTable();

    const value = normalizeStageCategoryValue(payload.value);
    const label = payload.label?.trim();

    if (!value || !label) {
      throw new BadRequestException('Value and label are required.');
    }

    const existing = await this.prismaService.stageCategory.findFirst({
      where: {
        value,
      },
    });

    if (existing) {
      if (!existing.isActive) {
        const restored = await this.prismaService.stageCategory.update({
          where: { id: existing.id },
          data: {
            label,
            isActive: true,
          },
        });

        return {
          category: {
            id: restored.id,
            value: restored.value,
            label: restored.label,
          },
        };
      }

      throw new ConflictException('Category value already exists.');
    }

    const lastSortOrder = await this.prismaService.stageCategory.aggregate({
      _max: { sortOrder: true },
    });

    const created = await this.prismaService.stageCategory.create({
      data: {
        value,
        label,
        isActive: true,
        sortOrder: (lastSortOrder._max.sortOrder ?? 0) + 1,
      },
    });

    return {
      category: {
        id: created.id,
        value: created.value,
        label: created.label,
      },
    };
  }

  async updateCategory(id: string, payload: UpdateStageCategoryDto) {
    await this.ensureTable();

    if (!id?.trim()) {
      throw new BadRequestException('Category id is invalid.');
    }

    const existing = await this.prismaService.stageCategory.findUnique({
      where: { id },
    });

    if (!existing || !existing.isActive) {
      throw new NotFoundException('Category not found.');
    }

    const nextValue =
      typeof payload.value === 'string'
        ? normalizeStageCategoryValue(payload.value)
        : existing.value;
    const nextLabel =
      typeof payload.label === 'string' ? payload.label.trim() : existing.label;

    if (!nextValue || !nextLabel) {
      throw new BadRequestException('Value and label are required.');
    }

    const duplicated = await this.prismaService.stageCategory.findFirst({
      where: {
        value: nextValue,
        id: { not: id },
      },
    });

    if (duplicated) {
      throw new ConflictException('Category value already exists.');
    }

    if (nextValue !== existing.value) {
      await this.ensureCategoryNotInUse(existing.value);
    }

    const updated = await this.prismaService.stageCategory.update({
      where: { id },
      data: {
        value: nextValue,
        label: nextLabel,
      },
    });

    return {
      category: {
        id: updated.id,
        value: updated.value,
        label: updated.label,
      },
    };
  }

  async deleteCategory(id: string) {
    await this.ensureTable();

    if (!id?.trim()) {
      throw new BadRequestException('Category id is invalid.');
    }

    const existing = await this.prismaService.stageCategory.findUnique({
      where: { id },
    });

    if (!existing || !existing.isActive) {
      throw new NotFoundException('Category not found.');
    }

    await this.ensureCategoryNotInUse(existing.value);

    await this.prismaService.stageCategory.update({
      where: { id },
      data: { isActive: false },
    });

    return { success: true, id };
  }

  async normalizeAndValidate(value: string, fieldName = 'Stage category') {
    const normalizedValue = value?.trim().toUpperCase();

    if (!normalizedValue) {
      throw new BadRequestException(`${fieldName} is invalid.`);
    }

    await this.ensureTable();

    const category = await this.prismaService.stageCategory.findFirst({
      where: {
        value: normalizedValue,
        isActive: true,
      },
    });

    if (!category) {
      throw new BadRequestException(`${fieldName} is invalid.`);
    }

    return category.value;
  }

  private async ensureCategoryNotInUse(value: string) {
    const [stageCount, tableCtCount] = await Promise.all([
      this.prismaService.stageList.count({
        where: { area: value },
      }),
      this.prismaService.tableCT.count({
        where: { stage: value },
      }),
    ]);

    if (stageCount > 0 || tableCtCount > 0) {
      throw new BadRequestException(
        'This category is currently in use and cannot be changed or deleted.',
      );
    }
  }

  private async ensureSeedData() {
    const count = await this.prismaService.stageCategory.count();

    if (count > 0) {
      return;
    }

    await this.prismaService.stageCategory.createMany({
      data: DEFAULT_STAGE_CATEGORIES.map((item) => ({
        value: item.value,
        label: item.label,
        sortOrder: item.sortOrder,
        isActive: true,
      })),
    });
  }

  private async ensureTable() {
    await this.prismaService.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.StageCategory', N'U') IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM sys.columns c
           INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
           WHERE c.object_id = OBJECT_ID(N'dbo.StageCategory')
             AND c.name = 'id'
             AND t.name <> 'uniqueidentifier'
         )
      BEGIN
        DROP TABLE [dbo].[StageCategory];
      END

      IF OBJECT_ID(N'dbo.StageCategory', N'U') IS NULL
      BEGIN
        CREATE TABLE [dbo].[StageCategory] (
          [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [StageCategory_id_df] DEFAULT NEWID(),
          [value] NVARCHAR(50) NOT NULL,
          [label] NVARCHAR(100) NOT NULL,
          [sortOrder] INT NOT NULL CONSTRAINT [StageCategory_sortOrder_df] DEFAULT 0,
          [isActive] BIT NOT NULL CONSTRAINT [StageCategory_isActive_df] DEFAULT 1,
          [createdAt] DATETIME2 NOT NULL CONSTRAINT [StageCategory_createdAt_df] DEFAULT SYSUTCDATETIME(),
          [updatedAt] DATETIME2 NOT NULL CONSTRAINT [StageCategory_updatedAt_df] DEFAULT SYSUTCDATETIME(),
          CONSTRAINT [StageCategory_pkey] PRIMARY KEY ([id]),
          CONSTRAINT [StageCategory_value_key] UNIQUE ([value])
        );
      END
    `);
  }
}

function normalizeStageCategoryValue(value: string) {
  return value
    ?.trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}
