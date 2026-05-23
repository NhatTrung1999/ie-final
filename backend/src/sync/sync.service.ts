import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { Express } from 'express';
import { Prisma } from '@prisma/client';

import type { JwtUserPayload } from '../auth/auth.types';
import { hashPassword } from '../users/password.util';
import { PrismaService } from '../prisma/prisma.service';
import { ensureStageUploadDir, getStageUploadDir, getStageVideoUrl } from '../stage/stage-upload.util';

type SyncSnapshotRequest = {
  snapshotJson: string;
  videoRefsJson: string;
};

type SyncSnapshot = {
  users?: SyncUser[];
  stageCategories?: SyncStageCategory[];
  machineTypes?: SyncMachineType[];
  stages?: SyncStageItem[];
  tableRows?: SyncTableRow[];
  history?: SyncHistoryEntry[];
  controlSessions?: SyncControlSession[];
  deleteLogs?: SyncDeleteLog[];
};

type SyncUser = {
  id: string;
  username: string;
  displayName: string;
  factory?: string;
  role?: string;
  password?: string;
};

type SyncStageCategory = {
  id: string;
  value: string;
  label: string;
  sortOrder?: number;
};

type SyncMachineType = {
  id: string;
  department: string;
  label: string;
  labelCn?: string;
  labelVn?: string;
  loss?: string;
  sortOrder?: number;
};

type SyncStageItem = {
  id: string;
  code: string;
  name: string;
  processStage?: string;
  season?: string;
  cutDie?: string;
  area?: string;
  article?: string;
  duration: string;
  mood: string;
  stage: string;
  stageDate?: string | null;
  completed?: boolean;
  videoAssetId?: string | null;
  sortOrder?: number;
};

type SyncTableRow = {
  id: string;
  stageItemId?: string | null;
  no: string;
  partName: string;
  stage: string;
  ctValues?: number[];
  vaValues?: number[];
  nvaValues?: number[];
  machineType: string;
  confirmed: boolean;
  done: boolean;
  sortOrder?: number;
};

