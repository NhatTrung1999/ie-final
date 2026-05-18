import { Controller, Get, Query } from '@nestjs/common';

import { DeleteLogService } from './delete-log.service';

@Controller('delete-logs')
export class DeleteLogController {
  constructor(private readonly deleteLogService: DeleteLogService) {}

  @Get()
  getDeleteLogs(
    @Query('entityType') entityType?: string,
    @Query('username') username?: string,
    @Query('search') search?: string,
  ) {
    return this.deleteLogService.listLogs({ entityType, username, search });
  }
}
