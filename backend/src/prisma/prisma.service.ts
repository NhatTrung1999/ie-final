import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {
    const connectionString = configService.get<string>('DATABASE_URL');

    if (!connectionString) {
      throw new Error('DATABASE_URL is required for Prisma.');
    }

    super({
      adapter: new PrismaMssql(
        parseSqlServerConnectionString(connectionString),
      ),
    });
  }

  async onModuleInit() {
    await this.$connect();
    await this.ensureStageListColumns();
    await this.ensureStageItemLinkColumns();
  }

  async enableShutdownHooks(app: INestApplication) {
    (
      this as PrismaClient & {
        $on(event: 'beforeExit', callback: () => Promise<void>): void;
      }
    ).$on('beforeExit', async () => {
      await app.close();
    });
  }

  get machineType() {
    return super.machineType;
  }

  private async ensureStageListColumns() {
    await this.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.StageList', N'U') IS NOT NULL
         AND COL_LENGTH('dbo.StageList', 'season') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [season] NVARCHAR(100) NULL;
      END
    `);

    await this.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.StageList', N'U') IS NOT NULL
         AND COL_LENGTH('dbo.StageList', 'cutDie') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [cutDie] NVARCHAR(100) NULL;
      END
    `);

    await this.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.StageList', N'U') IS NOT NULL
         AND COL_LENGTH('dbo.StageList', 'area') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [area] NVARCHAR(50) NULL;
      END
    `);

    await this.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.StageList', N'U') IS NOT NULL
         AND COL_LENGTH('dbo.StageList', 'area') IS NOT NULL
      BEGIN
        UPDATE [dbo].[StageList]
        SET [area] = [stage]
        WHERE [area] IS NULL;
      END
    `);
  }

  private async ensureStageItemLinkColumns() {
    await this.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.HistoryPlayback', N'U') IS NOT NULL
         AND COL_LENGTH('dbo.HistoryPlayback', 'stageItemId') IS NULL
      BEGIN
        ALTER TABLE [dbo].[HistoryPlayback]
        ADD [stageItemId] UNIQUEIDENTIFIER NULL;
      END
    `);

    await this.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.ControlPanel', N'U') IS NOT NULL
         AND COL_LENGTH('dbo.ControlPanel', 'stageItemId') IS NULL
      BEGIN
        ALTER TABLE [dbo].[ControlPanel]
        ADD [stageItemId] UNIQUEIDENTIFIER NULL;
      END
    `);

    await this.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.ControlPanel', N'U') IS NOT NULL
         AND NOT EXISTS (
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
    `);
  }
}

function parseSqlServerConnectionString(connectionString: string) {
  const normalized = connectionString.replace(/^sqlserver:\/\//i, '');
  const [hostPort, ...segments] = normalized.split(';');
  const [server, portValue] = hostPort.split(':');
  const values = Object.fromEntries(
    segments
      .map((segment) => segment.split('='))
      .filter(([key, value]) => Boolean(key && value))
      .map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    server,
    port: Number(portValue || 1433),
    user: values.user || values.username || values.uid,
    password: values.password || values.pwd,
    database: values.database || values['initial catalog'],
    options: {
      encrypt: values.encrypt !== 'false',
      trustServerCertificate: values.trustservercertificate === 'true',
    },
  };
}
