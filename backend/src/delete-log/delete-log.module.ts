import { Module } from '@nestjs/common';

import { DeleteLogController } from './delete-log.controller';
import { DeleteLogService } from './delete-log.service';

@Module({
  controllers: [DeleteLogController],
  providers: [DeleteLogService],
  exports: [DeleteLogService],
})
export class DeleteLogModule {}
