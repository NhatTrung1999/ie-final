import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { UpsertControlSessionDto } from './dto/upsert-control-session.dto';

@Injectable()
export class ControlSessionService implements OnModuleInit {
  constructor(private readonly prismaService: PrismaService) {}

  async onModuleInit() {
    await this.ensureTable();
  }

  async getSession(filters: { stageItemId?: string; stageCode?: string }) {
    await this.ensureTable();

    const normalizedStageItemId = filters.stageItemId?.trim();
    const normalizedStageCode = filters.stageCode?.trim().toUpperCase();

    if (!normalizedStageItemId && !normalizedStageCode) {
      return { session: null };
    }

    const session = normalizedStageItemId
      ? await this.prismaService.controlSession.findFirst({
          where: { stageItemId: normalizedStageItemId },
        })
      : await this.prismaService.controlSession.findFirst({
          where: { stageCode: normalizedStageCode! },
        });

    return {
      session: session ? this.mapSession(session) : null,
    };
  }

  async upsertSession(payload: UpsertControlSessionDto) {
    await this.ensureTable();

    const stageItemId = payload.stageItemId?.trim() || null;
    const stageCode = payload.stageCode?.trim().toUpperCase();

    if (!stageItemId && !stageCode) {
      throw new BadRequestException('Stage item id or stage code is required.');
    }

    const nextElapsed = normalizeNumber(payload.elapsed, 'Elapsed');
    const nextSegmentStart = normalizeNumber(payload.segmentStart, 'Segment start');

    const updateData = {
      stageCode: stageCode ?? '',
      stageItemId,
      elapsed: nextElapsed,
      isRunning: Boolean(payload.isRunning),
      segmentStart: nextSegmentStart,
      nva: normalizeOptionalNumber(payload.nva),
      va: normalizeOptionalNumber(payload.va),
      skip: normalizeOptionalNumber(payload.skip),
    };

    const existing = stageItemId
      ? await this.prismaService.controlSession.findFirst({
          where: { stageItemId },
          select: { id: true },
        })
      : await this.prismaService.controlSession.findFirst({
          where: { stageCode: stageCode! },
          select: { id: true },
        });

    const saved = existing
      ? await this.prismaService.controlSession.update({
          where: { id: existing.id },
          data: updateData,
        })
      : await this.prismaService.controlSession.create({
          data: updateData,
        });

    return {
      session: this.mapSession(saved),
    };
  }

  private mapSession(session: {
    id: string;
    stageItemId: string | null;
    stageCode: string;
    elapsed: number;
    isRunning: boolean;
    segmentStart: number;
    nva: number | null;
    va: number | null;
    skip: number | null;
  }) {
    return {
      id: session.id,
      stageItemId: session.stageItemId ?? null,
      stageCode: session.stageCode,
      elapsed: session.elapsed,
      isRunning: session.isRunning,
      segmentStart: session.segmentStart,
      nva: session.nva,
      va: session.va,
      skip: session.skip,
    };
  }

  private async ensureTable() {
    await this.prismaService.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.ControlSession', N'U') IS NOT NULL
         AND OBJECT_ID(N'dbo.ControlPanel', N'U') IS NULL
      BEGIN
        EXEC sp_rename 'dbo.ControlSession', 'ControlPanel';
      END

      IF OBJECT_ID(N'dbo.ControlPanel', N'U') IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM sys.columns c
           INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
           WHERE c.object_id = OBJECT_ID(N'dbo.ControlPanel')
             AND c.name = 'id'
             AND t.name <> 'uniqueidentifier'
         )
      BEGIN
        DROP TABLE [dbo].[ControlPanel];
      END

      IF OBJECT_ID(N'dbo.ControlPanel', N'U') IS NULL
      BEGIN
        CREATE TABLE [dbo].[ControlPanel] (
          [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ControlPanel_id_df] DEFAULT NEWID(),
          [stageItemId] UNIQUEIDENTIFIER NULL,
          [stageCode] NVARCHAR(50) NOT NULL,
          [elapsed] FLOAT NOT NULL CONSTRAINT [ControlPanel_elapsed_df] DEFAULT 0,
          [isRunning] BIT NOT NULL CONSTRAINT [ControlPanel_isRunning_df] DEFAULT 0,
          [segmentStart] FLOAT NOT NULL CONSTRAINT [ControlPanel_segmentStart_df] DEFAULT 0,
          [nva] FLOAT NULL,
          [va] FLOAT NULL,
          [skip] FLOAT NULL,
          [createdAt] DATETIME2 NOT NULL CONSTRAINT [ControlPanel_createdAt_df] DEFAULT SYSUTCDATETIME(),
          [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ControlPanel_updatedAt_df] DEFAULT SYSUTCDATETIME(),
          CONSTRAINT [ControlPanel_pkey] PRIMARY KEY ([id]),
          CONSTRAINT [ControlPanel_stageItemId_key] UNIQUE ([stageItemId])
        );
      END

