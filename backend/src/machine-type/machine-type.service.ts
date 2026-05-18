import { Injectable, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_MACHINE_TYPES = [
  { department: 'CUTTING', label: 'Cutting', labelCn: '裁斷', labelVn: 'Chặt, da', loss: '7.0%' },
  { department: 'CUTTING', label: 'Cutting canvas&other', labelCn: '裁布料&其他', labelVn: 'Chặt vải và những liệu khác', loss: '7.0%' },
  { department: 'CUTTING', label: 'Buffing', labelCn: '打粗', labelVn: 'Mài đế', loss: '10.0%' },
  { department: 'CUTTING', label: 'Buffing mouse machine', labelCn: '削泡棉機', labelVn: 'Mài mài mouse', loss: '10.0%' },
  { department: 'CUTTING', label: 'Skiving', labelCn: '削皮', labelVn: 'Lạng', loss: '10.0%' },
  { department: 'CUTTING', label: 'Rolling', labelCn: '滚压', labelVn: 'Cà', loss: '10.0%' },
  { department: 'CUTTING', label: 'Printing', labelCn: '印刷', labelVn: 'In lụa', loss: '10.0%' },
  { department: 'CUTTING', label: 'Embossing', labelCn: '高周波', labelVn: 'Ép cao tầng', loss: '10.0%' },
  { department: 'CUTTING', label: 'Sockliner transfer print machine', labelCn: '轉印紙壓機', labelVn: 'Máy ép chuyển in đế trung', loss: '10.0%' },
  { department: 'CUTTING', label: 'Laser Machine', labelCn: '鐳射切割機', labelVn: 'Máy cắt Laser', loss: '15.0%' },
  { department: 'CUTTING', label: 'Auto Machine', labelCn: '自動裁斷機', labelVn: 'Máy chặt tự động', loss: '15.0%' },
  { department: 'STITCHING', label: 'Cementing', labelCn: '手工刷胶', labelVn: 'Quét keo', loss: '7.0%' },
  { department: 'STITCHING', label: 'Attaching reinforcement', labelCn: '贴补强', labelVn: 'Dán tăng cường', loss: '7.0%' },
  { department: 'STITCHING', label: 'Attaching 3 sides tape', labelCn: '贴双面胶', labelVn: 'Dán 3 dây', loss: '7.0%' },
  { department: 'STITCHING', label: 'Marking', labelCn: '画线', labelVn: 'Định vị', loss: '7.0%' },
  { department: 'STITCHING', label: 'Handwork', labelCn: '手工', labelVn: 'Thủ công', loss: '7.0%' },
  { department: 'STITCHING', label: 'Foding machine', labelCn: '锤平机', labelVn: 'Máy đập tẻ', loss: '10.0%' },
  { department: 'STITCHING', label: 'Punching machine', labelCn: '冲孔机', labelVn: 'Máy đục', loss: '10.0%' },
  { department: 'STITCHING', label: 'Eyeleting machine', labelCn: '打眼機', labelVn: 'Máy tán', loss: '10.0%' },
  { department: 'STITCHING', label: 'Edge folding machine', labelCn: '折邊机', labelVn: 'Máy gấp biên', loss: '10.0%' },
  { department: 'STITCHING', label: 'Tongue label pressing machine', labelCn: '壓標機', labelVn: 'Máy ép tem', loss: '10.0%' },
  { department: 'STITCHING', label: 'Hotmelt Spraying macthine', labelCn: '噴膠機', labelVn: 'Máy phun keo', loss: '10.0%' },
  { department: 'STITCHING', label: 'Hotmelt applying macthine', labelCn: '过胶机', labelVn: 'Máy lăn/quay keo nóng chảy', loss: '10.0%' },
  { department: 'STITCHING', label: 'Trimming machine', labelCn: '修邊機', labelVn: 'Máy xén', loss: '10.0%' },
  { department: 'STITCHING', label: 'Hammering machine', labelCn: '捶平機', labelVn: 'Máy đập bằng', loss: '10.0%' },
  { department: 'STITCHING', label: 'Blowing machine', labelCn: '烘線機', labelVn: 'Máy hơ chỉ', loss: '10.0%' },
  { department: 'STITCHING', label: 'Computer Stitching', labelCn: '電腦針車', labelVn: 'Máy may CT', loss: '12.5%' },
  { department: 'STITCHING', label: 'Oversew machine', labelCn: '考克機', labelVn: 'Máy vắt sổ', loss: '12.5%' },
  { department: 'STITCHING', label: 'Flat type machine', labelCn: '單針平車', labelVn: 'Máy bàn 1 kim', loss: '12.5%' },
  { department: 'STITCHING', label: '2 needles Flat type machine', labelCn: '雙針平車', labelVn: 'Máy bàn 2 kim', loss: '12.5%' },
  { department: 'STITCHING', label: 'Heat Pressing seam tape', labelCn: '熱風縫口密封機', labelVn: 'Máy ép nối đường may', loss: '12.5%' },
  { department: 'STITCHING', label: 'Toe gathering machine', labelCn: '縮頭機', labelVn: 'Máy may rút mũi', loss: '12.5%' },
  { department: 'STITCHING', label: 'Post type', labelCn: '高頭單針', labelVn: 'Máy trụ 1 kim', loss: '12.5%' },
  { department: 'STITCHING', label: 'Edge machine', labelCn: '滾邊機', labelVn: 'Máy viền', loss: '15.0%' },
  { department: 'STITCHING', label: 'Knitting machine', labelCn: '馬克機', labelVn: 'Máy may đan', loss: '15.0%' },
  { department: 'STITCHING', label: 'Binding&Zigzag stitching machine', labelCn: '滾邊萬能機', labelVn: 'Máy cuộn biên zz', loss: '15.0%' },
  { department: 'STITCHING', label: 'Zigzag', labelCn: '萬能機', labelVn: 'Máy zz', loss: '15.0%' },
  { department: 'STITCHING', label: '2 needles Post type', labelCn: '高頭雙針', labelVn: 'Máy trụ 2 kim', loss: '15.0%' },
  { department: 'STITCHING', label: '4 needles 6 threads machine', labelCn: '四針六線機', labelVn: 'Máy may 4k6c', loss: '15.0%' },
  { department: 'ASSEMBLY', label: 'Attaching eyestay', labelCn: '擦胶贴眼片', labelVn: 'Dán đệm đế', loss: '7.0%' },
  { department: 'ASSEMBLY', label: 'Rolling upper', labelCn: '鞋面滾輪', labelVn: 'Cà lăn mặt giày', loss: '7.0%' },
  { department: 'ASSEMBLY', label: 'Rolling', labelCn: '滚压', labelVn: 'Cà lăn', loss: '7.0%' },
  { department: 'ASSEMBLY', label: 'Trimming toe cap', labelCn: '修剪前包片', labelVn: 'Xén bao mũi', loss: '7.0%' },
  { department: 'ASSEMBLY', label: 'Handwork', labelCn: '手工', labelVn: 'Thủ công', loss: '7.0%' },
  { department: 'ASSEMBLY', label: 'Packing Handwork', labelCn: '手工包装', labelVn: 'Xếp hộp thủ công', loss: '7.0%' },
  { department: 'ASSEMBLY', label: 'Marking', labelCn: '画线', labelVn: 'Định vị', loss: '7.0%' },
  { department: 'ASSEMBLY', label: 'Cementing', labelCn: '手工刷胶', labelVn: 'Quét keo', loss: '7.0%' },
  { department: 'ASSEMBLY', label: 'Attaching', labelCn: '贴', labelVn: 'Dán', loss: '7.0%' },
  { department: 'ASSEMBLY', label: 'Cleaning', labelCn: '清洁', labelVn: 'Vệ sinh', loss: '7.0%' },
  { department: 'ASSEMBLY', label: 'Pressing for heel', labelCn: '後踵定型机', labelVn: 'Máy định hình gót', loss: '11.0%' },
  { department: 'ASSEMBLY', label: 'Pressing for vamp', labelCn: '鞋头定型机', labelVn: 'Máy định hình mũi', loss: '11.0%' },
  { department: 'ASSEMBLY', label: 'Marking on upper Machine', labelCn: '画线鞋身机', labelVn: 'Máy định vị thân', loss: '11.0%' },
  { department: 'ASSEMBLY', label: 'Hotmelt applying macthine', labelCn: '过胶机', labelVn: 'Máy lăn/Quay keo nóng chảy', loss: '11.0%' },
  { department: 'ASSEMBLY', label: '', labelCn: 'EVA底除皺機', labelVn: 'Máy làm thẳng đế EVA', loss: '11.0%' },
  { department: 'ASSEMBLY', label: 'Lasting machine', labelCn: '入楦机', labelVn: 'Máy nông phom', loss: '11.0%' },
  { department: 'ASSEMBLY', label: 'Pressing machine', labelCn: '压机', labelVn: 'Máy ép đế', loss: '11.0%' },
  { department: 'ASSEMBLY', label: 'Versatile Pressing Machine', labelCn: '牆式壓機', labelVn: 'Máy ép đa năng', loss: '11.0%' },
  { department: 'ASSEMBLY', label: 'Buffing', labelCn: '打粗', labelVn: 'Mài đế', loss: '11.0%' },
  { department: 'ASSEMBLY', label: 'Trim off excessed rubber machine', labelCn: '修邊條機', labelVn: 'Máy xén dây talon', loss: '11.0%' },
  { department: 'ASSEMBLY', label: 'Cross pressing machine', labelCn: '十字压机', labelVn: 'Máy ép chữ thập', loss: '11.0%' },
  { department: 'ASSEMBLY', label: 'Heel lasting machine', labelCn: '后幫機', labelVn: 'Máy gò gót', loss: '11.0%' },
  { department: 'ASSEMBLY', label: 'Upper steaming machine', labelCn: '鞋頭蒸濕機', labelVn: 'Máy hấp hơi nước', loss: '11.0%' },
  { department: 'ASSEMBLY', label: 'Heel counter activated machine', labelCn: '后襯軟化機', labelVn: 'Máy làm mềm pho', loss: '11.0%' },
  { department: 'ASSEMBLY', label: 'Strobelling machine', labelCn: '拉帮机', labelVn: 'Máy may cóp đế', loss: '15.0%' },
  { department: 'ASSEMBLY', label: 'Stitching thread on outsole', labelCn: '车大底机', labelVn: 'Máy may chỉ đế', loss: '15.0%' },
  { department: 'ASSEMBLY', label: 'Toe lasting machine', labelCn: '前幫機', labelVn: 'Máy gò mũi', loss: '15.0%' },
  { department: 'ASSEMBLY', label: 'Side lasting machine', labelCn: '腰幫機', labelVn: 'Máy gò hông', loss: '15.0%' },
] as const;

@Injectable()
export class MachineTypeService implements OnModuleInit {
  constructor(private readonly prismaService: PrismaService) {}

  async onModuleInit() {
    await this.ensureTable();
    await this.ensureSeedData();
  }

  async listMachineTypes(department?: string) {
    await this.ensureTable();

    const normalizedDepartment = department?.trim().toUpperCase();
    const rows = await this.prismaService.machineType.findMany({
      where: {
        isActive: true,
        ...(normalizedDepartment ? { department: normalizedDepartment } : {}),
      },
      orderBy: [{ department: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });

    return {
      machineTypes: rows.map((item) => ({
        id: item.id,
        department: item.department,
        label: item.label,
        labelCn: item.labelCn ?? '',
        labelVn: item.labelVn ?? '',
        loss: item.loss ?? '',
      })),
    };
  }

  private async ensureSeedData() {
    const expectedKeys = new Set(
      DEFAULT_MACHINE_TYPES.map((item) =>
        this.buildSeedKey(item.department, item.label, item.labelCn),
      ),
    );

    const existingRows = await this.prismaService.machineType.findMany();

    for (const [index, item] of DEFAULT_MACHINE_TYPES.entries()) {
      const existing =
        existingRows.find(
          (row) =>
            this.buildSeedKey(row.department, row.label, row.labelCn ?? '') ===
            this.buildSeedKey(item.department, item.label, item.labelCn),
        ) ??
        existingRows.find(
          (row) =>
            row.department === item.department &&
            row.label === item.label &&
            row.labelCn === item.labelCn,
        );

      if (existing) {
        await this.prismaService.machineType.update({
          where: { id: existing.id },
          data: {
            labelCn: item.labelCn || null,
            labelVn: item.labelVn || null,
            loss: item.loss,
            sortOrder: index + 1,
            isActive: true,
          },
        });
        continue;
      }

      await this.prismaService.machineType.create({
        data: {
          department: item.department,
          label: item.label,
          labelCn: item.labelCn || null,
          labelVn: item.labelVn || null,
          loss: item.loss,
          sortOrder: index + 1,
          isActive: true,
        },
      });
    }

    const obsoleteIds = existingRows
      .filter(
        (row) =>
          !expectedKeys.has(
            this.buildSeedKey(row.department, row.label, row.labelCn ?? ''),
          ),
      )
      .map((row) => row.id);

    if (obsoleteIds.length > 0) {
      await this.prismaService.machineType.updateMany({
        where: { id: { in: obsoleteIds } },
        data: { isActive: false },
      });
    }
  }

  private buildSeedKey(department: string, label: string, labelCn: string) {
    return [department.trim().toUpperCase(), label.trim(), labelCn.trim()].join(
      '::',
    );
  }

  private async ensureTable() {
    await this.prismaService.$executeRawUnsafe(`
      IF OBJECT_ID(N'dbo.MachineType', N'U') IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM sys.columns c
           INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
           WHERE c.object_id = OBJECT_ID(N'dbo.MachineType')
             AND c.name = 'id'
             AND t.name <> 'uniqueidentifier'
         )
      BEGIN
        DROP TABLE [dbo].[MachineType];
      END

      IF OBJECT_ID(N'dbo.MachineType', N'U') IS NULL
      BEGIN
        CREATE TABLE [dbo].[MachineType] (
          [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [MachineType_id_df] DEFAULT NEWID(),
          [department] NVARCHAR(50) NOT NULL,
          [label] NVARCHAR(255) NOT NULL,
          [labelCn] NVARCHAR(255) NULL,
          [labelVn] NVARCHAR(255) NULL,
          [loss] NVARCHAR(50) NULL,
          [sortOrder] INT NOT NULL CONSTRAINT [MachineType_sortOrder_df] DEFAULT 0,
          [isActive] BIT NOT NULL CONSTRAINT [MachineType_isActive_df] DEFAULT 1,
          [createdAt] DATETIME2 NOT NULL CONSTRAINT [MachineType_createdAt_df] DEFAULT SYSUTCDATETIME(),
          [updatedAt] DATETIME2 NOT NULL CONSTRAINT [MachineType_updatedAt_df] DEFAULT SYSUTCDATETIME(),
          CONSTRAINT [MachineType_pkey] PRIMARY KEY ([id])
        );
      END

      IF COL_LENGTH('dbo.MachineType', 'labelCn') IS NULL
      BEGIN
        ALTER TABLE [dbo].[MachineType]
        ADD [labelCn] NVARCHAR(255) NULL;
      END

      IF COL_LENGTH('dbo.MachineType', 'labelVn') IS NULL
      BEGIN
        ALTER TABLE [dbo].[MachineType]
        ADD [labelVn] NVARCHAR(255) NULL;
      END
    `);
  }
}
