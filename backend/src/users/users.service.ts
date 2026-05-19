import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from './password.util';

export type AppUser = {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  factory: string;
  role: string;
  refreshTokenHash: string | null;
};

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(private readonly prismaService: PrismaService) {}

  async onModuleInit() {
    await this.ensureAuthTable();
    await this.ensureDefaultUser();
  }

  async findByUsername(username: string): Promise<AppUser | null> {
    await this.ensureAuthTable();
    return this.prismaService.user.findUnique({
      where: { username },
    });
  }

  async findById(id: string): Promise<AppUser | null> {
    await this.ensureAuthTable();
    return this.prismaService.user.findUnique({
      where: { id },
    });
  }

  async listUsers(): Promise<AppUser[]> {
    await this.ensureAuthTable();
    return this.prismaService.user.findMany({
      orderBy: [{ username: 'asc' }],
    });
  }

  async createUser(payload: {
    username: string;
    password: string;
    displayName: string;
    factory?: string;
    role?: string;
  }): Promise<AppUser> {
    await this.ensureAuthTable();
    return this.prismaService.user.create({
      data: {
        username: payload.username,
        passwordHash: hashPassword(payload.password),
        displayName: payload.displayName,
        factory: normalizeFactory(payload.factory),
        role: normalizeRole(payload.role),
      },
    });
  }

  async setRefreshTokenHash(id: string, refreshTokenHash: string | null) {
    await this.ensureAuthTable();
    await this.prismaService.user.update({
      where: { id },
      data: { refreshTokenHash },
    });
  }

  async deleteUser(id: string) {
    await this.ensureAuthTable();
    await this.prismaService.user.delete({
      where: { id },
    });
  }

  private async ensureAuthTable() {
    await this.prismaService.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.IE_AuthUserUuid', N'U') IS NOT NULL
         AND OBJECT_ID(N'dbo.[User]', N'U') IS NULL
      BEGIN
        EXEC sp_rename 'dbo.IE_AuthUserUuid', 'User';
      END

      IF OBJECT_ID(N'dbo.AuthUser', N'U') IS NOT NULL
         AND OBJECT_ID(N'dbo.[User]', N'U') IS NULL
      BEGIN
        EXEC sp_rename 'dbo.AuthUser', 'User';
      END

      IF OBJECT_ID(N'dbo.[User]', N'U') IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM sys.columns c
           INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
           WHERE c.object_id = OBJECT_ID(N'dbo.[User]')
             AND c.name = 'id'
             AND t.name <> 'uniqueidentifier'
         )
      BEGIN
        DROP TABLE [dbo].[User];
      END

      IF OBJECT_ID(N'dbo.[User]', N'U') IS NULL
      BEGIN
        CREATE TABLE [dbo].[User] (
          [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [User_id_df] DEFAULT NEWID(),
          [username] NVARCHAR(100) NOT NULL,
          [passwordHash] NVARCHAR(255) NOT NULL,
          [displayName] NVARCHAR(150) NOT NULL,
          [factory] NVARCHAR(50) NOT NULL CONSTRAINT [User_factory_df] DEFAULT N'LYV',
          [role] NVARCHAR(50) NOT NULL CONSTRAINT [User_role_df] DEFAULT N'user',
          [refreshTokenHash] NVARCHAR(255) NULL,
          [createdAt] DATETIME2 NOT NULL CONSTRAINT [User_createdAt_df] DEFAULT SYSUTCDATETIME(),
          [updatedAt] DATETIME2 NOT NULL CONSTRAINT [User_updatedAt_df] DEFAULT SYSUTCDATETIME(),
          CONSTRAINT [User_pkey] PRIMARY KEY ([id]),
          CONSTRAINT [User_username_key] UNIQUE ([username])
        );
      END

      IF COL_LENGTH('dbo.[User]', 'createdAt') IS NULL
      BEGIN
        ALTER TABLE [dbo].[User]
        ADD [createdAt] DATETIME2 NOT NULL CONSTRAINT [User_createdAt_df] DEFAULT SYSUTCDATETIME();
      END

      IF COL_LENGTH('dbo.[User]', 'updatedAt') IS NULL
      BEGIN
        ALTER TABLE [dbo].[User]
        ADD [updatedAt] DATETIME2 NOT NULL CONSTRAINT [User_updatedAt_df] DEFAULT SYSUTCDATETIME();
      END

      IF COL_LENGTH('dbo.[User]', 'factory') IS NULL
      BEGIN
        ALTER TABLE [dbo].[User]
        ADD [factory] NVARCHAR(50) NOT NULL CONSTRAINT [User_factory_df] DEFAULT N'LYV';
      END

      UPDATE [dbo].[User]
      SET [factory] = N'LYV'
      WHERE [factory] IS NULL OR UPPER(LTRIM(RTRIM([factory]))) NOT IN (N'LYV', N'LHG', N'LVL', N'LYM');

      UPDATE [dbo].[User]
      SET [factory] = UPPER(LTRIM(RTRIM([factory])))
      WHERE [factory] IS NOT NULL;

      IF COL_LENGTH('dbo.[User]', 'refreshTokenHash') IS NULL
      BEGIN
        ALTER TABLE [dbo].[User]
        ADD [refreshTokenHash] NVARCHAR(255) NULL;
      END

      IF COL_LENGTH('dbo.[User]', 'role') IS NULL
      BEGIN
        ALTER TABLE [dbo].[User]
        ADD [role] NVARCHAR(50) NOT NULL CONSTRAINT [User_role_df] DEFAULT N'user';
      END
    `);
  }

  private async ensureDefaultUser() {
    const adminUser = await this.prismaService.user.findUnique({
      where: { username: 'admin' },
    });

    if (adminUser) {
      await this.prismaService.user.update({
        where: { id: adminUser.id },
        data: {
          passwordHash: hashPassword('test'),
          displayName: 'Admin',
          factory: normalizeFactory(adminUser.factory),
          role: 'admin',
        },
      });
      return;
    }

    const legacyAdministrator = await this.prismaService.user.findUnique({
      where: { username: 'administrator' },
    });

    if (legacyAdministrator) {
      await this.prismaService.user.update({
        where: { id: legacyAdministrator.id },
        data: {
          username: 'admin',
          passwordHash: hashPassword('test'),
          displayName: 'Admin',
          factory: normalizeFactory(legacyAdministrator.factory),
          role: 'admin',
        },
      });
      return;
    }

    await this.prismaService.user.create({
      data: {
        username: 'admin',
        passwordHash: hashPassword('test'),
        displayName: 'Admin',
        factory: 'LYV',
        role: 'admin',
      },
    });
  }
}

function normalizeRole(role?: string) {
  return role?.trim().toLowerCase() === 'admin' ? 'admin' : 'user';
}

function normalizeFactory(factory?: string) {
  const normalized = factory?.trim().toUpperCase();
  return normalized && ['LYV', 'LHG', 'LVL', 'LYM'].includes(normalized)
    ? normalized
    : 'LYV';
}
