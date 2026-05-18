import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';

import type { CreateStageCategoryDto } from './dto/create-stage-category.dto';
import type { UpdateStageCategoryDto } from './dto/update-stage-category.dto';
import { StageCategoryService } from './stage-category.service';

@Controller('stage-categories')
export class StageCategoryController {
  constructor(private readonly stageCategoryService: StageCategoryService) {}

  @Get()
  getCategories() {
    return this.stageCategoryService.listCategories();
  }

  @Post()
  createCategory(@Body() payload: CreateStageCategoryDto) {
    return this.stageCategoryService.createCategory(payload);
  }

  @Patch(':id')
  updateCategory(@Param('id') id: string, @Body() payload: UpdateStageCategoryDto) {
    return this.stageCategoryService.updateCategory(id, payload);
  }

  @Delete(':id')
  deleteCategory(@Param('id') id: string) {
    return this.stageCategoryService.deleteCategory(id);
  }
}
