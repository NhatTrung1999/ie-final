import { Module } from '@nestjs/common';

import { DeleteLogModule } from '../delete-log/delete-log.module';
import { StageCategoryModule } from '../stage-category/stage-category.module';
import { StageController } from './stage.controller';
import { StageService } from './stage.service';

@Module({
  imports: [DeleteLogModule, StageCategoryModule],
  controllers: [StageController],
  providers: [StageService],
  exports: [StageService],
})
export class StageModule {}
