import { Module } from '@nestjs/common';

import { DeleteLogModule } from '../delete-log/delete-log.module';
import { StageCategoryModule } from '../stage-category/stage-category.module';
import { TableCtController } from './table-ct.controller';
import { TableCtService } from './table-ct.service';

@Module({
  imports: [DeleteLogModule, StageCategoryModule],
  controllers: [TableCtController],
  providers: [TableCtService],
  exports: [TableCtService],
})
export class TableCtModule {}
