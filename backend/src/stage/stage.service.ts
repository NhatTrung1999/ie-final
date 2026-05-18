import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { copyFile, unlink } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { JwtUserPayload } from '../auth/auth.types';
import { DeleteLogService } from '../delete-log/delete-log.service';
import { StageCategoryService } from '../stage-category/stage-category.service';
import type { CreateStageDto } from './dto/create-stage.dto';
import type { DuplicateStageDto } from './dto/duplicate-stage.dto';
import type { ListStagesDto } from './dto/list-stages.dto';
import type { ReorderStageDto } from './dto/reorder-stage.dto';
import { ensureStageUploadDir, getStageVideoUrl } from './stage-upload.util';

@Injectable()
export class StageService implements OnModuleInit {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly deleteLogService: DeleteLogService,
    private readonly stageCategoryService: StageCategoryService,
  ) {}

  async onModuleInit() {
    ensureStageUploadDir();
    await this.ensureStageTable();
    await this.removeDefaultSeedData();
  }

  async listStages(filters: ListStagesDto = {}, actor?: JwtUserPayload) {
    await this.ensureStageTable();

    const where: Prisma.StageListWhereInput = {};
    const normalizedSeason = filters.season?.trim();
    const normalizedProcessStage = filters.stage?.trim();
    const normalizedCutDie = filters.cutDie?.trim();
    const normalizedArea = filters.area?.trim().toUpperCase();
    const normalizedArticle = filters.article?.trim();
    const confirmedTableCtOnly = filters.confirmedTableCtOnly === 'true';
    const dateFrom = parseDateFilter(filters.dateFrom, 'Date from');
    const dateTo = parseDateFilter(filters.dateTo, 'Date to');

    if (normalizedSeason) {
      where.season = { contains: normalizedSeason };
    }

    if (normalizedProcessStage && normalizedProcessStage !== 'Choose option') {
      where.stage = { contains: normalizedProcessStage };
    }

    if (normalizedCutDie) {
      where.cutDie = { contains: normalizedCutDie };
    }

    if (normalizedArea && normalizedArea !== 'CHOOSE OPTION') {
      where.area = normalizedArea;
    }

    if (normalizedArticle) {
      where.article = { contains: normalizedArticle };
    }

    if (actor?.sub) {
      where.ownerUserId = actor.sub;
    }

    const stages = await this.prismaService.stageList.findMany({
      where,
      orderBy: [{ area: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });
    const filteredStages = stages.filter((item) => {
      const effectiveDate = item.stageDate ?? item.createdAt;

      if (dateFrom && effectiveDate < dateFrom) {
        return false;
      }

      if (dateTo && effectiveDate > dateTo) {
        return false;
      }

      return true;
    });

    const stageIds = filteredStages.map((item) => item.id);
    const tableRows =
      stageIds.length > 0
        ? await this.prismaService.tableCT.findMany({
            where: {
              OR: [
                { stageItemId: { in: stageIds } },
                {
                  stageItemId: null,
                  no: { in: filteredStages.map((item) => item.code.trim().toUpperCase()) },
                  stage: { in: filteredStages.map((item) => (item.area ?? item.stage).trim().toUpperCase()) },
                },
              ],
            },
            select: {
              stageItemId: true,
              no: true,
              stage: true,
              confirmed: true,
            },
          })
        : [];
    // A stage item is "completed" when ALL its CT rows have been confirmed.
    const completionCountMap = new Map<string, { total: number; confirmed: number }>();

    tableRows.forEach((row) => {
      const identityKey = row.stageItemId
        ? row.stageItemId
        : `${row.stage.trim().toUpperCase()}::${row.no.trim().toUpperCase()}`;

      const current = completionCountMap.get(identityKey) ?? { total: 0, confirmed: 0 };
      completionCountMap.set(identityKey, {
        total: current.total + 1,
        confirmed: current.confirmed + (row.confirmed ? 1 : 0),
      });
    });

    const completionMap = new Map<string, boolean>();
    completionCountMap.forEach(({ total, confirmed }, key) => {
      completionMap.set(key, total > 0 && confirmed === total);
    });

    const confirmedRowStageKeys = new Set<string>();
    tableRows.forEach((row) => {
      if (!row.confirmed) {
        return;
      }

      confirmedRowStageKeys.add(
        row.stageItemId
          ? row.stageItemId
          : `${row.stage.trim().toUpperCase()}::${row.no.trim().toUpperCase()}`,
      );
    });

    const visibleStages = confirmedTableCtOnly
      ? filteredStages.filter((item) => {
          const parsedIdentity = parseStageIdentity(item.name, item.code);
          const fallbackKey = `${(item.area ?? item.stage).trim().toUpperCase()}::${parsedIdentity.code}`;
          return confirmedRowStageKeys.has(item.id) || confirmedRowStageKeys.has(fallbackKey);
        })
      : filteredStages;

    return {
      stages: visibleStages.map((item) => {
        const parsedIdentity = parseStageIdentity(item.name, item.code);
        const completionKey = item.id;
        const fallbackCompletionKey = `${(item.area ?? item.stage).trim().toUpperCase()}::${parsedIdentity.code}`;

        return {
          id: item.id,
          code: parsedIdentity.code,
          name: parsedIdentity.name,
          processStage: item.stage,
          season: item.season ?? '',
          cutDie: item.cutDie ?? '',
          area: item.area ?? item.stage,
          article: item.article ?? '',
          duration: item.duration,
          mood: item.mood,
          stage: item.area ?? item.stage,
          stageDate: item.stageDate?.toISOString().slice(0, 10) ?? null,
          completed:
            completionMap.get(completionKey) ??
            completionMap.get(fallbackCompletionKey) ??
            false,
          videoUrl: item.filePath ? getStageVideoUrl(item.filePath) : undefined,
        };
      }),
    };
  }

  async createStages(
    payload: CreateStageDto,
    files: any[] = [],
    actor?: JwtUserPayload,
  ) {
    await this.ensureStageTable();

    const normalizedArea = await this.stageCategoryService.normalizeAndValidate(
      payload.area,
      'Area',
    );
    const selectedProcessStage =
      payload.stageCode?.trim() && payload.stageCode.trim() !== 'Choose option'
        ? payload.stageCode.trim()
        : null;
    const selectedStageDate = parseStageDate(payload.date);
    const normalizedSeason = validateTextOnlyField(payload.season, 'Season', 100);
    const normalizedCutDie = validateTextOnlyField(payload.cutDie, 'Cut Die', 100);
    const normalizedArticle = validateTextOnlyField(payload.article, 'Article', 255);
    const baseCode = normalizedCutDie?.toUpperCase() || 'NEW';
    const uploadedFiles = files.filter(Boolean);

    if (uploadedFiles.length === 0) {
      throw new BadRequestException('At least one video file is required.');
    }

    let createdStages: Prisma.StageListGetPayload<Record<string, never>>[] = [];

    try {
      const stageCount = await this.prismaService.stageList.count({
        where: {
          area: normalizedArea,
          ...(actor?.sub ? { ownerUserId: actor.sub } : {}),
        },
      });
      createdStages = await this.prismaService.$transaction(async (tx) => {
        const created: Prisma.StageListGetPayload<Record<string, never>>[] = [];

        for (const [index, file] of uploadedFiles.entries()) {
          const parsedIdentity = parseStageIdentity(
            fixMulterEncoding(file.originalname),
            uploadedFiles.length === 1 ? baseCode : `${baseCode}-${index + 1}`,
          );

          // --- Quy tắc đặt tên unique ---
          // Tên stage được coi là trùng khi cùng: area + ownerUserId + tên + NGÀY UPLOAD.
          // Nếu trùng → thêm suffix (1), (2)... cho đến khi tìm được tên chưa tồn tại.
          //
          // Lý do KHÔNG scope theo toàn bộ DB (bỏ stageDate):
          //   Cùng một công đoạn có thể được đo lại vào nhiều ngày khác nhau
          //   (VD: tháng 1 đo lần 1, tháng 3 đo lại để so sánh).
          //   Hai lần đo đó nên giữ nguyên tên gốc — phân biệt nhau bằng ngày,
          //   không phải suffix số. Chỉ thêm suffix khi đúng là upload trùng
          //   trong cùng một ngày (ví dụ: upload nhầm, upload lại).
          const stageDateFilter = selectedStageDate
            ? { stageDate: selectedStageDate }
            : { stageDate: null };

          let uniqueName = parsedIdentity.name;
          const baseNameExists = await tx.stageList.findFirst({
            where: {
              area: normalizedArea,
              name: parsedIdentity.name,
              ...stageDateFilter,
              ...(actor?.sub ? { ownerUserId: actor.sub } : {}),
            },
            select: { id: true },
          });
          if (baseNameExists) {
            let suffix = 1;
            while (true) {
              const candidate = `${parsedIdentity.name} (${suffix})`;
              const exists = await tx.stageList.findFirst({
                where: {
                  area: normalizedArea,
                  name: candidate,
                  ...stageDateFilter,
                  ...(actor?.sub ? { ownerUserId: actor.sub } : {}),
                },
                select: { id: true },
              });
              if (!exists) {
                uniqueName = candidate;
                break;
              }
              suffix++;
            }
          }

          const stage = await tx.stageList.create({
            data: {
              ownerUserId: actor?.sub ?? null,
              code: parsedIdentity.code,
              name: uniqueName,
              stage: selectedProcessStage ?? normalizedArea,
              season: normalizedSeason,
              cutDie: normalizedCutDie,
              area: normalizedArea,
              article: normalizedArticle,
              duration: '00:00',
              mood: 'NVA',
              filePath: file.path,
              stageDate: selectedStageDate,
              sortOrder: stageCount + index + 1,
            },
          });

          created.push(stage);
        }

        return created;
      });
    } catch (error) {
      await Promise.all(
        uploadedFiles.map((file) =>
          file?.path
            ? unlink(file.path).catch(() => {
                // Ignore cleanup failures for orphaned uploads.
              })
            : Promise.resolve(),
        ),
      );

      throw error;
    }

    return {
      stages: createdStages.map((item) => {
        const parsedIdentity = parseStageIdentity(item.name, item.code);

        return {
          id: item.id,
          code: parsedIdentity.code,
          name: parsedIdentity.name,
          processStage: item.stage,
          season: item.season ?? '',
          cutDie: item.cutDie ?? '',
          area: item.area ?? item.stage,
          article: item.article ?? '',
          duration: item.duration,
          mood: item.mood,
          stage: item.area ?? item.stage,
          stageDate: item.stageDate?.toISOString().slice(0, 10) ?? null,
          completed: false,
          videoUrl: item.filePath ? getStageVideoUrl(item.filePath) : undefined,
        };
      }),
    };
  }

  async duplicateStage(payload: DuplicateStageDto, actor?: JwtUserPayload) {
    await this.ensureStageTable();

    const sourceId = payload.sourceId?.trim();
    const targetArea = await this.stageCategoryService.normalizeAndValidate(
      payload.targetArea,
      'Target area',
    );

    if (!sourceId) {
      throw new BadRequestException('Source stage id is required.');
    }

    const sourceStage = await this.prismaService.stageList.findUnique({
      where: { id: sourceId },
    });

    if (!sourceStage) {
      throw new NotFoundException('Source stage item was not found.');
    }

    this.ensureStageOwnership(sourceStage.ownerUserId, actor);

    const targetCount = await this.prismaService.stageList.count({
      where: {
        area: targetArea,
        ...(actor?.sub ? { ownerUserId: actor.sub } : {}),
      },
    });
    const relatedCopies = await this.prismaService.stageList.count({
      where: {
        code: {
          startsWith: sourceStage.code,
        },
      },
    });

    const duplicateCode = `${sourceStage.code}-COPY${relatedCopies + 1}`;
    const duplicateName = `${sourceStage.name} Copy`;
    const duplicatedFilePath = sourceStage.filePath
      ? await cloneStageVideoFile(sourceStage.filePath)
      : null;

    const duplicatedStage = await this.prismaService.$transaction(async (tx) => {
      const createdStage = await tx.stageList.create({
        data: {
          ownerUserId: actor?.sub ?? null,
          code: duplicateCode,
          name: duplicateName,
          stage: sourceStage.stage,
          season: sourceStage.season,
          cutDie: sourceStage.cutDie,
          area: targetArea,
          article: sourceStage.article,
          duration: sourceStage.duration,
          mood: sourceStage.mood,
          filePath: duplicatedFilePath,
          stageDate: sourceStage.stageDate ?? new Date(),
          sortOrder: targetCount + 1,
        },
      });

      const sourceTableRows = await tx.tableCT.findMany({
        where: {
          confirmed: true,
          OR: [
            { stageItemId: sourceStage.id },
            {
              stageItemId: null,
              no: sourceStage.code,
              stage: sourceStage.area ?? sourceStage.stage,
            },
          ],
        },
        orderBy: [{ sortOrder: 'asc' }, { no: 'asc' }],
      });

      if (sourceTableRows.length > 0) {
        await Promise.all(
          sourceTableRows.map((row, index) =>
            tx.tableCT.create({
              data: {
                stageItemId: createdStage.id,
                no: duplicateCode,
                partName: duplicateName,
                stage: targetArea,
                ct1: row.ct1,
                ct2: row.ct2,
                ct3: row.ct3,
                ct4: row.ct4,
                ct5: row.ct5,
                ct6: row.ct6,
                ct7: row.ct7,
                ct8: row.ct8,
                ct9: row.ct9,
                ct10: row.ct10,
                vaCt1: row.vaCt1,
                vaCt2: row.vaCt2,
                vaCt3: row.vaCt3,
                vaCt4: row.vaCt4,
                vaCt5: row.vaCt5,
                vaCt6: row.vaCt6,
                vaCt7: row.vaCt7,
                vaCt8: row.vaCt8,
                vaCt9: row.vaCt9,
                vaCt10: row.vaCt10,
                machineType: row.machineType,
                confirmed: row.confirmed,
                done: row.done,
                sortOrder: index + 1,
              },
            }),
          ),
        );
      }

      const sourceHistoryEntries = await tx.historyEntry.findMany({
        where: {
          OR: [
            { stageItemId: sourceStage.id },
            {
              stageItemId: null,
              stageCode: sourceStage.code,
            },
          ],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

      if (sourceHistoryEntries.length > 0) {
        await Promise.all(
          sourceHistoryEntries.map((entry) =>
            tx.historyEntry.create({
              data: {
                stageItemId: createdStage.id,
                stageCode: duplicateCode,
                startTime: entry.startTime,
                endTime: entry.endTime,
                type: entry.type,
                value: entry.value,
                committed: entry.committed,
              },
            }),
          ),
        );
      }

      return createdStage;
    });

    const parsedIdentity = parseStageIdentity(duplicatedStage.name, duplicatedStage.code);

    return {
      stage: {
        id: duplicatedStage.id,
        code: parsedIdentity.code,
        name: parsedIdentity.name,
        processStage: duplicatedStage.stage,
        season: duplicatedStage.season ?? '',
        cutDie: duplicatedStage.cutDie ?? '',
        area: duplicatedStage.area ?? duplicatedStage.stage,
        article: duplicatedStage.article ?? '',
        duration: duplicatedStage.duration,
        mood: duplicatedStage.mood,
        stage: duplicatedStage.area ?? duplicatedStage.stage,
        stageDate: duplicatedStage.stageDate?.toISOString().slice(0, 10) ?? null,
        completed: false,
        videoUrl: duplicatedStage.filePath
          ? getStageVideoUrl(duplicatedStage.filePath)
          : undefined,
      },
    };
  }

  async reorderStages(payload: ReorderStageDto, actor?: JwtUserPayload) {
    await this.ensureStageTable();

    const normalizedStage = await this.stageCategoryService.normalizeAndValidate(
      payload.stage,
      'Stage',
    );
    const orderedIds = payload.orderedIds?.map((id) => id.trim()).filter(Boolean) ?? [];

    if (orderedIds.length === 0) {
      throw new BadRequestException('Ordered ids are required.');
    }

    const existingItems = await this.prismaService.stageList.findMany({
      where: {
        area: normalizedStage,
        ...(actor?.sub ? { ownerUserId: actor.sub } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    if (existingItems.length !== orderedIds.length) {
      throw new BadRequestException('Ordered ids do not match current stage items.');
    }

    const existingIds = new Set(existingItems.map((item) => item.id));
    const hasInvalidId = orderedIds.some((id) => !existingIds.has(id));

    if (hasInvalidId || new Set(orderedIds).size !== orderedIds.length) {
      throw new BadRequestException('Ordered ids are invalid.');
    }

    await this.prismaService.$transaction(
      orderedIds.map((id, index) =>
        this.prismaService.stageList.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );

    return { success: true };
  }

  async deleteStage(id: string, actor?: JwtUserPayload) {
    await this.ensureStageTable();

    if (!id?.trim()) {
      throw new BadRequestException('Stage id is required.');
    }

    const targetStage = await this.prismaService.stageList.findUnique({
      where: { id },
    });

    if (!targetStage) {
      throw new NotFoundException('Stage item was not found.');
    }

    this.ensureStageOwnership(targetStage.ownerUserId, actor);

    const parsedIdentity = parseStageIdentity(targetStage.name, targetStage.code);

    await this.prismaService.$transaction(async (tx) => {
      await tx.stageList.delete({
        where: { id },
      });

      await tx.historyEntry.deleteMany({
        where: {
          OR: [
            { stageItemId: targetStage.id },
            { stageCode: parsedIdentity.code },
          ],
        },
      });

      await tx.controlSession.deleteMany({
        where: {
          OR: [
            { stageItemId: targetStage.id },
            { stageCode: parsedIdentity.code },
          ],
        },
      });

      await tx.tableCT.deleteMany({
        where: {
          OR: [
            { stageItemId: targetStage.id },
            {
              no: parsedIdentity.code,
              stage: targetStage.area ?? targetStage.stage,
            },
          ],
        },
      });

      const remainingItems = await tx.stageList.findMany({
        where: {
          area: targetStage.area ?? targetStage.stage,
          ...(targetStage.ownerUserId ? { ownerUserId: targetStage.ownerUserId } : {}),
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });

      await Promise.all(
        remainingItems.map((item, index) =>
          tx.stageList.update({
            where: { id: item.id },
            data: { sortOrder: index + 1 },
          }),
        ),
      );
    });

    if (targetStage.filePath) {
      const remainingReferences = await this.prismaService.stageList.count({
        where: {
          filePath: targetStage.filePath,
        },
      });

      if (remainingReferences === 0) {
        try {
          await unlink(targetStage.filePath);
        } catch {
          // Ignore missing/unreadable files so stage deletion still succeeds.
        }
      }
    }

    await this.deleteLogService.logDelete({
      actor,
      entityType: 'StageList',
      entityId: targetStage.id,
        entityLabel: `${parsedIdentity.code} - ${parsedIdentity.name}`,
        metadata: {
          code: parsedIdentity.code,
          name: parsedIdentity.name,
          season: targetStage.season ?? null,
          cutDie: targetStage.cutDie ?? null,
          area: targetStage.area ?? targetStage.stage,
          stage: targetStage.stage,
          article: targetStage.article ?? null,
          filePath: targetStage.filePath ?? null,
      },
    });

    return {
      success: true,
      id,
    };
  }

  private async ensureStageTable() {
    await this.prismaService.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.IE_StageApiUuid', N'U') IS NOT NULL
         AND OBJECT_ID(N'dbo.StageList', N'U') IS NULL
      BEGIN
        EXEC sp_rename 'dbo.IE_StageApiUuid', 'StageList';
      END

      IF OBJECT_ID(N'dbo.StageApi', N'U') IS NOT NULL
         AND OBJECT_ID(N'dbo.StageList', N'U') IS NULL
      BEGIN
        EXEC sp_rename 'dbo.StageApi', 'StageList';
      END

      IF OBJECT_ID(N'dbo.StageList', N'U') IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM sys.columns c
           INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
           WHERE c.object_id = OBJECT_ID(N'dbo.StageList')
             AND c.name = 'id'
             AND t.name <> 'uniqueidentifier'
         )
      BEGIN
        DROP TABLE [dbo].[StageList];
      END

      IF OBJECT_ID(N'dbo.StageList', N'U') IS NULL
      BEGIN
        CREATE TABLE [dbo].[StageList] (
          [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [StageList_id_df] DEFAULT NEWID(),
          [code] NVARCHAR(50) NOT NULL,
          [name] NVARCHAR(255) NOT NULL,
          [season] NVARCHAR(100) NULL,
          [cutDie] NVARCHAR(100) NULL,
          [area] NVARCHAR(50) NULL,
          [article] NVARCHAR(255) NULL,
          [ownerUserId] UNIQUEIDENTIFIER NULL,
          [duration] NVARCHAR(20) NOT NULL,
          [mood] NVARCHAR(20) NOT NULL,
          [stage] NVARCHAR(50) NOT NULL,
          [filePath] NVARCHAR(500) NULL,
          [sortOrder] INT NOT NULL CONSTRAINT [StageList_sortOrder_df] DEFAULT 0,
          [createdAt] DATETIME2 NOT NULL CONSTRAINT [StageList_createdAt_df] DEFAULT SYSUTCDATETIME(),
          [updatedAt] DATETIME2 NOT NULL CONSTRAINT [StageList_updatedAt_df] DEFAULT SYSUTCDATETIME(),
          CONSTRAINT [StageList_pkey] PRIMARY KEY ([id])
        );
      END

      IF COL_LENGTH('dbo.StageList', 'article') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [article] NVARCHAR(255) NULL;
      END

      IF COL_LENGTH('dbo.StageList', 'ownerUserId') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [ownerUserId] UNIQUEIDENTIFIER NULL;
      END

      IF COL_LENGTH('dbo.StageList', 'sortOrder') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [sortOrder] INT NOT NULL CONSTRAINT [StageList_sortOrder_df] DEFAULT 0;
      END

      IF COL_LENGTH('dbo.StageList', 'filePath') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [filePath] NVARCHAR(500) NULL;
      END

      IF COL_LENGTH('dbo.StageList', 'stageDate') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [stageDate] DATE NULL;
      END

      IF COL_LENGTH('dbo.StageList', 'createdAt') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [createdAt] DATETIME2 NOT NULL CONSTRAINT [StageList_createdAt_df] DEFAULT SYSUTCDATETIME();
      END

      IF COL_LENGTH('dbo.StageList', 'updatedAt') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [updatedAt] DATETIME2 NOT NULL CONSTRAINT [StageList_updatedAt_df] DEFAULT SYSUTCDATETIME();
      END

      IF COL_LENGTH('dbo.StageList', 'ownerUserId') IS NOT NULL
         AND OBJECT_ID(N'dbo.[User]', N'U') IS NOT NULL
      BEGIN
        UPDATE s
        SET s.[ownerUserId] = u.[id]
        FROM [dbo].[StageList] s
        CROSS JOIN (
          SELECT TOP 1 [id]
          FROM [dbo].[User]
          WHERE [username] IN ('admin', 'administrator')
          ORDER BY CASE WHEN [username] = 'admin' THEN 0 ELSE 1 END
        ) u
        WHERE s.[ownerUserId] IS NULL;
      END
    `);
  }

  private async removeDefaultSeedData() {
    await this.prismaService.stageList.deleteMany({
      where: {
        ownerUserId: null,
        OR: [
          { code: 'C10', name: 'Tears.mp4', season: 'JENNIE', cutDie: 'CUT-10' },
          { code: 'C4', name: 'Your Love.mp4', season: 'JENNIE', cutDie: 'CUT-4' },
          { code: 'C3', name: 'Hugs & Kisses.mp4', season: 'JENNIE', cutDie: 'CUT-3' },
          { code: 'C2', name: 'You & Me.mp4', season: 'JENNIE', cutDie: 'CUT-2' },
        ],
      },
    });
  }

  private ensureStageOwnership(
    ownerUserId: string | null | undefined,
    actor?: JwtUserPayload,
  ) {
    if (!actor?.sub) {
      return;
    }

    if (ownerUserId && ownerUserId !== actor.sub) {
      throw new NotFoundException('Stage item was not found.');
    }
  }
}

function parseStageIdentity(rawName: string, fallbackCode: string) {
  const withoutExtension = stripFileExtension(rawName).trim();
  const normalizedFallbackCode = fallbackCode.trim().toUpperCase() || 'NEW';
  const matched = withoutExtension.match(/^([^.]+)\.\s*(.+)$/);

  if (!matched) {
    return {
      code: normalizedFallbackCode,
      name: withoutExtension || normalizedFallbackCode,
    };
  }

  return {
    code: matched[1].trim().toUpperCase() || normalizedFallbackCode,
    name: matched[2].trim() || withoutExtension || normalizedFallbackCode,
  };
}

function validateTextOnlyField(
  value: string | undefined,
  label: string,
  maxLength: number,
) {
  const normalizedValue = value?.trim() ?? '';

  if (!normalizedValue) {
    throw new BadRequestException(`${label} is required.`);
  }

  if (normalizedValue.length > maxLength) {
    throw new BadRequestException(`${label} must be ${maxLength} characters or fewer.`);
  }

  if (!/^[\p{L}\p{N}\s]+$/u.test(normalizedValue)) {
    throw new BadRequestException(
      `${label} can only contain letters, numbers, and spaces.`,
    );
  }

  return normalizedValue;
}

function stripFileExtension(fileName: string) {
  const extension = extname(fileName);
  return extension ? fileName.slice(0, -extension.length) : fileName;
}

/**
 * Multer reads multipart filenames as Latin-1 by default.
 * Re-interpret the bytes as UTF-8 to correctly display
 * non-ASCII filenames (Chinese, Vietnamese, etc.).
 */
function fixMulterEncoding(originalname: string) {
  try {
    return Buffer.from(originalname, 'latin1').toString('utf8');
  } catch {
    return originalname;
  }
}

function parseDateFilter(value: string | undefined, label: string) {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${label} is invalid.`);
  }

  if (label === 'Date to') {
    parsed.setUTCHours(23, 59, 59, 999);
  }

  return parsed;
}

function parseStageDate(value?: string) {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('Upload date is invalid.');
  }

  return parsed;
}

async function cloneStageVideoFile(sourcePath: string) {
  ensureStageUploadDir();

  const extension = extname(sourcePath).toLowerCase() || '.mp4';
  const targetPath = join(dirname(sourcePath), `${randomUUID()}${extension}`);

  await copyFile(sourcePath, targetPath);
  return targetPath;
}
