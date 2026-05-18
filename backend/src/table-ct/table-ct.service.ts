import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { extname } from 'node:path';
import { join } from 'node:path';
import ExcelJS from 'exceljs';

import { PrismaService } from '../prisma/prisma.service';
import type { JwtUserPayload } from '../auth/auth.types';
import { DeleteLogService } from '../delete-log/delete-log.service';
import { StageCategoryService } from '../stage-category/stage-category.service';
import type { ConfirmTableCtRowsDto } from './dto/confirm-table-ct-rows.dto';
import type { ExportTableCtDto } from './dto/export-table-ct.dto';
import type { UpdateTableCtMetricsDto } from './dto/update-table-ct-metrics.dto';
import type { ReorderTableCtDto } from './dto/reorder-table-ct.dto';
import type { UpdateTableCtDto } from './dto/update-table-ct.dto';

@Injectable()
export class TableCtService implements OnModuleInit {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly deleteLogService: DeleteLogService,
    private readonly stageCategoryService: StageCategoryService,
  ) { }

  async onModuleInit() {
    await this.ensureStageListColumns();
    await this.ensureTable();
    await this.ensureSeedData();
  }

  async listRows(filters: { stage?: string; stageCode?: string; stageItemId?: string }) {
    await this.ensureStageListColumns();
    await this.ensureTable();

    const normalizedStage = filters.stage?.trim().toUpperCase();
    const normalizedStageCode = filters.stageCode?.trim().toUpperCase();
    const normalizedStageItemId = filters.stageItemId?.trim();

    if (normalizedStageItemId || normalizedStageCode) {
      const existingRow = await this.prismaService.tableCT.findFirst({
        where: {
          ...(normalizedStageItemId ? { stageItemId: normalizedStageItemId } : {}),
          ...(!normalizedStageItemId && normalizedStageCode ? { no: normalizedStageCode } : {}),
          ...(normalizedStage ? { stage: normalizedStage } : {}),
        },
      });

      if (!existingRow) {
        const sourceStage = await this.prismaService.stageList.findFirst({
          where: {
            ...(normalizedStageItemId ? { id: normalizedStageItemId } : {}),
            ...(!normalizedStageItemId && normalizedStageCode ? { code: normalizedStageCode } : {}),
            ...(normalizedStage ? { area: normalizedStage } : {}),
          },
        });

        if (sourceStage) {
          const parsedIdentity = parseTableIdentity(sourceStage.name, sourceStage.code);
          const sortOrder =
            (await this.prismaService.tableCT.count({
              where: { stage: sourceStage.area ?? sourceStage.stage },
            })) + 1;

          await this.prismaService.tableCT.create({
            data: {
              stageItemId: sourceStage.id,
              no: parsedIdentity.code,
              partName: parsedIdentity.partName,
              stage: sourceStage.area ?? sourceStage.stage,
              ct1: 0,
              ct2: 0,
              ct3: 0,
              ct4: 0,
              ct5: 0,
              ct6: 0,
              ct7: 0,
              ct8: 0,
              ct9: 0,
              ct10: 0,
              machineType: 'Select..',
              confirmed: false,
              done: false,
              sortOrder,
            },
          });
        }
      }
    }

    const rows = await this.prismaService.tableCT.findMany({
      where: {
        ...(normalizedStage ? { stage: normalizedStage } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { no: 'asc' }],
    });

    return {
      rows: rows.map((row) => ({
        ...this.mapRow(row),
      })),
    };
  }

  async updateRow(id: string, payload: UpdateTableCtDto) {
    await this.ensureTable();

    if (!id?.trim()) {
      throw new BadRequestException('Table row id is required.');
    }

    const existingRow = await this.prismaService.tableCT.findUnique({
      where: { id },
    });

    if (!existingRow) {
      throw new NotFoundException('Table row was not found.');
    }

    const nextMachineType = payload.machineType?.trim();
    const nextConfirmed = payload.confirmed;

    if (typeof nextMachineType === 'undefined' && typeof nextConfirmed === 'undefined') {
      throw new BadRequestException('No update payload was provided.');
    }

    if (
      existingRow.confirmed &&
      typeof nextMachineType !== 'undefined'
    ) {
      throw new BadRequestException('Confirmed table rows are locked and cannot be edited.');
    }

    const updatedRow = await this.prismaService.tableCT.update({
      where: { id },
      data: {
        ...(typeof nextMachineType !== 'undefined'
          ? { machineType: nextMachineType || 'Select..' }
          : {}),
        ...(typeof nextConfirmed === 'boolean' ? { confirmed: nextConfirmed } : {}),
      },
    });

    return {
      row: this.mapRow(updatedRow),
    };
  }

  async confirmRows(payload: ConfirmTableCtRowsDto) {
    await this.ensureTable();

    const ids = payload.ids?.map((id) => id.trim()).filter(Boolean) ?? [];
    const confirmed = payload.confirmed ?? true;

    if (ids.length === 0) {
      throw new BadRequestException('Table row ids are required.');
    }

    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Table row ids must be unique.');
    }

    const existingRows = await this.prismaService.tableCT.findMany({
      where: {
        id: { in: ids },
      },
    });

    if (existingRows.length !== ids.length) {
      throw new NotFoundException('One or more table rows were not found.');
    }

    await this.prismaService.$transaction(
      ids.map((id) =>
        this.prismaService.tableCT.update({
          where: { id },
          data: { confirmed },
        }),
      ),
    );

    const updatedRows = await this.prismaService.tableCT.findMany({
      where: {
        id: { in: ids },
      },
    });

    const rowMap = new Map(updatedRows.map((row) => [row.id, row]));

    return {
      rows: ids
        .map((id) => rowMap.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .map((row) => this.mapRow(row)),
    };
  }

  async updateMetrics(id: string, payload: UpdateTableCtMetricsDto, category?: string) {
    await this.ensureTable();

    if (!id?.trim()) {
      throw new BadRequestException('Table row id is required.');
    }

    if (
      typeof payload.columnIndex !== 'number' ||
      payload.columnIndex < 0 ||
      payload.columnIndex > 9
    ) {
      throw new BadRequestException('Column index is invalid.');
    }

    const existingRow = await this.prismaService.tableCT.findUnique({
      where: { id },
    });

    if (!existingRow) {
      throw new NotFoundException('Table row was not found.');
    }

    if (existingRow.confirmed) {
      throw new BadRequestException('Confirmed table rows are locked and cannot be edited.');
    }

    const nvaColumn = (`ct${payload.columnIndex + 1}`) as keyof typeof existingRow;
    const vaColumn = (`vaCt${payload.columnIndex + 1}`) as keyof typeof existingRow;
    const currentNvaValue =
      typeof existingRow[nvaColumn] === 'number' ? Number(existingRow[nvaColumn]) : 0;
    const currentVaValue =
      typeof existingRow[vaColumn] === 'number' ? Number(existingRow[vaColumn]) : 0;

    const metricUpdate = {
      ...(typeof payload.nvaValue === 'number'
        ? {
          [nvaColumn]: roundToOneDecimal(
            Math.max(0, currentNvaValue + payload.nvaValue),
          ),
        }
        : {}),
      ...(typeof payload.vaValue === 'number'
        ? {
          [vaColumn]: roundToOneDecimal(
            Math.max(0, currentVaValue + payload.vaValue),
          ),
        }
        : {}),
    };

    const updatedRow = await this.prismaService.tableCT.update({
      where: { id },
      data: metricUpdate,
    });

    return {
      row: this.mapRow(updatedRow),
    };
  }

  async reorderRows(payload: ReorderTableCtDto) {
    await this.ensureTable();

    const normalizedStage = await this.stageCategoryService.normalizeAndValidate(
      payload.stage,
      'Stage',
    );
    const orderedIds = payload.orderedIds?.map((id) => id.trim()).filter(Boolean) ?? [];

    if (orderedIds.length === 0) {
      throw new BadRequestException('Ordered ids are required.');
    }

    const existingRows = await this.prismaService.tableCT.findMany({
      where: { stage: normalizedStage },
      orderBy: [{ sortOrder: 'asc' }, { no: 'asc' }],
    });

    if (existingRows.length !== orderedIds.length) {
      throw new BadRequestException('Ordered ids do not match current table rows.');
    }

    const existingIds = new Set(existingRows.map((row) => row.id));
    const hasInvalidId = orderedIds.some((id) => !existingIds.has(id));

    if (hasInvalidId || new Set(orderedIds).size !== orderedIds.length) {
      throw new BadRequestException('Ordered ids are invalid.');
    }

    await this.prismaService.$transaction(
      orderedIds.map((id, index) =>
        this.prismaService.tableCT.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );

    return { success: true };
  }

  async markDone(id: string, category?: string) {
    await this.ensureTable();

    if (!id?.trim()) {
      throw new BadRequestException('Table row id is required.');
    }

    const existingRow = await this.prismaService.tableCT.findUnique({
      where: { id },
    });

    if (!existingRow) {
      throw new NotFoundException('Table row was not found.');
    }

    const normalizedCategory = normalizeCategory(category);
    const data =
      !existingRow.done && normalizedCategory === 'COSTING'
        ? {
          ...buildCostingDoneUpdate(existingRow),
          done: true,
        }
        : {
          done: !existingRow.done,
        };

    const updatedRow = await this.prismaService.tableCT.update({
      where: { id },
      data,
    });

    return {
      row: this.mapRow(updatedRow),
    };
  }

  async deleteRow(id: string, actor?: JwtUserPayload) {
    await this.ensureTable();

    if (!id?.trim()) {
      throw new BadRequestException('Table row id is required.');
    }

    const existingRow = await this.prismaService.tableCT.findUnique({
      where: { id },
    });

    if (!existingRow) {
      throw new NotFoundException('Table row was not found.');
    }

    if (existingRow.confirmed) {
      throw new BadRequestException('Confirmed table rows cannot be deleted.');
    }

    await this.prismaService.$transaction(async (tx) => {
      await tx.historyEntry.deleteMany({
        where: existingRow.stageItemId
          ? { stageItemId: existingRow.stageItemId }
          : { stageCode: existingRow.no.trim().toUpperCase() },
      });

      await tx.controlSession.deleteMany({
        where: existingRow.stageItemId
          ? { stageItemId: existingRow.stageItemId }
          : { stageCode: existingRow.no.trim().toUpperCase() },
      });

      await tx.tableCT.delete({
        where: { id },
      });

      const remainingRows = await tx.tableCT.findMany({
        where: { stage: existingRow.stage },
        orderBy: [{ sortOrder: 'asc' }, { no: 'asc' }],
      });

      await Promise.all(
        remainingRows.map((row, index) =>
          tx.tableCT.update({
            where: { id: row.id },
            data: { sortOrder: index + 1 },
          }),
        ),
      );
    });

    await this.deleteLogService.logDelete({
      actor,
      entityType: 'TableCT',
      entityId: existingRow.id,
      entityLabel: `${existingRow.no} - ${existingRow.partName}`,
      metadata: {
        stageItemId: existingRow.stageItemId ?? null,
        no: existingRow.no,
        partName: existingRow.partName,
        stage: existingRow.stage,
        machineType: existingRow.machineType,
        confirmed: existingRow.confirmed,
        done: existingRow.done,
      },
    });

    return { success: true, id };
  }

  async exportWorkbook(payload: ExportTableCtDto, category?: string) {
    await this.ensureStageListColumns();
    await this.ensureTable();

    const normalizedStage = payload.stage?.trim().toUpperCase();
    const orderedRowIds = payload.rowIds?.map((id) => id.trim()).filter(Boolean) ?? [];
    const selectedStageItemId = payload.stageItemId?.trim() || null;

    if (!normalizedStage) {
      throw new BadRequestException('Stage is required for export.');
    }

    const rows = await this.prismaService.tableCT.findMany({
      where: {
        stage: normalizedStage,
        ...(orderedRowIds.length > 0 ? { id: { in: orderedRowIds } } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { no: 'asc' }],
    });

    if (rows.length === 0) {
      throw new NotFoundException('No table rows were found to export.');
    }

    const rowOrder = new Map(orderedRowIds.map((id, index) => [id, index]));
    const orderedRows =
      orderedRowIds.length > 0
        ? [...rows].sort(
          (a, b) =>
            (rowOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (rowOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        )
        : [...rows].sort((a, b) => {
          const stageDiff =
            getLsaStageSortIndex(a.stage) - getLsaStageSortIndex(b.stage);
          if (stageDiff !== 0) {
            return stageDiff;
          }

          const sortOrderDiff = a.sortOrder - b.sortOrder;
          if (sortOrderDiff !== 0) {
            return sortOrderDiff;
          }

          return a.no.localeCompare(b.no);
        });

    const primaryRow =
      orderedRows.find((row) => row.stageItemId === selectedStageItemId) ?? orderedRows[0];
    const primaryStageItem = primaryRow.stageItemId
      ? await this.prismaService.stageList.findUnique({
        where: { id: primaryRow.stageItemId },
      })
      : null;

    const workbook = new ExcelJS.Workbook();
    const templatePath = join(process.cwd(), 'templates', 'excel-time-study-template.xlsx');
    await workbook.xlsx.readFile(templatePath);

    const worksheet = workbook.getWorksheet('Time Study') ?? workbook.worksheets[0];

    if (!worksheet) {
      throw new NotFoundException('Time Study template sheet is missing.');
    }

    worksheet.getCell('C3').value = primaryStageItem?.season ?? '';
    worksheet.getCell('I3').value = '';
    worksheet.getCell('C4').value = '';
    worksheet.getCell('I4').value = primaryStageItem?.article || '';
    worksheet.getCell('C5').value = '';
    worksheet.getCell('I5').value = '';

    const lowerSectionTemplates = captureLowerTimeStudyTemplates(worksheet);
    const cycleLayout = populateCycleTimeSection(
      worksheet,
      orderedRows.map((row) => this.mapRow(row)),
      category,
    );
    restoreTimeStudyLowerSectionLayout(
      worksheet,
      cycleLayout.insertedRows,
      lowerSectionTemplates,
    );

    // Keep the lower template sections intact. The cycle-time section above grows
    // by inserting rows before them, so the original workbook layout moves down
    // automatically without us re-drawing the observations/photo block.
    void cycleLayout;
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    return {
      buffer,
      fileName: `time-study-${normalizedStage.toLowerCase()}-${timestamp}.xlsx`,
    };
  }

  async exportLsaWorkbook(payload: ExportTableCtDto, category?: string) {
    await this.ensureStageListColumns();
    await this.ensureTable();

    const selectedStageItemId = payload.stageItemId?.trim() || null;

    const filteredIds = payload.filteredStageItemIds?.filter(Boolean) ?? [];

    const rows = await this.prismaService.tableCT.findMany({
      where: filteredIds.length > 0
        ? { stageItemId: { in: filteredIds } }
        : {},
      orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }, { no: 'asc' }],
    });

    if (rows.length === 0) {
      throw new NotFoundException('No table rows were found to export.');
    }

    const orderedRows = [...rows].sort((a, b) => {
      const stageDiff = getLsaStageSortIndex(a.stage) - getLsaStageSortIndex(b.stage);
      if (stageDiff !== 0) {
        return stageDiff;
      }

      const sortOrderDiff = a.sortOrder - b.sortOrder;
      if (sortOrderDiff !== 0) {
        return sortOrderDiff;
      }

      return a.no.localeCompare(b.no);
    });

    const primaryRow =
      orderedRows.find((row) => row.stageItemId === selectedStageItemId) ?? orderedRows[0];
    const primaryStageItem = primaryRow.stageItemId
      ? await this.prismaService.stageList.findUnique({
        where: { id: primaryRow.stageItemId },
      })
      : null;

    const workbook = new ExcelJS.Workbook();
    const templatePath = join(process.cwd(), 'templates', 'excel-lsa-template.xlsx');
    await workbook.xlsx.readFile(templatePath);
    workbook.calcProperties.fullCalcOnLoad = true;

    const worksheet = workbook.getWorksheet('LSA') ?? workbook.worksheets[0];

    if (!worksheet) {
      throw new NotFoundException('LSA template sheet is missing.');
    }

    const machineTypes = await this.prismaService.machineType.findMany({
      where: { isActive: true },
    });
    const lossRateByMachineType = new Map(
      machineTypes.map((item) => [item.label, parseLossRate(item.loss ?? '')]),
    );
    const labelsByMachineType = new Map(
      machineTypes.map((item) => [item.label, { labelCn: item.labelCn, labelVn: item.labelVn }]),
    );

    const mappedRows = orderedRows.map((row) => this.mapRow(row));
    const estimateOutputPairs =
      typeof payload.estimateOutputPairs === 'number' && Number.isFinite(payload.estimateOutputPairs)
        ? payload.estimateOutputPairs
        : 0;
    const workingTimeSeconds =
      typeof payload.workingTimeSeconds === 'number' && Number.isFinite(payload.workingTimeSeconds)
        ? payload.workingTimeSeconds
        : 27000;

    worksheet.getCell('B2').value =
      primaryStageItem?.article || primaryStageItem?.code || primaryRow.no;
    worksheet.getCell('B3').value = primaryStageItem?.cutDie ?? '';
    worksheet.getCell('B4').value = '';
    worksheet.getCell('G3').value = estimateOutputPairs;
    worksheet.getCell('G4').value = '8 hours';
    worksheet.getCell('G5').value = estimateOutputPairs > 0 ? 3600 / estimateOutputPairs : 0;
    clearLsaSections(worksheet);
    const sectionRows = groupLsaRowsBySection(mappedRows);
    populateLsaDetailSection(
      worksheet,
      sectionRows.CUTTING,
      'CUTTING',
      lossRateByMachineType,
      labelsByMachineType,
      workingTimeSeconds,
      estimateOutputPairs,
    );
    populateLsaRemarkSummary(
      worksheet,
      sectionRows.CUTTING,
      'CUTTING',
      labelsByMachineType,
    );
    populateLsaDetailSection(
      worksheet,
      sectionRows.STITCHING,
      'STITCHING',
      lossRateByMachineType,
      labelsByMachineType,
      workingTimeSeconds,
      estimateOutputPairs,
    );
    populateLsaRemarkSummary(
      worksheet,
      sectionRows.STITCHING,
      'STITCHING',
      labelsByMachineType,
    );
    populateLsaDetailSection(
      worksheet,
      sectionRows.ASSEMBLY,
      'ASSEMBLY',
      lossRateByMachineType,
      labelsByMachineType,
      workingTimeSeconds,
      estimateOutputPairs,
    );
    populateLsaRemarkSummary(
      worksheet,
      sectionRows.ASSEMBLY,
      'ASSEMBLY',
      labelsByMachineType,
    );
    finalizeLsaComputedWorkbook(worksheet, workingTimeSeconds, estimateOutputPairs);
    ensureLsaVisibleTextColor(worksheet);
    setLsaSummaryLabelColor(worksheet);
    hideLsaColumnDisplayValues(worksheet);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    return {
      buffer,
      fileName: `lsa-all-${timestamp}.xlsx`,
    };
  }

  private mapRow(row: {
    id: string;
    stageItemId?: string | null;
    stage: string;
    no: string;
    partName: string;
    ct1: number;
    ct2: number;
    ct3: number;
    ct4: number;
    ct5: number;
    ct6: number;
    ct7: number;
    ct8: number;
    ct9: number;
    ct10: number;
    vaCt1: number;
    vaCt2: number;
    vaCt3: number;
    vaCt4: number;
    vaCt5: number;
    vaCt6: number;
    vaCt7: number;
    vaCt8: number;
    vaCt9: number;
    vaCt10: number;
    machineType: string;
    confirmed: boolean;
    done: boolean;
  }) {
    return {
      id: row.id,
      stageItemId: row.stageItemId ?? null,
      stage: row.stage,
      no: row.no,
      partName: row.partName,
      nvaValues: [
        row.ct1,
        row.ct2,
        row.ct3,
        row.ct4,
        row.ct5,
        row.ct6,
        row.ct7,
        row.ct8,
        row.ct9,
        row.ct10,
      ],
      vaValues: [
        row.vaCt1,
        row.vaCt2,
        row.vaCt3,
        row.vaCt4,
        row.vaCt5,
        row.vaCt6,
        row.vaCt7,
        row.vaCt8,
        row.vaCt9,
        row.vaCt10,
      ],
      machineType: row.machineType,
      confirmed: row.confirmed,
      done: row.done,
    };
  }

  private async ensureTable() {
    await this.prismaService.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.TableCT', N'U') IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM sys.columns c
           INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
           WHERE c.object_id = OBJECT_ID(N'dbo.TableCT')
             AND c.name = 'id'
             AND t.name <> 'uniqueidentifier'
         )
      BEGIN
        DROP TABLE [dbo].[TableCT];
      END

      IF OBJECT_ID(N'dbo.TableCT', N'U') IS NULL
      BEGIN
        CREATE TABLE [dbo].[TableCT] (
          [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [TableCT_id_df] DEFAULT NEWID(),
          [stageItemId] UNIQUEIDENTIFIER NULL,
          [no] NVARCHAR(50) NOT NULL,
          [partName] NVARCHAR(255) NOT NULL,
          [stage] NVARCHAR(50) NOT NULL,
          [ct1] FLOAT NOT NULL CONSTRAINT [TableCT_ct1_df] DEFAULT 0,
          [ct2] FLOAT NOT NULL CONSTRAINT [TableCT_ct2_df] DEFAULT 0,
          [ct3] FLOAT NOT NULL CONSTRAINT [TableCT_ct3_df] DEFAULT 0,
          [ct4] FLOAT NOT NULL CONSTRAINT [TableCT_ct4_df] DEFAULT 0,
          [ct5] FLOAT NOT NULL CONSTRAINT [TableCT_ct5_df] DEFAULT 0,
          [ct6] FLOAT NOT NULL CONSTRAINT [TableCT_ct6_df] DEFAULT 0,
          [ct7] FLOAT NOT NULL CONSTRAINT [TableCT_ct7_df] DEFAULT 0,
          [ct8] FLOAT NOT NULL CONSTRAINT [TableCT_ct8_df] DEFAULT 0,
          [ct9] FLOAT NOT NULL CONSTRAINT [TableCT_ct9_df] DEFAULT 0,
          [ct10] FLOAT NOT NULL CONSTRAINT [TableCT_ct10_df] DEFAULT 0,
          [vaCt1] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt1_df] DEFAULT 0,
          [vaCt2] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt2_df] DEFAULT 0,
          [vaCt3] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt3_df] DEFAULT 0,
          [vaCt4] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt4_df] DEFAULT 0,
          [vaCt5] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt5_df] DEFAULT 0,
          [vaCt6] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt6_df] DEFAULT 0,
          [vaCt7] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt7_df] DEFAULT 0,
          [vaCt8] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt8_df] DEFAULT 0,
          [vaCt9] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt9_df] DEFAULT 0,
          [vaCt10] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt10_df] DEFAULT 0,
          [machineType] NVARCHAR(100) NOT NULL CONSTRAINT [TableCT_machineType_df] DEFAULT 'Select..',
          [confirmed] BIT NOT NULL CONSTRAINT [TableCT_confirmed_df] DEFAULT 0,
          [done] BIT NOT NULL CONSTRAINT [TableCT_done_df] DEFAULT 0,
          [sortOrder] INT NOT NULL CONSTRAINT [TableCT_sortOrder_df] DEFAULT 0,
          [createdAt] DATETIME2 NOT NULL CONSTRAINT [TableCT_createdAt_df] DEFAULT SYSUTCDATETIME(),
          [updatedAt] DATETIME2 NOT NULL CONSTRAINT [TableCT_updatedAt_df] DEFAULT SYSUTCDATETIME(),
          CONSTRAINT [TableCT_pkey] PRIMARY KEY ([id])
        );
      END

      IF COL_LENGTH('dbo.TableCT', 'stageItemId') IS NULL
      BEGIN
        ALTER TABLE [dbo].[TableCT]
        ADD [stageItemId] UNIQUEIDENTIFIER NULL;
      END

      IF COL_LENGTH('dbo.TableCT', 'done') IS NULL
      BEGIN
        ALTER TABLE [dbo].[TableCT]
        ADD [done] BIT NOT NULL CONSTRAINT [TableCT_done_df] DEFAULT 0;
      END
    `);

    for (let index = 1; index <= 10; index += 1) {
      await this.prismaService.$executeRawUnsafe(`
        IF COL_LENGTH('dbo.TableCT', 'vaCt${index}') IS NULL
        BEGIN
          ALTER TABLE [dbo].[TableCT]
          ADD [vaCt${index}] FLOAT NOT NULL CONSTRAINT [TableCT_vaCt${index}_df] DEFAULT 0;
        END
      `);
    }

    for (let index = 1; index <= 10; index += 1) {
      await this.ensureFloatColumn(`ct${index}`, `TableCT_ct${index}_df`);
      await this.ensureFloatColumn(`vaCt${index}`, `TableCT_vaCt${index}_df`);
    }

    await this.prismaService.$executeRawUnsafe(`
      UPDATE t
      SET t.stageItemId = s.id
      FROM [dbo].[TableCT] t
      INNER JOIN [dbo].[StageList] s
        ON s.code = t.no AND ISNULL(s.area, s.stage) = t.stage
      WHERE t.stageItemId IS NULL
    `);
  }

  private async ensureStageListColumns() {
    await this.prismaService.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.StageList', N'U') IS NOT NULL
         AND COL_LENGTH('dbo.StageList', 'season') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [season] NVARCHAR(100) NULL;
      END
    `);

    await this.prismaService.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.StageList', N'U') IS NOT NULL
         AND COL_LENGTH('dbo.StageList', 'cutDie') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [cutDie] NVARCHAR(100) NULL;
      END
    `);

    await this.prismaService.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.StageList', N'U') IS NOT NULL
         AND COL_LENGTH('dbo.StageList', 'area') IS NULL
      BEGIN
        ALTER TABLE [dbo].[StageList]
        ADD [area] NVARCHAR(50) NULL;
      END
    `);

    await this.prismaService.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.StageList', N'U') IS NOT NULL
         AND COL_LENGTH('dbo.StageList', 'area') IS NOT NULL
      BEGIN
        UPDATE [dbo].[StageList]
        SET [area] = [stage]
        WHERE [area] IS NULL;
      END
    `);
  }

  private async ensureSeedData() {
    return;
  }

  private async ensureFloatColumn(columnName: string, defaultConstraintName: string) {
    const columnType = await this.prismaService.$queryRawUnsafe<Array<{ typeName: string }>>(`
      SELECT TOP 1 t.name AS typeName
      FROM sys.columns c
      INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
      WHERE c.object_id = OBJECT_ID(N'dbo.TableCT')
        AND c.name = '${columnName}'
    `);

    if (!columnType[0] || columnType[0].typeName === 'float') {
      return;
    }

    const defaultConstraints = await this.prismaService.$queryRawUnsafe<Array<{ constraintName: string }>>(`
      SELECT dc.name AS constraintName
      FROM sys.default_constraints dc
      INNER JOIN sys.columns c
        ON dc.parent_object_id = c.object_id
       AND dc.parent_column_id = c.column_id
      WHERE dc.parent_object_id = OBJECT_ID(N'dbo.TableCT')
        AND c.name = '${columnName}'
    `);

    for (const constraint of defaultConstraints) {
      await this.prismaService.$executeRawUnsafe(`
        ALTER TABLE [dbo].[TableCT]
        DROP CONSTRAINT [${constraint.constraintName}]
      `);
    }

    await this.prismaService.$executeRawUnsafe(`
      ALTER TABLE [dbo].[TableCT]
      ALTER COLUMN [${columnName}] FLOAT NOT NULL
    `);

    await this.prismaService.$executeRawUnsafe(`
      ALTER TABLE [dbo].[TableCT]
      ADD CONSTRAINT [${defaultConstraintName}] DEFAULT 0 FOR [${columnName}]
    `);
  }
}

function populateCycleTimeSection(
  worksheet: ExcelJS.Worksheet,
  rows: ReturnType<TableCtService['mapRow']>[],
  category?: string,
) {
  const templateStart = 13;
  const templateEnd = 15;
  const nextSectionStart = 16;
  const requiredRows = rows.length * 2 + 1;
  const currentRows = templateEnd - templateStart + 1;
  const extraRows = Math.max(0, requiredRows - currentRows);
  const totalTemplate = captureRowTemplate(worksheet, 15);

  if (extraRows > 0) {
    worksheet.insertRows(nextSectionStart, Array.from({ length: extraRows }, () => []), 'i');
  }

  const grandTotalValues = Array.from({ length: 10 }, () => 0);

  for (let blockIndex = 0; blockIndex < rows.length; blockIndex += 1) {
    const sourceRows = [13, 14];
    const targetRows = [
      templateStart + blockIndex * 2,
      templateStart + blockIndex * 2 + 1,
    ];

    targetRows.forEach((targetRow, index) => {
      clearMergedRangesForRow(worksheet, targetRow, 1, 23);
      copyRowStyle(worksheet, sourceRows[index], targetRow);
      ensureCycleTimeMerges(worksheet, targetRow);
    });

    const row = rows[blockIndex];
    row.nvaValues.forEach((value, index) => {
      grandTotalValues[index] += value + (row.vaValues[index] ?? 0);
    });

    fillCycleRow(worksheet, targetRows[0], {
      progress: row.no,
      partName: row.partName,
      type: 'NVA',
      values: row.nvaValues,
      category,
    });
    fillCycleRow(worksheet, targetRows[1], {
      progress: '',
      partName: '',
      type: 'VA',
      values: row.vaValues,
      category,
    });
  }

  const totalRow = templateStart + rows.length * 2;
  clearMergedRangesForRow(worksheet, totalRow, 1, 23);
  applyRowTemplate(worksheet, totalTemplate, totalRow);
  ensureTotalCycleTimeMerges(worksheet, totalRow);
  fillTotalCycleRow(worksheet, totalRow, {
    values: grandTotalValues.map((value) => roundToTwoDecimals(value)),
    category,
  });

  return {
    insertedRows: extraRows,
    totalRow,
  };
}

function populateMachineSection(
  worksheet: ExcelJS.Worksheet,
  rows: ReturnType<TableCtService['mapRow']>[],
  templateStart: number,
  category?: string,
) {
  const nextSectionStart = 26;
  const templateRows = 7;
  const sectionRows = Math.max(rows.length, templateRows);
  const effectiveNextSectionStart = templateStart + templateRows;
  const extraRows = Math.max(0, rows.length - templateRows);

  if (extraRows > 0) {
    worksheet.insertRows(
      effectiveNextSectionStart,
      Array.from({ length: extraRows }, () => []),
      'i',
    );
  }

  for (let index = 0; index < rows.length; index += 1) {
    const targetRow = templateStart + index;

    clearMergedRangesForRow(worksheet, targetRow, 1, 12);
    copyRowStyle(worksheet, templateStart, targetRow);
    ensureMachineLeftSectionMerges(worksheet, targetRow);
  }

  for (let rowNumber = templateStart; rowNumber < templateStart + sectionRows; rowNumber += 1) {
    clearMergedRangesForRow(worksheet, rowNumber, 13, 23);
  }

  mergeIfNeeded(worksheet, `M${templateStart}:W${templateStart}`);
  if (sectionRows > 1) {
    mergeIfNeeded(
      worksheet,
      `M${templateStart + 1}:W${templateStart + sectionRows - 1}`,
    );
  }
}

function fillCycleRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  payload: {
    progress: string;
    partName: string;
    type: string;
    values: number[];
    category?: string;
  },
) {
  worksheet.getCell(`A${rowNumber}`).value = payload.progress;
  worksheet.getCell(`C${rowNumber}`).value = payload.partName;
  worksheet.getCell(`H${rowNumber}`).value = payload.type;

  payload.values.forEach((value, index) => {
    worksheet.getCell(rowNumber, 13 + index).value = roundToTwoDecimals(value);
  });

  worksheet.getCell(`W${rowNumber}`).value = formatAverageNumber(
    payload.values,
    payload.category,
  );
}

function fillTotalCycleRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  payload: {
    values: number[];
    category?: string;
  },
) {
  worksheet.getCell(`A${rowNumber}`).value = 'Total';
  worksheet.getCell(`M${rowNumber}`).value = '';

  payload.values.forEach((value, index) => {
    worksheet.getCell(rowNumber, 13 + index).value = roundToTwoDecimals(value);
  });

  worksheet.getCell(`W${rowNumber}`).value = formatAverageNumber(
    payload.values,
    payload.category,
  );
}

function copyRowStyle(
  worksheet: ExcelJS.Worksheet,
  sourceRowNumber: number,
  targetRowNumber: number,
) {
  if (sourceRowNumber === targetRowNumber) {
    return;
  }

  const sourceRow = worksheet.getRow(sourceRowNumber);
  const targetRow = worksheet.getRow(targetRowNumber);
  targetRow.height = sourceRow.height;

  sourceRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const targetCell = targetRow.getCell(colNumber);
    targetCell.style = JSON.parse(JSON.stringify(cell.style));
    if (!targetCell.value) {
      targetCell.value = '';
    }
  });
}

function captureRowTemplate(worksheet: ExcelJS.Worksheet, rowNumber: number) {
  const row = worksheet.getRow(rowNumber);
  const cells: Array<{ colNumber: number; style: ExcelJS.Style; value: ExcelJS.CellValue }> = [];

  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const mergedCell = cell as ExcelJS.Cell & {
      isMerged?: boolean;
      master?: ExcelJS.Cell;
    };
    const isMergeFollower =
      Boolean(mergedCell.isMerged) &&
      mergedCell.master != null &&
      mergedCell.master.address !== cell.address;

    cells.push({
      colNumber,
      style: JSON.parse(JSON.stringify(cell.style)),
      value: isMergeFollower ? '' : (cell.value ?? ''),
    });
  });

  return {
    height: row.height,
    cells,
  };
}

function applyRowTemplate(
  worksheet: ExcelJS.Worksheet,
  template: ReturnType<typeof captureRowTemplate>,
  targetRowNumber: number,
) {
  const targetRow = worksheet.getRow(targetRowNumber);
  targetRow.height = template.height;

  template.cells.forEach((cellTemplate) => {
    const targetCell = targetRow.getCell(cellTemplate.colNumber);
    targetCell.style = JSON.parse(JSON.stringify(cellTemplate.style));
    targetCell.value = cellTemplate.value;
  });
}

function ensureCycleTimeMerges(worksheet: ExcelJS.Worksheet, rowNumber: number) {
  clearMergedRangesForRow(worksheet, rowNumber, 1, 12);
  mergeIfNeeded(worksheet, `A${rowNumber}:B${rowNumber}`);
  mergeIfNeeded(worksheet, `C${rowNumber}:G${rowNumber}`);
  mergeIfNeeded(worksheet, `H${rowNumber}:L${rowNumber}`);
}

function ensureTotalCycleTimeMerges(worksheet: ExcelJS.Worksheet, rowNumber: number) {
  clearMergedRangesForRow(worksheet, rowNumber, 1, 12);
  mergeIfNeeded(worksheet, `A${rowNumber}:L${rowNumber}`);
}

function restoreTimeStudyLowerSectionLayout(
  worksheet: ExcelJS.Worksheet,
  rowOffset: number,
  templates: ReturnType<typeof captureLowerTimeStudyTemplates>,
) {
  const observationTitleRow = 17 + rowOffset;
  const observationHeaderRow = 18 + rowOffset;
  const observationBodyStartRow = 19 + rowOffset;
  const observationBodyEndRow = 25 + rowOffset;
  const additionalTitleRow = 27 + rowOffset;
  const additionalBodyStartRow = 28 + rowOffset;
  const additionalBodyEndRow = 34 + rowOffset;
  const detailsTitleRow = 36 + rowOffset;
  const detailsBodyStartRow = 37 + rowOffset;
  const detailsBodyEndRow = 82 + rowOffset;

  for (let row = observationTitleRow; row <= detailsBodyEndRow; row += 1) {
    clearMergedRangesForRow(worksheet, row, 1, 23);
  }

  applyRowTemplate(worksheet, templates.observationTitle, observationTitleRow);
  applyRowTemplate(worksheet, templates.observationHeader, observationHeaderRow);
  for (let row = observationBodyStartRow; row <= observationBodyEndRow; row += 1) {
    applyRowTemplate(worksheet, templates.observationBody, row);
  }
  applyRowTemplate(worksheet, templates.additionalTitle, additionalTitleRow);
  for (let row = additionalBodyStartRow; row <= additionalBodyEndRow; row += 1) {
    applyRowTemplate(worksheet, templates.additionalBody, row);
  }
  applyRowTemplate(worksheet, templates.detailsTitle, detailsTitleRow);
  for (let row = detailsBodyStartRow; row <= detailsBodyEndRow; row += 1) {
    applyRowTemplate(worksheet, templates.detailsBody, row);
  }

  mergeIfNeeded(worksheet, `A${observationTitleRow}:W${observationTitleRow}`);
  mergeIfNeeded(worksheet, `A${observationHeaderRow}:C${observationHeaderRow}`);
  mergeIfNeeded(worksheet, `D${observationHeaderRow}:H${observationHeaderRow}`);
  mergeIfNeeded(worksheet, `I${observationHeaderRow}:J${observationHeaderRow}`);
  mergeIfNeeded(worksheet, `K${observationHeaderRow}:L${observationHeaderRow}`);
  mergeIfNeeded(worksheet, `M${observationHeaderRow}:W${observationHeaderRow}`);

  for (let row = observationBodyStartRow; row <= observationBodyEndRow; row += 1) {
    mergeIfNeeded(worksheet, `A${row}:C${row}`);
    mergeIfNeeded(worksheet, `D${row}:H${row}`);
    mergeIfNeeded(worksheet, `I${row}:J${row}`);
    mergeIfNeeded(worksheet, `K${row}:L${row}`);
  }
  mergeIfNeeded(worksheet, `M${observationBodyStartRow}:W${observationBodyEndRow}`);

  mergeIfNeeded(worksheet, `A${additionalTitleRow}:W${additionalTitleRow}`);
  mergeIfNeeded(worksheet, `A${additionalBodyStartRow}:W${additionalBodyEndRow}`);

  mergeIfNeeded(worksheet, `A${detailsTitleRow}:W${detailsTitleRow}`);
  mergeIfNeeded(worksheet, `A${detailsBodyStartRow}:W${detailsBodyEndRow}`);

  worksheet.getCell(`A${observationTitleRow}`).value =
    'OTHER OBSERVATIONS:  if any/ if needed';
  worksheet.getCell(`A${observationHeaderRow}`).value = 'Type of Machine';
  worksheet.getCell(`D${observationHeaderRow}`).value = 'Process';
  worksheet.getCell(`I${observationHeaderRow}`).value = 'No. of Machines';
  worksheet.getCell(`K${observationHeaderRow}`).value = 'CT (in sec)';
  worksheet.getCell(`M${observationHeaderRow}`).value =
    'Photo of Finished Components';
  worksheet.getCell(`A${additionalTitleRow}`).value =
    'ADDITIONAL NOTES/ RECOMMENDATION:';
  worksheet.getCell(`A${detailsTitleRow}`).value =
    'DETAILED PROCESS ILLUSTRATIONS:';

  applyRangeBorder(worksheet, `A${observationTitleRow}:W${observationTitleRow}`, {
    top: 'medium',
    left: 'medium',
    right: 'medium',
    bottom: 'medium',
  });
  applyRangeBorder(worksheet, `A${observationHeaderRow}:W${observationHeaderRow}`, {
    top: 'thin',
    left: 'medium',
    right: 'medium',
    bottom: 'thin',
  });
  applyRangeBorder(worksheet, `A${observationBodyStartRow}:L${observationBodyEndRow}`, {
    top: 'thin',
    left: 'medium',
    right: 'medium',
    bottom: 'medium',
    insideHorizontal: 'thin',
    insideVertical: 'thin',
  });
  applyRangeBorder(worksheet, `M${observationBodyStartRow}:W${observationBodyEndRow}`, {
    top: 'thin',
    left: 'medium',
    right: 'medium',
    bottom: 'medium',
  });
  applyRangeBorder(worksheet, `A${additionalTitleRow}:W${additionalTitleRow}`, {
    top: 'medium',
    left: 'medium',
    right: 'medium',
    bottom: 'thin',
  });
  applyRangeBorder(worksheet, `A${additionalBodyStartRow}:W${additionalBodyEndRow}`, {
    top: 'thin',
    left: 'medium',
    right: 'medium',
    bottom: 'medium',
  });
  applyRangeBorder(worksheet, `A${detailsTitleRow}:W${detailsTitleRow}`, {
    top: 'medium',
    left: 'medium',
    right: 'medium',
    bottom: 'thin',
  });
  applyRangeBorder(worksheet, `A${detailsBodyStartRow}:W${detailsBodyEndRow}`, {
    top: 'thin',
    left: 'medium',
    right: 'medium',
    bottom: 'medium',
  });
  clearMergedRowInnerBorders(worksheet, `A${observationTitleRow}:W${observationTitleRow}`);
  clearMergedRowInnerBorders(worksheet, `A${additionalTitleRow}:W${additionalTitleRow}`);
  clearMergedRowInnerBorders(worksheet, `A${detailsTitleRow}:W${detailsTitleRow}`);
}

function captureLowerTimeStudyTemplates(worksheet: ExcelJS.Worksheet) {
  return {
    observationTitle: captureRowTemplate(worksheet, 17),
    observationHeader: captureRowTemplate(worksheet, 18),
    observationBody: captureRowTemplate(worksheet, 19),
    additionalTitle: captureRowTemplate(worksheet, 27),
    additionalBody: captureRowTemplate(worksheet, 28),
    detailsTitle: captureRowTemplate(worksheet, 36),
    detailsBody: captureRowTemplate(worksheet, 37),
  };
}

function applyRangeBorder(
  worksheet: ExcelJS.Worksheet,
  range: string,
  edges: {
    top?: ExcelJS.BorderStyle;
    left?: ExcelJS.BorderStyle;
    right?: ExcelJS.BorderStyle;
    bottom?: ExcelJS.BorderStyle;
    insideHorizontal?: ExcelJS.BorderStyle;
    insideVertical?: ExcelJS.BorderStyle;
  },
) {
  const [startRef, endRef] = range.split(':');
  const startCell = worksheet.getCell(startRef);
  const endCell = worksheet.getCell(endRef);
  const startRow = startCell.row;
  const endRow = endCell.row;
  const startCol = startCell.col;
  const endCol = endCell.col;

  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const cell = worksheet.getCell(row, col);
      const border = JSON.parse(JSON.stringify(cell.border ?? {}));

      if (row === startRow && edges.top) {
        border.top = { style: edges.top, color: { argb: 'FF000000' } };
      }
      if (row === endRow && edges.bottom) {
        border.bottom = { style: edges.bottom, color: { argb: 'FF000000' } };
      }
      if (col === startCol && edges.left) {
        border.left = { style: edges.left, color: { argb: 'FF000000' } };
      }
      if (col === endCol && edges.right) {
        border.right = { style: edges.right, color: { argb: 'FF000000' } };
      }
      if (row < endRow && edges.insideHorizontal) {
        border.bottom = { style: edges.insideHorizontal, color: { argb: 'FF000000' } };
      }
      if (col < endCol && edges.insideVertical) {
        border.right = { style: edges.insideVertical, color: { argb: 'FF000000' } };
      }

      cell.border = border;
    }
  }
}

function clearMergedRowInnerBorders(worksheet: ExcelJS.Worksheet, range: string) {
  const [startRef, endRef] = range.split(':');
  const startCell = worksheet.getCell(startRef);
  const endCell = worksheet.getCell(endRef);
  const row = startCell.row;
  const startCol = startCell.col;
  const endCol = endCell.col;

  for (let col = startCol; col <= endCol; col += 1) {
    const cell = worksheet.getCell(row, col);
    const border = JSON.parse(JSON.stringify(cell.border ?? {}));

    if (col > startCol) {
      delete border.left;
    }
    if (col < endCol) {
      delete border.right;
    }

    if (col === startCol) {
      border.left = { style: 'medium', color: { argb: 'FF000000' } };
    }
    if (col === endCol) {
      border.right = { style: 'medium', color: { argb: 'FF000000' } };
    }

    border.top = { style: 'medium', color: { argb: 'FF000000' } };
    border.bottom = { style: 'medium', color: { argb: 'FF000000' } };
    cell.border = border;
  }
}

function ensureMachineLeftSectionMerges(worksheet: ExcelJS.Worksheet, rowNumber: number) {
  mergeIfNeeded(worksheet, `A${rowNumber}:C${rowNumber}`);
  mergeIfNeeded(worksheet, `D${rowNumber}:H${rowNumber}`);
  mergeIfNeeded(worksheet, `I${rowNumber}:J${rowNumber}`);
  mergeIfNeeded(worksheet, `K${rowNumber}:L${rowNumber}`);
}

function mergeIfNeeded(worksheet: ExcelJS.Worksheet, range: string) {
  try {
    worksheet.mergeCells(range);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Cannot merge already merged cells')
    ) {
      return;
    }

    throw error;
  }
}

function clearMergedRangesForRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  startColumn: number,
  endColumn: number,
) {
  const merges = (worksheet as ExcelJS.Worksheet & {
    _merges?: Record<string, { top: number; left: number; bottom: number; right: number }>;
  })._merges;

  if (!merges) {
    return;
  }

  Object.entries(merges).forEach(([range, bounds]) => {
    const touchesRow = bounds.top <= rowNumber && bounds.bottom >= rowNumber;
    const touchesColumns = bounds.left <= endColumn && bounds.right >= startColumn;

    if (touchesRow && touchesColumns) {
      try {
        worksheet.unMergeCells(range);
      } catch {
        // Ignore stale merge metadata and continue rebuilding the row shape.
      }
    }
  });
}

function formatAverageNumber(values: number[], category?: string) {
  const normalizedCategory = category?.trim().toUpperCase() ?? '';
  if (normalizedCategory === 'COSTING') {
    if (values.length === 0) {
      return 0;
    }

    return roundToTwoDecimals(sumValues(values) / 10);
  }

  const shouldUsePositiveOnly =
    normalizedCategory === 'FF28' || normalizedCategory === 'LSA';
  const valuesForAverage = shouldUsePositiveOnly
    ? values.filter((value) => value > 0)
    : values;

  if (valuesForAverage.length === 0) {
    return 0;
  }

  return roundToTwoDecimals(
    valuesForAverage.reduce((sum, value) => sum + value, 0) /
    valuesForAverage.length,
  );
}

function populateLsaDetailSection(
  worksheet: ExcelJS.Worksheet,
  rows: ReturnType<TableCtService['mapRow']>[],
  stage: string,
  lossRateByMachineType: Map<string, number>,
  labelsByMachineType: Map<string, { labelCn: string | null; labelVn: string | null }>,
  workingTimeSeconds: number,
  estimateOutputPairs: number,
) {
  const section = LSA_TEMPLATE_SECTION_BY_STAGE[stage];
  if (!section) {
    throw new BadRequestException(`Unsupported LSA stage "${stage}".`);
  }

  const capacity = section.endRow - section.startRow + 1;
  if (rows.length > capacity) {
    throw new BadRequestException(
      `The ${stage} LSA template supports up to ${capacity} rows, but ${rows.length} rows were selected.`,
    );
  }

  const g5Value = estimateOutputPairs > 0 ? 3600 / estimateOutputPairs : 0;
  const sectionTotals = {
    c: 0,
    f: 0,
    h: 0,
    g: 0,
    i: 0,
    j: 0,
    l: 0,
  };

  for (let index = 0; index < capacity; index += 1) {
    const rowNumber = section.startRow + index;
    const row = rows[index] ?? createBlankLsaRow();
    const metrics = fillLsaInputRow(
      worksheet,
      rowNumber,
      row,
      lossRateByMachineType,
      labelsByMachineType,
      g5Value,
    );

    sectionTotals.c += metrics.c;
    sectionTotals.f += metrics.f;
    sectionTotals.h += metrics.h;
    sectionTotals.g += metrics.g;
    sectionTotals.i += metrics.i;
    sectionTotals.j += metrics.j;
    sectionTotals.l += metrics.l;
  }

  writeLsaSectionTotalRow(worksheet, stage, sectionTotals, workingTimeSeconds);
}

const LSA_TEMPLATE_SECTIONS = [
  { startRow: 9, endRow: 34 },
  { startRow: 38, endRow: 85 },
  { startRow: 89, endRow: 122 },
];

const LSA_TEMPLATE_SECTION_BY_STAGE: Record<string, { startRow: number; endRow: number }> = {
  CUTTING: LSA_TEMPLATE_SECTIONS[0],
  STITCHING: LSA_TEMPLATE_SECTIONS[1],
  ASSEMBLY: LSA_TEMPLATE_SECTIONS[2],
  STOCK: LSA_TEMPLATE_SECTIONS[2],
};

function applyLsaWorkingTimeFormulas(
  worksheet: ExcelJS.Worksheet,
  workingTimeSeconds: number,
  workingHours: number,
) {
  worksheet.getCell('B5').value = {
    formula: '+F126/7.5',
  };
  worksheet.getCell('Q2').value = { formula: '27000/P2' };
  worksheet.getCell('Q3').value = { formula: '27000/P3' };
  worksheet.getCell('Q4').value = { formula: '27000/P4' };
  worksheet.getCell('Q5').value = { formula: '27000/P5' };
  worksheet.getCell('Q6').value = { formula: '27000/P6' };
  worksheet.getCell('F36').value = { formula: '27000/F35' };
  worksheet.getCell('F87').value = { formula: '27000/F86' };
  worksheet.getCell('F124').value = { formula: '27000/F123' };
  worksheet.getCell('F126').value = { formula: '27000/F125' };
}

function clearLsaInputRow(worksheet: ExcelJS.Worksheet, rowNumber: number) {
  worksheet.getCell(`A${rowNumber}`).value = '';
  worksheet.getCell(`B${rowNumber}`).value = '';
  worksheet.getCell(`C${rowNumber}`).value = 0;
  worksheet.getCell(`D${rowNumber}`).value = 0;
  worksheet.getCell(`E${rowNumber}`).value = 0;
  worksheet.getCell(`J${rowNumber}`).value = '';
  worksheet.getCell(`M${rowNumber}`).value = '';
  ensureLsaInputRowBorders(worksheet, rowNumber);
}

function clearLsaSections(worksheet: ExcelJS.Worksheet) {
  for (const templateSection of LSA_TEMPLATE_SECTIONS) {
    for (
      let rowNumber = templateSection.startRow;
      rowNumber <= templateSection.endRow;
      rowNumber += 1
    ) {
      clearLsaInputRow(worksheet, rowNumber);
    }
  }
}

type LsaRowMetrics = {
  c: number;
  d: number;
  e: number;
  f: number;
  g: number;
  h: number;
  i: number;
  j: number;
  k: number;
  l: number;
};

function fillLsaInputRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  row: ReturnType<TableCtService['mapRow']>,
  lossRateByMachineType: Map<string, number>,
  labelsByMachineType: Map<string, { labelCn: string | null; labelVn: string | null }>,
  g5Value: number,
) {
  const lossRate = lossRateByMachineType.get(row.machineType) ?? 0;
  const machineLabel = getLsaMachineLabel(row.machineType, labelsByMachineType);
  const cValue = sumValues(row.vaValues);
  const dValue = sumValues(row.nvaValues);
  const eValue = lossRate;
  const fValue = (cValue + dValue) * (1 + eValue);
  const gValue = g5Value > 0 ? fValue / g5Value : 0;
  const hValue = gValue;
  const lValue = roundLsaOutputValue(hValue);
  const iValue = lValue > 0 ? fValue / lValue : 0;
  const kValue = fValue > 0 ? 3600 / fValue : 0;

  worksheet.getCell(`A${rowNumber}`).value = row.no;
  worksheet.getCell(`B${rowNumber}`).value = row.partName;
  worksheet.getCell(`C${rowNumber}`).value = cValue;
  worksheet.getCell(`D${rowNumber}`).value = dValue;
  worksheet.getCell(`E${rowNumber}`).value = eValue;
  worksheet.getCell(`F${rowNumber}`).value = fValue;
  worksheet.getCell(`G${rowNumber}`).value = gValue;
  worksheet.getCell(`H${rowNumber}`).value = hValue;
  worksheet.getCell(`I${rowNumber}`).value = iValue;
  worksheet.getCell(`J${rowNumber}`).value = '';
  worksheet.getCell(`K${rowNumber}`).value = kValue;
  worksheet.getCell(`L${rowNumber}`).value = lValue;
  worksheet.getCell(`M${rowNumber}`).value = machineLabel;
  worksheet.getCell(`N${rowNumber}`).value = g5Value;

  ensureLsaInputRowBorders(worksheet, rowNumber);

  return {
    c: cValue,
    d: dValue,
    e: eValue,
    f: fValue,
    g: gValue,
    h: hValue,
    i: iValue,
    j: 0,
    k: kValue,
    l: lValue,
  };
}

function getLsaMachineLabel(
  machineType: string,
  labelsByMachineType: Map<string, { labelCn: string | null; labelVn: string | null }>,
) {
  if (machineType === 'Select..') {
    return '';
  }

  const labels = labelsByMachineType.get(machineType);
  return [labels?.labelVn, labels?.labelCn].filter(Boolean).join('-') || machineType;
}

function roundLsaOutputValue(value: number) {
  const truncated = Math.trunc(value);
  if (Math.abs(value - truncated) >= 0.25) {
    return Math.ceil(value);
  }

  return Math.round(value);
}

function finalizeLsaComputedWorkbook(
  worksheet: ExcelJS.Worksheet,
  workingTimeSeconds: number,
  estimateOutputPairs: number,
) {
  const cuttingF = readNumericCell(worksheet, 'F35');
  const stitchingF = readNumericCell(worksheet, 'F86');
  const assemblyF = readNumericCell(worksheet, 'F123');
  const overallF = cuttingF + stitchingF + assemblyF;

  worksheet.getCell('C125').value =
    readNumericCell(worksheet, 'C35') +
    readNumericCell(worksheet, 'C86') +
    readNumericCell(worksheet, 'C123');
  worksheet.getCell('F125').value = overallF;
  worksheet.getCell('I125').value =
    readNumericCell(worksheet, 'I35') +
    readNumericCell(worksheet, 'I86') +
    readNumericCell(worksheet, 'I123');
  worksheet.getCell('J125').value = readNumericCell(worksheet, 'J123') + readNumericCell(worksheet, 'J86');
  worksheet.getCell('L125').value =
    readNumericCell(worksheet, 'L35') +
    readNumericCell(worksheet, 'L86') +
    readNumericCell(worksheet, 'L123');

  worksheet.getCell('P2').value = cuttingF;
  worksheet.getCell('P3').value = stitchingF;
  worksheet.getCell('P4').value = cuttingF + stitchingF;
  worksheet.getCell('P5').value = assemblyF;
  worksheet.getCell('P6').value = cuttingF + stitchingF + assemblyF;

  worksheet.getCell('Q2').value = cuttingF > 0 ? workingTimeSeconds / cuttingF : 0;
  worksheet.getCell('Q3').value = stitchingF > 0 ? workingTimeSeconds / stitchingF : 0;
  worksheet.getCell('Q4').value = cuttingF + stitchingF > 0 ? workingTimeSeconds / (cuttingF + stitchingF) : 0;
  worksheet.getCell('Q5').value = assemblyF > 0 ? workingTimeSeconds / assemblyF : 0;
  worksheet.getCell('Q6').value =
    cuttingF + stitchingF + assemblyF > 0
      ? workingTimeSeconds / (cuttingF + stitchingF + assemblyF)
      : 0;

  worksheet.getCell('F36').value = cuttingF > 0 ? workingTimeSeconds / cuttingF : 0;
  worksheet.getCell('F87').value = stitchingF > 0 ? workingTimeSeconds / stitchingF : 0;
  worksheet.getCell('F124').value = assemblyF > 0 ? workingTimeSeconds / assemblyF : 0;
  worksheet.getCell('F126').value = overallF > 0 ? workingTimeSeconds / overallF : 0;

  worksheet.getCell('B5').value = readNumericCell(worksheet, 'F126') / 7.5;
  worksheet.getCell('G5').value = estimateOutputPairs > 0 ? 3600 / estimateOutputPairs : 0;
}

function readNumericCell(worksheet: ExcelJS.Worksheet, address: string) {
  const value = worksheet.getCell(address).value;
  return typeof value === 'number' ? value : Number(value) || 0;
}

function setLsaSummaryLabelColor(worksheet: ExcelJS.Worksheet) {
  for (const rowNumber of [35, 86, 123, 125]) {
    for (let colNumber = 2; colNumber <= 17; colNumber += 1) {
      const cell = worksheet.getCell(rowNumber, colNumber);
      if (cell.value == null || cell.value === '') {
        continue;
      }

      cell.font = {
        ...cell.font,
        color: { argb: 'FFFF0000' },
      };
    }
  }
}

function hideLsaColumnDisplayValues(worksheet: ExcelJS.Worksheet) {
  for (const section of LSA_TEMPLATE_SECTIONS) {
    for (let rowNumber = section.startRow; rowNumber <= section.endRow; rowNumber += 1) {
      worksheet.getCell(`N${rowNumber}`).numFmt = ';;;';
    }
  }
}

function ensureLsaVisibleTextColor(worksheet: ExcelJS.Worksheet) {
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    for (let colNumber = 1; colNumber <= worksheet.columnCount; colNumber += 1) {
      const cell = worksheet.getCell(rowNumber, colNumber);
      if (cell.value == null || cell.value === '') {
        continue;
      }

      if (
        typeof cell.value === 'object' &&
        cell.value != null &&
        'richText' in cell.value &&
        Array.isArray(cell.value.richText)
      ) {
        cell.value = {
          richText: cell.value.richText.map((part) => ({
            ...part,
            font: {
              ...part.font,
              color: { argb: 'FF000000' },
            },
          })),
        };
      }

      cell.font = {
        ...cell.font,
        color: { argb: 'FF000000' },
      };
    }
  }
}

function buildExcelSumFormula(values: number[]) {
  const parts = values.map((value) => roundToTwoDecimals(Math.max(0, value)));
  if (parts.length === 0) {
    return '0';
  }

  return `SUM(${parts.join(',')})`;
}

function parseLossRate(value?: string) {
  if (!value) {
    return 0;
  }

  const normalized = value.trim().replace('%', '');
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return parsed > 1 ? parsed / 100 : parsed;
}

function ensureLsaInputRowBorders(worksheet: ExcelJS.Worksheet, rowNumber: number) {
  for (let colNumber = 1; colNumber <= 13; colNumber += 1) {
    worksheet.getCell(rowNumber, colNumber).border = {
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
    };
  }
}

function sumValues(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

function populateLsaRemarkSummary(
  worksheet: ExcelJS.Worksheet,
  rows: ReturnType<TableCtService['mapRow']>[],
  stage: string,
  labelsByMachineType: Map<string, { labelCn: string | null; labelVn: string | null }>,
) {
  const section = LSA_REMARK_SECTION_BY_STAGE[stage];
  if (!section) {
    return;
  }

  const counts = new Map<string, number>();
  const orderedLabels: string[] = [];

  for (const row of rows) {
    const label = getLsaMachineLabel(row.machineType, labelsByMachineType);
    if (!label) {
      continue;
    }

    if (!counts.has(label)) {
      orderedLabels.push(label);
    }

    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  for (let index = 0; index < section.labelCount; index += 1) {
    const rowNumber = section.labelStart + index;
    worksheet.getCell(`O${rowNumber}`).value = '';
    worksheet.getCell(`Q${rowNumber}`).value = 0;
  }

  orderedLabels.slice(0, section.labelCount).forEach((label, index) => {
    const rowNumber = section.labelStart + index;
    worksheet.getCell(`O${rowNumber}`).value = label;
    worksheet.getCell(`Q${rowNumber}`).value = counts.get(label) ?? 0;
  });

  worksheet.getCell(`O${section.totalRow}`).value = 'TOTAL';
  worksheet.getCell(`Q${section.totalRow}`).value = orderedLabels.reduce(
    (sum, label) => sum + (counts.get(label) ?? 0),
    0,
  );
}

function createBlankLsaRow(): ReturnType<TableCtService['mapRow']> {
  return {
    id: '',
    stageItemId: null,
    stage: '',
    no: '',
    partName: '',
    nvaValues: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    vaValues: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    machineType: 'Select..',
    confirmed: false,
    done: false,
  };
}

function writeLsaSectionTotalRow(
  worksheet: ExcelJS.Worksheet,
  stage: string,
  totals: {
    c: number;
    f: number;
    h: number;
    g: number;
    i: number;
    j: number;
    l: number;
  },
  workingTimeSeconds: number,
) {
  const section = LSA_TEMPLATE_SECTION_BY_STAGE[stage];
  if (!section) {
    throw new BadRequestException(`Unsupported LSA stage "${stage}".`);
  }

  const totalRow = section.endRow + 1;
  const totalI = stage === 'ASSEMBLY' ? totals.g : totals.h;
  const ratioRow = totalRow + 1;

  worksheet.getCell(`C${totalRow}`).value = totals.c;
  worksheet.getCell(`F${totalRow}`).value = totals.f;
  worksheet.getCell(`I${totalRow}`).value = totalI;
  if (stage !== 'CUTTING') {
    worksheet.getCell(`J${totalRow}`).value = totals.j;
  }
  worksheet.getCell(`L${totalRow}`).value = totals.l;
  worksheet.getCell(`F${ratioRow}`).value = totals.f > 0 ? workingTimeSeconds / totals.f : 0;
}

function groupLsaRowsBySection(rows: ReturnType<TableCtService['mapRow']>[]) {
  return {
    CUTTING: rows.filter((row) => row.stage === 'CUTTING'),
    STITCHING: rows.filter((row) => row.stage === 'STITCHING'),
    ASSEMBLY: rows.filter((row) => row.stage === 'ASSEMBLY' || row.stage === 'STOCK'),
  };
}

function getLsaStageSortIndex(stage: string) {
  switch (stage) {
    case 'CUTTING':
      return 0;
    case 'STITCHING':
      return 1;
    case 'ASSEMBLY':
      return 2;
    case 'STOCK':
      return 3;
    default:
      return 99;
  }
}

const LSA_REMARK_SECTION_BY_STAGE: Record<
  string,
  { labelStart: number; labelEnd: number; labelCount: number; totalRow: number }
> = {
  CUTTING: { labelStart: 9, labelEnd: 14, labelCount: 6, totalRow: 15 },
  STITCHING: { labelStart: 38, labelEnd: 56, labelCount: 19, totalRow: 57 },
  ASSEMBLY: { labelStart: 90, labelEnd: 102, labelCount: 13, totalRow: 103 },
  STOCK: { labelStart: 90, labelEnd: 102, labelCount: 13, totalRow: 103 },
};

function normalizeCategory(category?: string) {
  return category?.trim().toUpperCase() ?? '';
}

function buildCostingDoneUpdate(
  existingRow: {
    ct1: number;
    ct2: number;
    ct3: number;
    ct4: number;
    ct5: number;
    ct6: number;
    ct7: number;
    ct8: number;
    ct9: number;
    ct10: number;
    vaCt1: number;
    vaCt2: number;
    vaCt3: number;
    vaCt4: number;
    vaCt5: number;
    vaCt6: number;
    vaCt7: number;
    vaCt8: number;
    vaCt9: number;
    vaCt10: number;
  },
) {
  const nextData: Record<string, number> = {};

  const nextNvaValues = completeCostingValues([
    existingRow.ct1,
    existingRow.ct2,
    existingRow.ct3,
    existingRow.ct4,
    existingRow.ct5,
    existingRow.ct6,
    existingRow.ct7,
    existingRow.ct8,
    existingRow.ct9,
    existingRow.ct10,
  ]);
  const nextVaValues = completeCostingValues([
    existingRow.vaCt1,
    existingRow.vaCt2,
    existingRow.vaCt3,
    existingRow.vaCt4,
    existingRow.vaCt5,
    existingRow.vaCt6,
    existingRow.vaCt7,
    existingRow.vaCt8,
    existingRow.vaCt9,
    existingRow.vaCt10,
  ]);

  nextNvaValues.forEach((value, index) => {
    nextData[`ct${index + 1}`] = value;
  });

  nextVaValues.forEach((value, index) => {
    nextData[`vaCt${index + 1}`] = value;
  });

  return nextData;
}

function completeCostingValues(currentValues: number[]) {
  const nextValues = currentValues.map((value) => roundToOneDecimal(Math.max(0, value)));
  let filledCount = 0;
  for (const value of nextValues) {
    if (value > 0) {
      filledCount += 1;
      continue;
    }
    break;
  }

  if (filledCount === 0 || filledCount >= 10) {
    return nextValues;
  }

  const seedValues = nextValues.slice(0, filledCount);
  const seedAverage = roundToOneDecimal(sumValues(seedValues) / seedValues.length);
  const targetTotal = roundToOneDecimal(seedAverage * 10);

  let generatedValues: number[] | null = null;

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const trial = [...nextValues];

    for (let index = filledCount; index <= 8; index += 1) {
      trial[index] = roundToOneDecimal(
        Math.max(0, seedAverage + randomBetween(-1, 1)),
      );
    }

    const remainingTotal = roundToOneDecimal(
      targetTotal - sumValues(trial.slice(0, 9)),
    );

    if (remainingTotal >= 0) {
      trial[9] = remainingTotal;
      generatedValues = trial;
      break;
    }
  }

  if (!generatedValues) {
    generatedValues = [...nextValues];
    for (let index = filledCount; index <= 9; index += 1) {
      generatedValues[index] = seedAverage;
    }
  }

  return generatedValues.map((value) => roundToOneDecimal(Math.max(0, value)));
}

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function parseTableIdentity(fileName: string, fallbackCode: string) {
  const withoutExtension = stripFileExtension(fileName).trim();
  const matched = withoutExtension.match(/^([^.]+)\.\s*(.+)$/);

  if (!matched) {
    return {
      code: fallbackCode.trim().toUpperCase(),
      partName: withoutExtension,
    };
  }

  return {
    code: matched[1].trim().toUpperCase() || fallbackCode.trim().toUpperCase(),
    partName: matched[2].trim() || withoutExtension,
  };
}

function stripFileExtension(fileName: string) {
  const extension = extname(fileName);
  return extension ? fileName.slice(0, -extension.length) : fileName;
}

function roundToTwoDecimals(value: number) {
  return Number(value.toFixed(2));
}

function roundToOneDecimal(value: number) {
  return Number(value.toFixed(1));
}
