import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import type { JwtUserPayload } from '../auth/auth.types';
import type { CreateHistoryDto } from './dto/create-history.dto';
import { HistoryService } from './history.service';

@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get()
  getHistory(
    @Req()
    request: Request & {
      user: JwtUserPayload;
    },
    @Query('stageItemId') stageItemId?: string,
    @Query('stageCode') stageCode?: string,
  ) {
    return this.historyService.listHistory({ stageItemId, stageCode }, request.user);
  }

  @Post()
  createHistory(
    @Body() payload: CreateHistoryDto,
    @Req()
    request: Request & {
      user: JwtUserPayload;
    },
  ) {
    return this.historyService.createHistory(payload, request.user);
  }

  @Patch('commit')
  commitHistory(
    @Req()
    request: Request & {
      user: JwtUserPayload;
    },
    @Body('stageItemId') stageItemId?: string,
    @Body('stageCode') stageCode?: string,
  ) {
    return this.historyService.commitHistory({ stageItemId, stageCode }, request.user);
  }

  @Delete(':id')
  deleteHistory(
    @Param('id') id: string,
    @Req()
    request: Request & {
      user: JwtUserPayload;
    },
  ) {
    return this.historyService.deleteHistory(id, request.user);
  }
}
