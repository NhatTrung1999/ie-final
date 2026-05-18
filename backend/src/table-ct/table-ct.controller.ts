import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import type { JwtUserPayload } from '../auth/auth.types';
import { TableCtService } from './table-ct.service';
import type { ExportTableCtDto } from './dto/export-table-ct.dto';
import type { ConfirmTableCtRowsDto } from './dto/confirm-table-ct-rows.dto';
import type { UpdateTableCtMetricsDto } from './dto/update-table-ct-metrics.dto';
import type { ReorderTableCtDto } from './dto/reorder-table-ct.dto';
import type { UpdateTableCtDto } from './dto/update-table-ct.dto';

@Controller('table-ct')
export class TableCtController {
  constructor(private readonly tableCtService: TableCtService) {}

  @Get()
  getRows(
    @Query('stage') stage?: string,
    @Query('stageCode') stageCode?: string,
    @Query('stageItemId') stageItemId?: string,
  ) {
    return this.tableCtService.listRows({ stage, stageCode, stageItemId });
  }

  @Patch('reorder')
  reorderRows(@Body() payload: ReorderTableCtDto) {
    return this.tableCtService.reorderRows(payload);
  }

  @Patch('confirm')
  confirmRows(@Body() payload: ConfirmTableCtRowsDto) {
    return this.tableCtService.confirmRows(payload);
  }

  @Patch(':id')
  updateRow(@Param('id') id: string, @Body() payload: UpdateTableCtDto) {
    return this.tableCtService.updateRow(id, payload);
  }

  @Patch(':id/metrics')
  updateMetrics(
    @Param('id') id: string,
    @Body() payload: UpdateTableCtMetricsDto,
    @Req()
    request: Request & {
      user: JwtUserPayload;
    },
  ) {
    return this.tableCtService.updateMetrics(id, payload, request.user.category);
  }

  @Patch(':id/done')
  markDone(
    @Param('id') id: string,
    @Req()
    request: Request & {
      user: JwtUserPayload;
    },
  ) {
    return this.tableCtService.markDone(id, request.user.category);
  }

  @Post('export')
  async exportWorkbook(
    @Body() payload: ExportTableCtDto,
    @Req()
    request: Request & {
      user: JwtUserPayload;
    },
    @Res() response: Response,
  ) {
    const file = await this.tableCtService.exportWorkbook(payload, request.user.category);

    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );

    response.send(file.buffer);
  }

  @Post('export-lsa')
  async exportLsaWorkbook(
    @Body() payload: ExportTableCtDto,
    @Req()
    request: Request & {
      user: JwtUserPayload;
    },
    @Res() response: Response,
  ) {
    const file = await this.tableCtService.exportLsaWorkbook(payload, request.user.category);

    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );

    response.send(file.buffer);
  }

  @Delete(':id')
  deleteRow(
    @Param('id') id: string,
    @Req()
    request: Request & {
      user: JwtUserPayload;
    },
  ) {
    return this.tableCtService.deleteRow(id, request.user);
  }
}
