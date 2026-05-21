import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { JwtUserPayload } from '../auth/auth.types';
import { DeleteLogService } from '../delete-log/delete-log.service';
import type { CreateHistoryDto } from './dto/create-history.dto';

@Injectable()
export class HistoryService implements OnModuleInit {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly deleteLogService: DeleteLogService,
  ) {}

  async onModuleInit() {
    await this.ensureTable();
    await this.ensureStageOwnerColumn();
  }

  async listHistory(
    filters: { stageItemId?: string; stageCode?: string },
    actor?: JwtUserPayload,
  ) {
    await this.ensureTable();
    await this.ensureStageOwnerColumn();

    const normalizedStageItemId = filters.stageItemId?.trim();
    const normalizedStageCode = filters.stageCode?.trim().toUpperCase();
    await this.ensureHistoryAccess(
      {
        stageItemId: normalizedStageItemId,
        stageCode: normalizedStageCode,
      },
      actor,
    );
    const historyWhere = normalizedStageItemId
      ? { stageItemId: normalizedStageItemId }
      : normalizedStageCode
        ? { stageCode: normalizedStageCode }
        : undefined;

    const isLocked = normalizedStageItemId
      ? await this.prismaService.tableCT.findFirst({
          where: {
            stageItemId: normalizedStageItemId,
            confirmed: true,
          },
          select: { id: true },
        }).then((row) => Boolean(row))
      : normalizedStageCode
      ? await this.prismaService.tableCT.findFirst({
          where: {
            no: normalizedStageCode,
            confirmed: true,
          },
          select: { id: true },
        }).then((row) => Boolean(row))
      : false;

    const rows = await this.prismaService.historyEntry.findMany({
      where: historyWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        startTime: row.startTime,
        endTime: row.endTime,
        range: `${formatTime(row.startTime)} - ${formatTime(row.endTime)}`,
        label: `${row.type}: ${row.value.toFixed(1)}`,
        ctColumn: row.ctColumn,
        committed: row.committed,
        locked: isLocked,
      })),
    };
  }

  async createHistory(payload: CreateHistoryDto, actor?: JwtUserPayload) {
    await this.ensureTable();
    await this.ensureStageOwnerColumn();

    const stageCode = payload.stageCode?.trim().toUpperCase();

    if (!stageCode) {
      throw new BadRequestException('Stage code is required.');
    }

    if (!['NVA', 'VA', 'SKIP'].includes(payload.type)) {
      throw new BadRequestException('History type is invalid.');
    }

    await this.ensureHistoryAccess(
      {
        stageItemId: payload.stageItemId?.trim() || undefined,
        stageCode,
      },
      actor,
    );

    const created = await this.prismaService.historyEntry.create({
      data: {
        stageItemId: payload.stageItemId?.trim() || null,
        stageCode,
        startTime: payload.startTime,
        endTime: payload.endTime,
        type: payload.type,
        value: payload.value,
        ctColumn: normalizeCtColumn(payload.ctColumn),
        committed: false,
      },
    });

    return {
      item: {
        id: created.id,
        startTime: created.startTime,
        endTime: created.endTime,
        range: `${formatTime(created.startTime)} - ${formatTime(created.endTime)}`,
        label: `${created.type}: ${created.value.toFixed(1)}`,
        ctColumn: created.ctColumn,
        committed: created.committed,
        locked: false,
      },
    };
  }

  async commitHistory(
    filters: { stageItemId?: string; stageCode?: string },
    actor?: JwtUserPayload,
  ) {
    await this.ensureTable();
    await this.ensureStageOwnerColumn();

    const normalizedStageItemId = filters.stageItemId?.trim();
    const normalizedStageCode = filters.stageCode?.trim().toUpperCase();

    if (!normalizedStageItemId && !normalizedStageCode) {
      throw new BadRequestException('Stage item id or stage code is required.');
    }

    await this.ensureHistoryAccess(
      {
        stageItemId: normalizedStageItemId,
        stageCode: normalizedStageCode,
      },
      actor,
    );

    const historyWhere = normalizedStageItemId
      ? { stageItemId: normalizedStageItemId }
      : { stageCode: normalizedStageCode! };

    await this.prismaService.historyEntry.updateMany({
      where: {
        ...historyWhere,
        committed: false,
      },
      data: {
        committed: true,
      },
    });

    const rows = await this.prismaService.historyEntry.findMany({
      where: historyWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const isLocked = await this.prismaService.tableCT
      .findFirst({
        where: normalizedStageItemId
          ? {
              stageItemId: normalizedStageItemId,
              confirmed: true,
            }
          : {
              no: normalizedStageCode,
              confirmed: true,
            },
        select: { id: true },
      })
      .then((row) => Boolean(row));

    return {
      items: rows.map((row) => ({
        id: row.id,
        startTime: row.startTime,
        endTime: row.endTime,
        range: `${formatTime(row.startTime)} - ${formatTime(row.endTime)}`,
        label: `${row.type}: ${row.value.toFixed(1)}`,
        ctColumn: row.ctColumn,
        committed: row.committed,
        locked: isLocked,
      })),
    };
  }

  async deleteHistory(id: string, actor?: JwtUserPayload) {
    await this.ensureTable();
    await this.ensureStageOwnerColumn();

    if (!id?.trim()) {
      throw new BadRequestException('History id is required.');
    }

    const existing = await this.prismaService.historyEntry.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('History item was not found.');
    }

    await this.ensureHistoryAccess(
      {
        stageItemId: existing.stageItemId ?? undefined,
        stageCode: existing.stageCode,
      },
      actor,
    );

    if (existing.committed) {
      throw new BadRequestException(
        'This history entry has already been committed to TableCT and cannot be deleted.',
      );
    }

    const isLocked = await this.prismaService.tableCT.findFirst({
      where: existing.stageItemId
        ? {
            stageItemId: existing.stageItemId,
            confirmed: true,
          }
        : {
            no: existing.stageCode,
            confirmed: true,
          },
      select: { id: true },
    });

    if (isLocked) {
      throw new BadRequestException(
        'This history entry is locked because the related TableCT row has been confirmed.',
      );
    }

    await this.prismaService.historyEntry.delete({
      where: { id },
    });

    await this.deleteLogService.logDelete({
      actor,
      entityType: 'HistoryPlayback',
      entityId: existing.id,
      entityLabel: `${existing.stageCode} - ${existing.type}`,
      metadata: {
        stageCode: existing.stageCode,
        stageItemId: existing.stageItemId,
        startTime: existing.startTime,
        endTime: existing.endTime,
        type: existing.type,
        value: existing.value,
        ctColumn: existing.ctColumn,
        committed: existing.committed,
      },
    });

    return { success: true, id };
  }

  private async ensureTable() {
    await this.prismaService.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.History', N'U') IS NOT NULL
         AND OBJECT_ID(N'dbo.HistoryPlayback', N'U') IS NULL
      BEGIN
        EXEC sp_rename 'dbo.History', 'HistoryPlayback';
      END

      IF OBJECT_ID(N'dbo.HistoryEntry', N'U') IS NOT NULL
         AND OBJECT_ID(N'dbo.HistoryPlayback', N'U') IS NULL
      BEGIN
        EXEC sp_rename 'dbo.HistoryEntry', 'HistoryPlayback';
      END

      IF OBJECT_ID(N'dbo.HistoryPlayback', N'U') IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM sys.columns c
           INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
           WHERE c.object_id = OBJECT_ID(N'dbo.HistoryPlayback')
             AND c.name = 'id'
             AND t.name <> 'uniqueidentifier'
         )
      BEGIN
        DROP TABLE [dbo].[HistoryPlayback];
      END

      IF OBJECT_ID(N'dbo.HistoryPlayback', N'U') IS NULL
      BEGIN
        CREATE TABLE [dbo].[HistoryPlayback] (
          [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [HistoryPlayback_id_df] DEFAULT NEWID(),
          [stageItemId] UNIQUEIDENTIFIER NULL,
          [stageCode] NVARCHAR(50) NOT NULL,
          [startTime] FLOAT NOT NULL,
          [endTime] FLOAT NOT NULL,
          [type] NVARCHAR(20) NOT NULL,
          [value] FLOAT NOT NULL,
          [ctColumn] NVARCHAR(20) NULL,
          [committed] BIT NOT NULL CONSTRAINT [HistoryPlayback_committed_df] DEFAULT 0,
          [createdAt] DATETIME2 NOT NULL CONSTRAINT [HistoryPlayback_createdAt_df] DEFAULT SYSUTCDATETIME(),
          [updatedAt] DATETIME2 NOT NULL CONSTRAINT [HistoryPlayback_updatedAt_df] DEFAULT SYSUTCDATETIME(),
          CONSTRAINT [HistoryPlayback_pkey] PRIMARY KEY ([id])
        );
      END

      IF COL_LENGTH('dbo.HistoryPlayback', 'committed') IS NULL
      BEGIN
        ALTER TABLE [dbo].[HistoryPlayback]
        ADD [committed] BIT NOT NULL CONSTRAINT [HistoryPlayback_committed_df] DEFAULT 0;
      END

      IF COL_LENGTH('dbo.HistoryPlayback', 'stageItemId') IS NULL
      BEGIN
        ALTER TABLE [dbo].[HistoryPlayback]
        ADD [stageItemId] UNIQUEIDENTIFIER NULL;
      END

      IF COL_LENGTH('dbo.HistoryPlayback', 'ctColumn') IS NULL
      BEGIN
        ALTER TABLE [dbo].[HistoryPlayback]
        ADD [ctColumn] NVARCHAR(20) NULL;
      END

      IF EXISTS (
        SELECT 1
        FROM sys.columns c
        INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID(N'dbo.HistoryPlayback')
          AND c.name = 'startTime'
          AND t.name = 'int'
      )
      BEGIN
        DECLARE @startTimeConstraint NVARCHAR(128);
        SELECT @startTimeConstraint = dc.name
        FROM sys.default_constraints dc
        INNER JOIN sys.columns c
          ON dc.parent_object_id = c.object_id
         AND dc.parent_column_id = c.column_id
        WHERE dc.parent_object_id = OBJECT_ID(N'dbo.HistoryPlayback')
          AND c.name = 'startTime';

        IF @startTimeConstraint IS NOT NULL
        BEGIN
          EXEC('ALTER TABLE [dbo].[HistoryPlayback] DROP CONSTRAINT [' + @startTimeConstraint + ']');
        END

        ALTER TABLE [dbo].[HistoryPlayback] ALTER COLUMN [startTime] FLOAT NOT NULL;
      END

      IF EXISTS (
        SELECT 1
        FROM sys.columns c
        INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID(N'dbo.HistoryPlayback')
          AND c.name = 'endTime'
          AND t.name = 'int'
      )
      BEGIN
        DECLARE @endTimeConstraint NVARCHAR(128);
        SELECT @endTimeConstraint = dc.name
        FROM sys.default_constraints dc
        INNER JOIN sys.columns c
          ON dc.parent_object_id = c.object_id
         AND dc.parent_column_id = c.column_id
        WHERE dc.parent_object_id = OBJECT_ID(N'dbo.HistoryPlayback')
          AND c.name = 'endTime';

        IF @endTimeConstraint IS NOT NULL
        BEGIN
          EXEC('ALTER TABLE [dbo].[HistoryPlayback] DROP CONSTRAINT [' + @endTimeConstraint + ']');
        END

        ALTER TABLE [dbo].[HistoryPlayback] ALTER COLUMN [endTime] FLOAT NOT NULL;
      END
    `);
  }

  private async ensureStageOwnerColumn() {
    await this.prismaService.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.StageList', N'U') IS NOT NULL
         AND COL_LENGTH('dbo.StageList', 'ownerUserId') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [ownerUserId] UNIQUEIDENTIFIER NULL;
      END
    `);
  }

  private async ensureHistoryAccess(
    filters: { stageItemId?: string; stageCode?: string },
    actor?: JwtUserPayload,
  ) {
    await this.ensureStageOwnerColumn();

    if (!actor?.sub) {
      return;
    }

    const stageItemId = filters.stageItemId?.trim();
    const stageCode = filters.stageCode?.trim().toUpperCase();

    if (!stageItemId && !stageCode) {
      return;
    }

    const accessibleStage = await this.prismaService.stageList.findFirst({
      where: {
        ownerUserId: actor.sub,
        ...(stageItemId ? { id: stageItemId } : {}),
        ...(!stageItemId && stageCode ? { code: stageCode } : {}),
      },
      select: { id: true },
    });

    if (!accessibleStage) {
      throw new NotFoundException('History item was not found.');
    }
  }
}

function formatTime(totalSeconds: number) {
  const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const secs = Math.floor(totalSeconds % 60);
  const hundredths = Math.round((totalSeconds - Math.floor(totalSeconds)) * 100);
  return `${mins}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

function normalizeCtColumn(value?: string) {
  const normalized = value?.trim().toUpperCase();
  return normalized || null;
}
