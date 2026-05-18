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

  @Public()
  @Post('register')
  register(@Body() payload: RegisterDto) {
    return this.authService.register(payload);
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
  getUsers() {
    return this.authService.listUsers();
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
