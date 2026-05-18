import { Body, Controller, Get, Put, Query } from '@nestjs/common';

import type { UpsertControlSessionDto } from './dto/upsert-control-session.dto';
import { ControlSessionService } from './control-session.service';

@Controller('control-session')
export class ControlSessionController {
  constructor(private readonly controlSessionService: ControlSessionService) {}

  @Get()
  getSession(
    @Query('stageItemId') stageItemId?: string,
    @Query('stageCode') stageCode?: string,
  ) {
    return this.controlSessionService.getSession({ stageItemId, stageCode });
  }

  @Put()
  upsertSession(@Body() payload: UpsertControlSessionDto) {
    return this.controlSessionService.upsertSession(payload);
  }
}
