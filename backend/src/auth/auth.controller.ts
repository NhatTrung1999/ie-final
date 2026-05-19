import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import type { LoginDto } from './dto/login.dto';
import type { RefreshTokenDto } from './dto/refresh-token.dto';
import type { RegisterDto } from './dto/register.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { AuthenticatedUser, JwtUserPayload } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  login(
    @Req()
    request: Request & {
      user: AuthenticatedUser;
      body: LoginDto;
    },
  ) {
    return this.authService.signIn(request.user, request.body.category);
  }

  @Post('register')
  register(
    @Body() payload: RegisterDto,
    @Req()
    request: Request & {
      user: JwtUserPayload;
    },
  ) {
    return this.authService.register(payload, request.user);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() payload: RefreshTokenDto) {
    return this.authService.refresh(payload.refreshToken);
  }

  @Get('me')
  getProfile(
    @Req()
    request: Request & {
      user: JwtUserPayload;
    },
  ) {
    return {
      user: request.user,
    };
  }

  @Get('users')
  getUsers(
    @Req()
    request: Request & {
      user: JwtUserPayload;
    },
  ) {
    return this.authService.listUsers(request.user);
  }

  @Delete('users/:id')
  deleteUser(
    @Param('id') id: string,
    @Req()
    request: Request & {
      user: JwtUserPayload;
    },
  ) {
    return this.authService.deleteUser(id, request.user);
  }
}
