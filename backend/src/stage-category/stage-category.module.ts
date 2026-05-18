import { Module } from '@nestjs/common';

import { StageCategoryController } from './stage-category.controller';
import { StageCategoryService } from './stage-category.service';

@Module({
  controllers: [StageCategoryController],
  providers: [StageCategoryService],
  exports: [StageCategoryService],
})
export class StageCategoryModule {}
