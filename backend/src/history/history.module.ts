import { Module } from '@nestjs/common';

import { DeleteLogModule } from '../delete-log/delete-log.module';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

@Module({
  imports: [DeleteLogModule],
  controllers: [HistoryController],
  providers: [HistoryService],
  exports: [HistoryService],
})
export class HistoryModule {}
