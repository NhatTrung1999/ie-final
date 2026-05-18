import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from './password.util';

export type AppUser = {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
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
  }): Promise<AppUser> {
    await this.ensureAuthTable();
    return this.prismaService.user.create({
      data: {
        username: payload.username,
        passwordHash: hashPassword(payload.password),
        displayName: payload.displayName,
      },
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
        },
      });
      return;
    }

    await this.prismaService.user.create({
      data: {
        username: 'admin',
        passwordHash: hashPassword('test'),
        displayName: 'Admin',
      },
    });
  }
}
