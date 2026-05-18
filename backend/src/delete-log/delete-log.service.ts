import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { JwtUserPayload } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

type DeleteLogPayload = {
  actor?: JwtUserPayload | null;
  entityType: string;
  entityId: string;
  entityLabel: string;
  metadata?: Record<string, unknown>;
};

type ListDeleteLogsFilters = {
  entityType?: string;
  username?: string;
  search?: string;
};

@Injectable()
export class DeleteLogService implements OnModuleInit {
  constructor(private readonly prismaService: PrismaService) {}

  async onModuleInit() {
    await this.ensureTable();
  }

  async logDelete(payload: DeleteLogPayload) {
    await this.ensureTable();

    await this.prismaService.$executeRaw(
      Prisma.sql`
        INSERT INTO [dbo].[DeleteLog] (
          [entityType],
          [entityId],
          [entityLabel],
          [actorUserId],
          [actorUsername],
          [metadata]
        )
        VALUES (
          ${payload.entityType},
          ${payload.entityId},
          ${payload.entityLabel},
          ${payload.actor?.sub ?? null},
          ${payload.actor?.username ?? null},
          ${payload.metadata ? JSON.stringify(payload.metadata) : null}
        )
      `,
    );
  }

  async listLogs(filters: ListDeleteLogsFilters = {}) {
    await this.ensureTable();

    const conditions: Prisma.Sql[] = [];
    const normalizedEntityType = filters.entityType?.trim();
    const normalizedUsername = filters.username?.trim();
    const normalizedSearch = filters.search?.trim();

    if (normalizedEntityType) {
      conditions.push(Prisma.sql`[entityType] = ${normalizedEntityType}`);
    }

    if (normalizedUsername) {
      conditions.push(
        Prisma.sql`[actorUsername] LIKE ${`%${normalizedUsername}%`}`,
      );
    }

    if (normalizedSearch) {
      const pattern = `%${normalizedSearch}%`;
      conditions.push(
        Prisma.sql`(
          [entityLabel] LIKE ${pattern}
          OR [entityId] LIKE ${pattern}
          OR [metadata] LIKE ${pattern}
          OR [actorUsername] LIKE ${pattern}
        )`,
      );
    }

    const whereClause =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.empty;

    const rows = await this.prismaService.$queryRaw<
      Array<{
        id: string;
        entityType: string;
        entityId: string;
        entityLabel: string;
        actorUserId: string | null;
        actorUsername: string | null;
        metadata: string | null;
        createdAt: Date;
      }>
    >(
      Prisma.sql`
        SELECT
          [id],
          [entityType],
          [entityId],
          [entityLabel],
          [actorUserId],
          [actorUsername],
          [metadata],
          [createdAt]
        FROM [dbo].[DeleteLog]
        ${whereClause}
        ORDER BY [createdAt] DESC, [id] DESC
      `,
    );

    return {
      logs: rows.map((row) => ({
        id: row.id,
        entityType: row.entityType,
        entityId: row.entityId,
        entityLabel: row.entityLabel,
        actorUserId: row.actorUserId,
        actorUsername: row.actorUsername,
        metadata: safeParseJson(row.metadata),
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  private async ensureTable() {
    await this.prismaService.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.DeleteLog', N'U') IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM sys.columns c
           INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
           WHERE c.object_id = OBJECT_ID(N'dbo.DeleteLog')
             AND c.name = 'id'
             AND t.name <> 'uniqueidentifier'
         )
      BEGIN
        DROP TABLE [dbo].[DeleteLog];
      END

      IF OBJECT_ID(N'dbo.DeleteLog', N'U') IS NULL
      BEGIN
        CREATE TABLE [dbo].[DeleteLog] (
          [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DeleteLog_id_df] DEFAULT NEWID(),
          [entityType] NVARCHAR(100) NOT NULL,
          [entityId] NVARCHAR(100) NOT NULL,
          [entityLabel] NVARCHAR(255) NOT NULL,
          [actorUserId] UNIQUEIDENTIFIER NULL,
          [actorUsername] NVARCHAR(100) NULL,
          [metadata] NVARCHAR(MAX) NULL,
          [createdAt] DATETIME2 NOT NULL CONSTRAINT [DeleteLog_createdAt_df] DEFAULT SYSUTCDATETIME(),
          CONSTRAINT [DeleteLog_pkey] PRIMARY KEY ([id])
        );
      END
    `);
  }
}

function safeParseJson(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return { raw: value };
  }
}