      IF COL_LENGTH('dbo.ControlPanel', 'stageItemId') IS NULL
      BEGIN
        ALTER TABLE [dbo].[ControlPanel]
        ADD [stageItemId] UNIQUEIDENTIFIER NULL;
      END

      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'ControlPanel_stageItemId_key'
          AND object_id = OBJECT_ID(N'dbo.ControlPanel')
      )
      BEGIN
        CREATE UNIQUE NONCLUSTERED INDEX [ControlPanel_stageItemId_key]
        ON [dbo].[ControlPanel] ([stageItemId])
        WHERE [stageItemId] IS NOT NULL;
      END

      DECLARE @stageCodeUniqueName NVARCHAR(128);
      SELECT @stageCodeUniqueName = kc.name
      FROM sys.key_constraints kc
      INNER JOIN sys.index_columns ic
        ON kc.parent_object_id = ic.object_id
       AND kc.unique_index_id = ic.index_id
      INNER JOIN sys.columns c
        ON ic.object_id = c.object_id
       AND ic.column_id = c.column_id
      WHERE kc.parent_object_id = OBJECT_ID(N'dbo.ControlPanel')
        AND kc.type = 'UQ'
        AND c.name = 'stageCode';

      IF @stageCodeUniqueName IS NOT NULL
      BEGIN
        EXEC('ALTER TABLE [dbo].[ControlPanel] DROP CONSTRAINT [' + @stageCodeUniqueName + ']');
      END

      DECLARE @stageCodeUniqueIndex NVARCHAR(128);
      SELECT TOP 1 @stageCodeUniqueIndex = i.name
      FROM sys.indexes i
      INNER JOIN sys.index_columns ic
        ON i.object_id = ic.object_id
       AND i.index_id = ic.index_id
      INNER JOIN sys.columns c
        ON ic.object_id = c.object_id
       AND ic.column_id = c.column_id
      WHERE i.object_id = OBJECT_ID(N'dbo.ControlPanel')
        AND i.is_unique = 1
        AND i.is_primary_key = 0
        AND i.is_unique_constraint = 0
        AND c.name = 'stageCode';

      IF @stageCodeUniqueIndex IS NOT NULL
      BEGIN
        EXEC('DROP INDEX [' + @stageCodeUniqueIndex + '] ON [dbo].[ControlPanel]');
      END

      IF EXISTS (
        SELECT 1
        FROM sys.columns c
        INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID(N'dbo.ControlPanel')
          AND c.name = 'elapsed'
          AND t.name = 'int'
      )
      BEGIN
        DECLARE @elapsedConstraint NVARCHAR(128);
        SELECT @elapsedConstraint = dc.name
        FROM sys.default_constraints dc
        INNER JOIN sys.columns c
          ON dc.parent_object_id = c.object_id
         AND dc.parent_column_id = c.column_id
        WHERE dc.parent_object_id = OBJECT_ID(N'dbo.ControlPanel')
          AND c.name = 'elapsed';

        IF @elapsedConstraint IS NOT NULL
        BEGIN
          EXEC('ALTER TABLE [dbo].[ControlPanel] DROP CONSTRAINT [' + @elapsedConstraint + ']');
        END

        ALTER TABLE [dbo].[ControlPanel] ALTER COLUMN [elapsed] FLOAT NOT NULL;
        ALTER TABLE [dbo].[ControlPanel]
        ADD CONSTRAINT [ControlPanel_elapsed_df] DEFAULT 0 FOR [elapsed];
      END

      IF EXISTS (
        SELECT 1
        FROM sys.columns c
        INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID(N'dbo.ControlPanel')
          AND c.name = 'segmentStart'
          AND t.name = 'int'
      )
      BEGIN
        DECLARE @segmentStartConstraint NVARCHAR(128);
        SELECT @segmentStartConstraint = dc.name
        FROM sys.default_constraints dc
        INNER JOIN sys.columns c
          ON dc.parent_object_id = c.object_id
         AND dc.parent_column_id = c.column_id
        WHERE dc.parent_object_id = OBJECT_ID(N'dbo.ControlPanel')
          AND c.name = 'segmentStart';

        IF @segmentStartConstraint IS NOT NULL
        BEGIN
          EXEC('ALTER TABLE [dbo].[ControlPanel] DROP CONSTRAINT [' + @segmentStartConstraint + ']');
        END

        ALTER TABLE [dbo].[ControlPanel] ALTER COLUMN [segmentStart] FLOAT NOT NULL;
        ALTER TABLE [dbo].[ControlPanel]
        ADD CONSTRAINT [ControlPanel_segmentStart_df] DEFAULT 0 FOR [segmentStart];
      END
    `);
  }
}

function normalizeNumber(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new BadRequestException(`${label} is invalid.`);
  }

  return Number(value.toFixed(1));
}

function normalizeOptionalNumber(value?: number | null) {
  if (typeof value === 'undefined' || value === null || Number.isNaN(value)) {
    return null;
  }

  return Number(value);
}
