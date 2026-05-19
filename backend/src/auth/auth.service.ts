import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UsersService } from '../users/users.service';
import { DeleteLogService } from '../delete-log/delete-log.service';
import { hashPassword, verifyPassword } from '../users/password.util';
import { AuthenticatedUser, JwtUserPayload } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly deleteLogService: DeleteLogService,
  ) {}

  async validateUser(
    username: string,
    password: string,
  ): Promise<AuthenticatedUser | null> {
    const normalizedUsername = username?.trim().toLowerCase();
    const normalizedPassword = password ?? '';

    if (!normalizedUsername || !normalizedPassword) {
      return null;
    }

    const user = await this.usersService.findByUsername(normalizedUsername);

    if (!user || !verifyPassword(normalizedPassword, user.passwordHash)) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      factory: user.factory,
      role: user.role,
    };
  }

  async signIn(user: AuthenticatedUser, category: string) {
    const normalizedCategory = category?.trim();

    if (!normalizedCategory) {
      throw new UnauthorizedException('Category is required.');
    }

    const tokens = await this.issueTokens(user, normalizedCategory);

    return {
      ...tokens,
      user: {
        username: user.username,
        displayName: user.displayName,
        category: normalizedCategory,
        factory: user.factory,
        role: user.role,
      },
    };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken?.trim()) {
      throw new UnauthorizedException('Refresh token is required.');
    }

    let payload: JwtUserPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtUserPayload>(refreshToken, {
        secret: this.getRefreshTokenSecret(),
      });
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }

    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Refresh token is invalid.');
    }

    const user = await this.usersService.findById(payload.sub);

    if (
      !user?.refreshTokenHash ||
      !verifyPassword(refreshToken, user.refreshTokenHash)
    ) {
      throw new UnauthorizedException('Refresh token is invalid.');
    }

    const category = payload.category || 'LSA';
    const tokens = await this.issueTokens(
      {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        factory: user.factory,
        role: user.role,
      },
      category,
    );

    return {
      ...tokens,
      user: {
        username: user.username,
        displayName: user.displayName,
        category,
        factory: user.factory,
        role: user.role,
      },
    };
  }

  async register(payload: RegisterDto, actor: JwtUserPayload) {
    this.ensureAdmin(actor);

    const username = payload.username?.trim().toLowerCase();
    const password = payload.password ?? '';
    const displayName = payload.displayName?.trim();
    const factory = this.normalizeFactory(payload.factory);
    const role = this.normalizeRole(payload.role);

    if (!username || !password || !displayName) {
      throw new BadRequestException(
        'Username, password, and display name are required.',
      );
    }

    const existingUser = await this.usersService.findByUsername(username);

    if (existingUser) {
      throw new ConflictException('Username already exists.');
    }

    const createdUser = await this.usersService.createUser({
      username,
      password,
      displayName,
      factory,
      role,
    });

    return {
      user: {
        id: createdUser.id,
        username: createdUser.username,
        displayName: createdUser.displayName,
        factory: createdUser.factory,
        role: createdUser.role,
      },
    };
  }

  async listUsers(actor: JwtUserPayload) {
    this.ensureAdmin(actor);

    const users = await this.usersService.listUsers();

    return {
      users: users.map((user) => ({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        factory: user.factory,
        role: user.role,
      })),
    };
  }

  async deleteUser(userId: string, actor: JwtUserPayload) {
    this.ensureAdmin(actor);

    if (!userId?.trim()) {
      throw new BadRequestException('User id is invalid.');
    }

    if (userId === actor.sub) {
      throw new ForbiddenException('You cannot delete your own account.');
    }

    const existingUser = await this.usersService.findById(userId);

    if (!existingUser) {
      throw new NotFoundException('User not found.');
    }

    if (existingUser.username === 'admin') {
      throw new ForbiddenException('The default administrator cannot be deleted.');
    }

    await this.usersService.deleteUser(userId);
    await this.deleteLogService.logDelete({
      actor,
      entityType: 'User',
      entityId: existingUser.id,
      entityLabel: existingUser.username,
      metadata: {
        username: existingUser.username,
        displayName: existingUser.displayName,
        factory: existingUser.factory,
        role: existingUser.role,
      },
    });

    return {
      success: true,
    };
  }

  async login(payload: LoginDto) {
    const user = await this.validateUser(payload.username, payload.password);

    if (!user) {
      throw new UnauthorizedException('Incorrect username or password.');
    }

    return this.signIn(user, payload.category);
  }

  private async issueTokens(user: AuthenticatedUser, category: string) {
    const payload = {
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
      category,
      factory: user.factory,
      role: user.role,
    };
    const accessToken = await this.jwtService.signAsync(
      { ...payload, tokenType: 'access' },
      { expiresIn: '15m' },
    );
    const refreshToken = await this.jwtService.signAsync(
      { ...payload, tokenType: 'refresh' },
      {
        secret: this.getRefreshTokenSecret(),
        expiresIn: '30d',
      },
    );

    await this.usersService.setRefreshTokenHash(
      user.id,
      hashPassword(refreshToken),
    );

    return { accessToken, refreshToken };
  }

  private getRefreshTokenSecret() {
    return (
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      this.configService.getOrThrow<string>('JWT_SECRET')
    );
  }

  private ensureAdmin(actor: JwtUserPayload) {
    if (actor.role !== 'admin') {
      throw new ForbiddenException('Administrator role is required.');
    }
  }

  private normalizeRole(role?: string) {
    return role?.trim().toLowerCase() === 'admin' ? 'admin' : 'user';
  }

  private normalizeFactory(factory?: string) {
    const normalized = factory?.trim().toUpperCase();
    return normalized && ['LYV', 'LHG', 'LVL', 'LYM'].includes(normalized)
      ? normalized
      : 'LYV';
  }
}