type SyncHistoryEntry = {
  id: string;
  stageItemId?: string | null;
  stageCode: string;
  startTime: number;
  endTime: number;
  type: 'NVA' | 'VA' | 'SKIP';
  value: number;
  ctColumn?: string | null;
  committed: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type SyncControlSession = {
  id: string;
  stageItemId?: string | null;
  stageCode: string;
  elapsed: number;
  isRunning: boolean;
  segmentStart: number;
  nva?: number | null;
  va?: number | null;
  skip?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

type SyncDeleteLog = {
  id: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  actorUserId?: string | null;
  actorUsername?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
};

type SyncVideoRef = {
  assetId: string;
  stageId?: string;
  originalName?: string;
};

@Injectable()
export class SyncService {
  constructor(private readonly prismaService: PrismaService) {}

  async syncSnapshot(
    payload: SyncSnapshotRequest,
    videos: Express.Multer.File[] = [],
    actor?: JwtUserPayload,
  ) {
    if (!actor?.sub) {
      throw new BadRequestException('Authenticated user is required.');
    }

    const snapshot = parseSnapshot(payload.snapshotJson);
    const videoRefs = parseVideoRefs(payload.videoRefsJson);
    const savedFiles: string[] = [];
    const videoPathByAssetId = new Map<string, string>();
    const stageIdMap = new Map<string, string>();
    const stageById = new Map(
      (snapshot.stages ?? [])
        .filter((stage) => stage.id)
        .map((stage) => [stage.id, stage]),
    );
    const snapshotStageIds = (snapshot.stages ?? [])
      .map((stage) => stage.id)
      .filter((id): id is string => Boolean(id) && isUuid(id));
    const snapshotStageCodes = (snapshot.stages ?? [])
      .map((stage) => stage.code?.trim().toUpperCase())
      .filter((code): code is string => Boolean(code));

    try {
      for (const [index, file] of videos.entries()) {
        const ref = videoRefs[index];

        if (!ref?.assetId || !file) {
          continue;
        }

        const filePath = await saveSyncVideoFile(
          ref.assetId,
          file,
          ref.stageId ? stageById.get(ref.stageId) : undefined,
        );
        savedFiles.push(filePath);
        videoPathByAssetId.set(ref.assetId, filePath);
      }

      await this.prismaService.$transaction(async (tx) => {
        for (const user of snapshot.users ?? []) {
          const username = user.username?.trim().toLowerCase();
          const displayName = user.displayName?.trim();
          const factory = normalizeFactory(user.factory);
          const role = normalizeRole(user.role);
          const password = user.password ?? '';

          if (!username || !displayName || !password) {
            continue;
          }

          await tx.user.upsert({
            where: { username },
            create: {
              id: isUuid(user.id) ? user.id : undefined,
              username,
              displayName,
              factory,
              role,
              passwordHash: hashPassword(password),
            },
            update: {
              displayName,
              factory,
              role,
              passwordHash: hashPassword(password),
            },
          });
        }

        const existingStages = (snapshotStageIds.length > 0 || snapshotStageCodes.length > 0)
          ? await tx.stageList.findMany({
              where: {
                ownerUserId: actor.sub,
                OR: [
                  ...(snapshotStageIds.length > 0
                    ? [{ id: { in: snapshotStageIds } }]
                    : []),
                  ...(snapshotStageCodes.length > 0
                    ? [{ code: { in: snapshotStageCodes } }]
                    : []),
                ],
              },
            })
          : [];

        const existingStagesMapById = new Map<string, any>();
        const existingStagesMapByCode = new Map<string, any>();
        for (const s of existingStages) {
          existingStagesMapById.set(s.id.toLowerCase(), s);
          existingStagesMapByCode.set(s.code.trim().toUpperCase(), s);
        }

        const categoryMap = new Map<string, SyncStageCategory>();
        for (const category of snapshot.stageCategories ?? []) {
          const value = normalizeScope(category.value);
          if (!value) {
            continue;
          }

          categoryMap.set(value, {
            ...category,
            value,
            label: String(category.label ?? '').trim() || value,
          });
        }

        for (const category of categoryMap.values()) {
          await tx.stageCategory.upsert({
            where: { value: category.value },
            create: {
              id: isUuid(category.id) ? category.id : undefined,
              value: category.value,
              label: category.label,
              sortOrder: Number.isFinite(category.sortOrder) ? Number(category.sortOrder) : 0,
              isActive: true,
            },
            update: {
              label: category.label,
              sortOrder: Number.isFinite(category.sortOrder) ? Number(category.sortOrder) : undefined,
              isActive: true,
            },
          });
        }

        const machineTypeMap = new Map<string, SyncMachineType>();
        for (const machineType of snapshot.machineTypes ?? []) {
          const department = normalizeScope(machineType.department);
          const label = String(machineType.label ?? '').trim();
          const labelCn = String(machineType.labelCn ?? '').trim();
          if (!department || !label) {
            continue;
          }

          const key = [department, label.toLowerCase(), labelCn.toLowerCase()].join('::');
          machineTypeMap.set(key, {
            ...machineType,
            department,
            label,
            labelCn,
            labelVn: String(machineType.labelVn ?? '').trim(),
            loss: String(machineType.loss ?? '').trim(),
          });
        }

        for (const machineType of machineTypeMap.values()) {
          const existing = await tx.machineType.findFirst({
            where: {
              department: machineType.department,
              label: machineType.label,
              labelCn: machineType.labelCn || null,
            },
            select: { id: true },
          });

          if (existing) {
            await tx.machineType.update({
              where: { id: existing.id },
              data: {
                labelVn: machineType.labelVn || null,
                loss: machineType.loss || null,
                sortOrder: Number.isFinite(machineType.sortOrder)
                  ? Number(machineType.sortOrder)
                  : undefined,
                isActive: true,
              },
            });
            continue;
          }

          await tx.machineType.create({
            data: {
              id: isUuid(machineType.id) ? machineType.id : undefined,
              department: machineType.department,
              label: machineType.label,
              labelCn: machineType.labelCn || null,
              labelVn: machineType.labelVn || null,
              loss: machineType.loss || null,
              sortOrder: Number.isFinite(machineType.sortOrder) ? Number(machineType.sortOrder) : 0,
              isActive: true,
            },
          });
        }

        for (const stage of snapshot.stages ?? []) {
          if (!stage.id || !stage.code || !stage.name || !stage.stage) {
            continue;
          }

          const filePath =
            stage.videoAssetId && videoPathByAssetId.has(stage.videoAssetId)
              ? videoPathByAssetId.get(stage.videoAssetId) ?? null
              : null;
          const stageDate = parseDate(stage.stageDate);

          let existingStage: any = null;
          if (stage.id && isUuid(stage.id)) {
            existingStage = existingStagesMapById.get(stage.id.toLowerCase());
          }
          if (!existingStage && stage.code) {
            existingStage = existingStagesMapByCode.get(stage.code.trim().toUpperCase());
          }

          if (existingStage) {
            const updateData: any = {
              code: stage.code,
              name: stage.name,
              stage: normalizeScope(stage.stage),
              season: normalizeNullableString(stage.season),
              cutDie: normalizeNullableString(stage.cutDie),
              area: normalizeNullableString(stage.area),
              article: normalizeNullableString(stage.article),
              duration: stage.duration,
              mood: stage.mood,
              stageDate,
              sortOrder: Number.isFinite(stage.sortOrder) ? Number(stage.sortOrder) : undefined,
            };

            if (filePath) {
              updateData.filePath = filePath;
            }

            const updatedStage = await tx.stageList.update({
              where: { id: existingStage.id },
              data: updateData,
            });
            stageIdMap.set(stage.id, updatedStage.id);
          } else {
            const createdStage = await tx.stageList.create({
              data: {
                id: isUuid(stage.id) ? stage.id : undefined,
                ownerUserId: actor.sub,
                code: stage.code,
                name: stage.name,
                stage: normalizeScope(stage.stage),
                season: normalizeNullableString(stage.season),
                cutDie: normalizeNullableString(stage.cutDie),
                area: normalizeNullableString(stage.area),
                article: normalizeNullableString(stage.article),
                duration: stage.duration,
                mood: stage.mood,
                filePath,
                stageDate,
                sortOrder: Number.isFinite(stage.sortOrder) ? Number(stage.sortOrder) : 0,
              },
            });
            stageIdMap.set(stage.id, createdStage.id);
          }
        }

        // Precise TableCT cleanup
        const tableCtStageIdsToDelete = new Set<string>();
        const tableCtStageCodesToDelete = new Set<string>();

        for (const row of snapshot.tableRows ?? []) {
          const stageItemId = row.stageItemId
            ? stageIdMap.get(row.stageItemId) ?? (isUuid(row.stageItemId) ? row.stageItemId : null)
            : null;

          if (stageItemId) {
            tableCtStageIdsToDelete.add(stageItemId.toLowerCase());
          } else if (row.no) {
            tableCtStageCodesToDelete.add(row.no.trim().toUpperCase());
          }
        }

        if (tableCtStageIdsToDelete.size > 0 || tableCtStageCodesToDelete.size > 0) {
          await tx.tableCT.deleteMany({
            where: {
              OR: [
                ...(tableCtStageIdsToDelete.size > 0
                  ? [{ stageItemId: { in: Array.from(tableCtStageIdsToDelete) } }]
                  : []),
                ...(tableCtStageCodesToDelete.size > 0
                  ? [{ no: { in: Array.from(tableCtStageCodesToDelete) } }]
                  : []),
              ],
            },
          });
        }

        // Precise HistoryEntry cleanup
        const historyStageIdsToDelete = new Set<string>();
        const historyStageCodesToDelete = new Set<string>();

        for (const entry of snapshot.history ?? []) {
          const stageItemId = entry.stageItemId
            ? stageIdMap.get(entry.stageItemId) ?? (isUuid(entry.stageItemId) ? entry.stageItemId : null)
            : null;

          if (stageItemId) {
            historyStageIdsToDelete.add(stageItemId.toLowerCase());
          } else if (entry.stageCode) {
            historyStageCodesToDelete.add(entry.stageCode.trim().toUpperCase());
          }
        }

        if (historyStageIdsToDelete.size > 0 || historyStageCodesToDelete.size > 0) {
          await tx.historyEntry.deleteMany({
            where: {
              OR: [
                ...(historyStageIdsToDelete.size > 0
                  ? [{ stageItemId: { in: Array.from(historyStageIdsToDelete) } }]
                  : []),
                ...(historyStageCodesToDelete.size > 0
                  ? [{ stageCode: { in: Array.from(historyStageCodesToDelete) } }]
                  : []),
              ],
            },
          });
        }

        // Precise ControlSession cleanup
        const controlStageIdsToDelete = new Set<string>();
        const controlStageCodesToDelete = new Set<string>();

        for (const session of snapshot.controlSessions ?? []) {
          const stageItemId = session.stageItemId
            ? stageIdMap.get(session.stageItemId) ?? (isUuid(session.stageItemId) ? session.stageItemId : null)
            : null;

          if (stageItemId) {
            controlStageIdsToDelete.add(stageItemId.toLowerCase());
          } else if (session.stageCode) {
            controlStageCodesToDelete.add(session.stageCode.trim().toUpperCase());
          }
        }

        if (controlStageIdsToDelete.size > 0 || controlStageCodesToDelete.size > 0) {
          await tx.controlSession.deleteMany({
            where: {
              OR: [
                ...(controlStageIdsToDelete.size > 0
                  ? [{ stageItemId: { in: Array.from(controlStageIdsToDelete) } }]
                  : []),
                ...(controlStageCodesToDelete.size > 0
                  ? [{ stageCode: { in: Array.from(controlStageCodesToDelete) } }]
                  : []),
              ],
            },
          });
        }

        for (const row of snapshot.tableRows ?? []) {
          if (!row.id || !row.no || !row.partName || !row.stage) {
            continue;
          }

          const values = normalizeTenValues(row.ctValues ?? row.nvaValues ?? []);
          const vaValues = normalizeTenValues(row.vaValues ?? []);
          const stageItemId = row.stageItemId
            ? stageIdMap.get(row.stageItemId) ?? (isUuid(row.stageItemId) ? row.stageItemId : null)
            : null;

          await tx.tableCT.create({
            data: {
              id: isUuid(row.id) ? row.id : undefined,
              stageItemId,
              no: row.no,
              partName: row.partName,
              stage: normalizeScope(row.stage),
              ct1: values[0],
              ct2: values[1],
              ct3: values[2],
              ct4: values[3],
              ct5: values[4],
              ct6: values[5],
              ct7: values[6],
              ct8: values[7],
              ct9: values[8],
              ct10: values[9],
              vaCt1: vaValues[0],
              vaCt2: vaValues[1],
              vaCt3: vaValues[2],
              vaCt4: vaValues[3],
              vaCt5: vaValues[4],
              vaCt6: vaValues[5],
              vaCt7: vaValues[6],
              vaCt8: vaValues[7],
              vaCt9: vaValues[8],
              vaCt10: vaValues[9],
              machineType: row.machineType || 'Select..',
              confirmed: Boolean(row.confirmed),
              done: Boolean(row.done),
              sortOrder: Number.isFinite(row.sortOrder) ? Number(row.sortOrder) : 0,
            },
          });
        }

        for (const entry of snapshot.history ?? []) {
          if (!entry.id || !entry.stageCode) {
            continue;
          }

          await tx.historyEntry.create({
            data: {
              id: isUuid(entry.id) ? entry.id : undefined,
              stageItemId: entry.stageItemId
                ? stageIdMap.get(entry.stageItemId) ??
                  (isUuid(entry.stageItemId) ? entry.stageItemId : null)
                : null,
              stageCode: normalizeScope(entry.stageCode),
              startTime: Number(entry.startTime ?? 0),
              endTime: Number(entry.endTime ?? 0),
              type: entry.type,
              value: Number(entry.value ?? 0),
              ctColumn: normalizeNullableString(entry.ctColumn),
              committed: Boolean(entry.committed),
            },
          });
        }

        const controlSessionMap = new Map<
          string,
          {
            session: SyncControlSession;
            stageItemId: string | null;
            stageCode: string;
          }
        >();

        for (const session of snapshot.controlSessions ?? []) {
          if (!session.id || !session.stageCode) {
            continue;
          }

          const stageItemId = session.stageItemId
            ? stageIdMap.get(session.stageItemId) ??
              (isUuid(session.stageItemId) ? session.stageItemId : null)
            : null;
          const stageCode = normalizeScope(session.stageCode);
          const sessionKey = stageItemId ? `stageItemId:${stageItemId}` : `stageCode:${stageCode}`;
          const current = controlSessionMap.get(sessionKey);

          if (!current || isNewerSyncRecord(session, current.session)) {
            controlSessionMap.set(sessionKey, {
              session,
              stageItemId,
              stageCode,
            });
          }
        }

        for (const { session, stageItemId, stageCode } of controlSessionMap.values()) {
          await tx.controlSession.create({
            data: {
              id: isUuid(session.id) ? session.id : undefined,
              stageItemId,
              stageCode,
              elapsed: Number(session.elapsed ?? 0),
              isRunning: Boolean(session.isRunning),
              segmentStart: Number(session.segmentStart ?? 0),
              nva: normalizeOptionalNumber(session.nva),
              va: normalizeOptionalNumber(session.va),
              skip: normalizeOptionalNumber(session.skip),
            },
          });
        }

        for (const log of snapshot.deleteLogs ?? []) {
          if (!log.id || !log.entityType || !log.entityId || !log.entityLabel) {
            continue;
          }
          const logId = isUuid(log.id) ? log.id : randomUUID();
          const actorUserId = log.actorUserId && isUuid(log.actorUserId)
            ? log.actorUserId
            : null;

          await tx.$executeRaw(
            Prisma.sql`
              IF NOT EXISTS (
                SELECT 1
                FROM [dbo].[DeleteLog]
                WHERE [id] = ${logId}
              )
              BEGIN
                INSERT INTO [dbo].[DeleteLog] (
                  [id],
                  [entityType],
                  [entityId],
                  [entityLabel],
                  [actorUserId],
                  [actorUsername],
                  [metadata],
                  [createdAt]
                )
                VALUES (
                  ${logId},
                  ${log.entityType},
                  ${log.entityId},
                  ${log.entityLabel},
                  ${actorUserId},
                  ${log.actorUsername ?? null},
                  ${log.metadata ? JSON.stringify(log.metadata) : null},
                  ${log.createdAt ? new Date(log.createdAt) : new Date()}
                )
              END
            `,
          );
        }
      });
    } catch (error) {
      await Promise.all(
        savedFiles.map((filePath) =>
          unlink(filePath).catch(() => {
            // Ignore cleanup failures for partially synced files.
          }),
        ),
      );

      throw error;
    }

    return {
      snapshot: await this.buildSnapshot(actor.sub),
      syncedAt: new Date().toISOString(),
    };
  }

  private async buildSnapshot(ownerUserId: string) {
    const [stageCategories, machineTypes, stages] = await Promise.all([
      this.prismaService.stageCategory.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      }),
      this.prismaService.machineType.findMany({
        where: { isActive: true },
        orderBy: [{ department: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      }),
      this.prismaService.stageList.findMany({
        where: { ownerUserId },
        orderBy: [{ area: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const users = await this.prismaService.user.findMany({
      orderBy: [{ username: 'asc' }],
    });

    const stageIds = stages.map((item) => item.id);
    const stageCodes = stages.map((item) => item.code.trim().toUpperCase());
    const stageScopes = stages.map((item) => normalizeScope(item.area ?? item.stage));

    const rows =
      stageIds.length > 0
        ? await this.prismaService.tableCT.findMany({
            where: {
              OR: [
                { stageItemId: { in: stageIds } },
                {
                  stageItemId: null,
                  no: { in: stageCodes },
                  stage: { in: stageScopes },
                },
              ],
            },
            orderBy: [{ sortOrder: 'asc' }, { no: 'asc' }],
          })
        : [];

    const completionMap = new Map<string, boolean>();
    const rowLockMap = new Map<string, boolean>();

    rows.forEach((row) => {
      const identityKey = row.stageItemId
        ? row.stageItemId
        : `${row.stage.trim().toUpperCase()}::${row.no.trim().toUpperCase()}`;

      if (!completionMap.has(identityKey) || row.done) {
        completionMap.set(identityKey, row.done);
      }

      if (!rowLockMap.has(identityKey) || row.confirmed) {
        rowLockMap.set(identityKey, row.confirmed);
      }

      if (row.stageItemId) {
        rowLockMap.set(row.stageItemId, row.confirmed);
      }

      rowLockMap.set(row.no.trim().toUpperCase(), row.confirmed);
    });

    const historyRows =
      stageIds.length > 0
        ? await this.prismaService.historyEntry.findMany({
            where: {
              OR: [
                { stageItemId: { in: stageIds } },
                { stageCode: { in: stageCodes } },
              ],
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          })
        : [];

    const controlRows =
      stageIds.length > 0
        ? await this.prismaService.controlSession.findMany({
            where: {
              OR: [
                { stageItemId: { in: stageIds } },
                { stageCode: { in: stageCodes } },
              ],
            },
            orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          })
        : [];
    const deleteLogs = await this.prismaService.$queryRaw<
      Array<{
        id: string;
        entityType: string;
        entityId: string;
        entityLabel: string;
        actorUserId: string | null;
        actorUsername: string | null;
        metadata: string | null;
        createdAt: Date;
      }>
    >(Prisma.sql`
      SELECT
        [id],
        [entityType],
        [entityId],
        [entityLabel],
        [actorUserId],
        [actorUsername],
        [metadata],
        [createdAt]
      FROM [dbo].[DeleteLog]
      ORDER BY [createdAt] DESC, [id] DESC
    `);

    return {
      users: users.map((item) => ({
        id: item.id,
        username: item.username,
        displayName: item.displayName,
        factory: item.factory,
        role: item.role,
      })),
      stageCategories: stageCategories.map((item) => ({
        id: item.id,
        value: item.value,
        label: item.label,
        sortOrder: item.sortOrder,
        isActive: item.isActive,
      })),
      machineTypes: machineTypes.map((item) => ({
        id: item.id,
        department: item.department,
        label: item.label,
        labelCn: item.labelCn ?? '',
        labelVn: item.labelVn ?? '',
        loss: item.loss ?? '',
        sortOrder: item.sortOrder,
        isActive: item.isActive,
      })),
      stages: stages.map((item) => {
        const parsed = parseStageIdentity(item.name, item.code);
        const completionKey = item.id;
        const fallbackCompletionKey = `${normalizeScope(item.area ?? item.stage)}::${parsed.code}`;

        return {
          id: item.id,
          code: parsed.code,
          name: parsed.name,
          processStage: item.stage,
          season: item.season ?? '',
          cutDie: item.cutDie ?? '',
          area: item.area ?? item.stage,
          article: item.article ?? '',
          duration: item.duration,
          mood: item.mood,
          stage: item.area ?? item.stage,
          stageDate: item.stageDate?.toISOString().slice(0, 10) ?? null,
          completed:
            completionMap.get(completionKey) ??
            completionMap.get(fallbackCompletionKey) ??
            false,
          videoUrl: item.filePath ? getStageVideoUrl(item.filePath) : undefined,
        };
      }),
      tableRows: rows.map((row) => this.mapTableRow(row)),
      history: historyRows.map((row) => this.mapHistoryRow(row, rowLockMap)),
      controlSessions: controlRows.map((row) => this.mapControlSession(row)),
      deleteLogs: deleteLogs.map((row) => ({
        id: row.id,
        entityType: row.entityType,
        entityId: row.entityId,
        entityLabel: row.entityLabel,
        actorUserId: row.actorUserId,
        actorUsername: row.actorUsername,
        metadata: safeParseJson(row.metadata),
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  private mapTableRow(row: {
    id: string;
    stageItemId: string | null;
    no: string;
    partName: string;
    stage: string;
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
      stageItemId: row.stageItemId,
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

  private mapHistoryRow(
    row: {
      id: string;
      stageItemId: string | null;
      stageCode: string;
      startTime: number;
      endTime: number;
      type: string;
      value: number;
      ctColumn: string | null;
      committed: boolean;
      createdAt: Date;
      updatedAt: Date;
    },
    rowLockMap: Map<string, boolean>,
  ) {
    const identityKey = row.stageItemId
      ? row.stageItemId
      : row.stageCode.trim().toUpperCase();

    return {
      id: row.id,
      stageItemId: row.stageItemId,
      stageCode: row.stageCode,
      startTime: row.startTime,
      endTime: row.endTime,
      type: row.type as 'NVA' | 'VA' | 'SKIP',
      value: row.value,
      ctColumn: row.ctColumn,
      committed: row.committed,
      locked: rowLockMap.get(identityKey) ?? false,
      range: `${formatClock(row.startTime)} - ${formatClock(row.endTime)}`,
      label: `${row.type}: ${row.value.toFixed(1)}`,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapControlSession(row: {
    id: string;
    stageItemId: string | null;
    stageCode: string;
    elapsed: number;
    isRunning: boolean;
    segmentStart: number;
    nva: number | null;
    va: number | null;
    skip: number | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      stageItemId: row.stageItemId,
      stageCode: row.stageCode,
      elapsed: row.elapsed,
      isRunning: row.isRunning,
      segmentStart: row.segmentStart,
      nva: row.nva,
      va: row.va,
      skip: row.skip,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function parseSnapshot(value: string | object | undefined | null): SyncSnapshot {
  if (!value) {
    throw new BadRequestException('Snapshot payload is required.');
  }

  if (typeof value === 'object') {
    return value as SyncSnapshot;
  }

  try {
    return JSON.parse(value) as SyncSnapshot;
  } catch {
    throw new BadRequestException('Snapshot payload is invalid.');
  }
}

function parseVideoRefs(value: string | object | undefined | null): SyncVideoRef[] {
  if (!value) {
    return [];
  }

  if (typeof value === 'object') {
    return Array.isArray(value) ? (value as SyncVideoRef[]) : [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as SyncVideoRef[]) : [];
  } catch {
    throw new BadRequestException('Video references payload is invalid.');
  }
}

async function saveSyncVideoFile(
  assetId: string,
  file: Express.Multer.File,
  stage?: SyncStageItem,
) {
  ensureStageUploadDir();
  const stageUploadDir = getStageUploadDir();

  const extension = extname(file.originalname).toLowerCase() || '.mp4';
  const targetDir = stage
    ? join(
        stageUploadDir,
        sanitizePathSegment(stage.stageDate, 'unknown-date'),
        sanitizePathSegment(stage.season, 'unknown-season'),
        sanitizePathSegment(stage.processStage, 'unknown-stage'),
        sanitizePathSegment(stage.area ?? stage.stage, 'unknown-area'),
        sanitizePathSegment(stage.article, 'unknown-article'),
      )
    : join(stageUploadDir, 'sync', sanitizeFileName(assetId) || 'asset');
  const targetPath = join(targetDir, `${randomUUID()}${extension}`);

  await mkdir(targetDir, { recursive: true });
  await writeFile(targetPath, file.buffer);

  return targetPath;
}

function parseDate(value?: string | null) {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function normalizeNullableString(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeScope(value?: string | null) {
  return value?.trim().toUpperCase() ?? '';
}

function normalizeOptionalNumber(value?: number | null) {
  if (typeof value === 'undefined' || value === null || Number.isNaN(value)) {
    return null;
  }

  return Number(value);
}

function normalizeTenValues(values: number[]) {
  const next = Array.from({ length: 10 }, (_, index) => Number(values[index] ?? 0));
  return next.map((value) => (Number.isFinite(value) ? value : 0));
}

function isNewerSyncRecord(
  next: { updatedAt?: string; createdAt?: string },
  current: { updatedAt?: string; createdAt?: string },
) {
  return getSyncRecordTime(next) >= getSyncRecordTime(current);
}

function getSyncRecordTime(value: { updatedAt?: string; createdAt?: string }) {
  const rawValue = value.updatedAt ?? value.createdAt;
  if (!rawValue) {
    return 0;
  }

  const timestamp = new Date(rawValue).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function parseStageIdentity(rawName: string, fallbackCode: string) {
  const matched = rawName.trim().match(/^([^.]+)\.\s*(.+)$/);

  if (!matched) {
    return {
      code: fallbackCode.trim().toUpperCase() || 'NEW',
      name: rawName.trim() || fallbackCode.trim().toUpperCase() || 'NEW',
    };
  }

  return {
    code: matched[1].trim().toUpperCase() || fallbackCode.trim().toUpperCase() || 'NEW',
    name: matched[2].trim() || rawName.trim() || fallbackCode.trim().toUpperCase() || 'NEW',
  };
}

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase();
}

function sanitizePathSegment(value: string | undefined | null, fallback: string) {
  const normalized = sanitizeFileName((value ?? '').trim());
  return normalized || fallback;
}

function isUuid(value?: string | null) {
  return Boolean(
    value?.trim() &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.trim(),
      ),
  );
}

function normalizeRole(role?: string) {
  return role?.trim().toLowerCase() === 'admin' ? 'admin' : 'user';
}

function normalizeFactory(factory?: string) {
  const normalized = factory?.trim().toUpperCase();
  return normalized && ['LYV', 'LHG', 'LVL', 'LYM'].includes(normalized)
    ? normalized
    : 'LYV';
}

function safeParseJson(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return { raw: value };
  }
}
