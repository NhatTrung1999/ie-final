import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UsersService } from '../users/users.service';
import { DeleteLogService } from '../delete-log/delete-log.service';
import { verifyPassword } from '../users/password.util';
import { AuthenticatedUser, JwtUserPayload } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
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
    };
  }

  async signIn(user: AuthenticatedUser, category: string) {
    const normalizedCategory = category?.trim();

    if (!normalizedCategory) {
      throw new UnauthorizedException('Category is required.');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
      category: normalizedCategory,
    });

    return {
      accessToken,
      user: {
        username: user.username,
        displayName: user.displayName,
        category: normalizedCategory,
      },
    };
  }

  async register(payload: RegisterDto) {
    const username = payload.username?.trim().toLowerCase();
    const password = payload.password ?? '';
    const displayName = payload.displayName?.trim();

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
    });

    return {
      user: {
        id: createdUser.id,
        username: createdUser.username,
        displayName: createdUser.displayName,
      },
    };
  }

  async listUsers() {
    const users = await this.usersService.listUsers();

    return {
      users: users.map((user) => ({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      })),
    };
  }

  async deleteUser(userId: string, actor: JwtUserPayload) {
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
}
