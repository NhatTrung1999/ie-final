import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import ExcelJS from 'exceljs';

import { stages as seedStageTabs } from '@/data/dashboard';
import { getStoredSessionUser, getStoredToken } from '@/lib/storage';
import type {
  ControlSessionItem,
  CtRow,
  HistoryItem,
  StageCategory,
  StageItem,
  StageKey,
} from '@/types/dashboard';
import type { AuthUser } from '@/services/auth';
import type { DeleteLogItem } from '@/services/delete-logs';
import type { MachineTypeItem } from '@/services/machine-types';

type OfflineUser = AuthUser & {
  password: string;
  category: string;
};

type OfflineStageItem = StageItem & {
  area?: StageKey;
  processStage?: string;
  stageDate?: string | null;
  season?: string;
  cutDie?: string;
  article?: string;
  videoAssetId?: string | null;
  sortOrder: number;
};

type OfflineTableRow = CtRow & {
  stage: StageKey;
  sortOrder: number;
};

type OfflineHistoryEntry = HistoryItem & {
  stageItemId?: string | null;
  stageCode: string;
  type: 'NVA' | 'VA' | 'SKIP';
  value: number;
  committed: boolean;
  locked?: boolean;
  createdAt: string;
  updatedAt: string;
};

type OfflineControlSession = ControlSessionItem & {
  createdAt: string;
  updatedAt: string;
};

type OfflineDb = {
  users: OfflineUser[];
  stageCategories: OfflineStageCategory[];
  stages: OfflineStageItem[];
  tableRows: OfflineTableRow[];
  history: OfflineHistoryEntry[];
  controlSessions: OfflineControlSession[];
  deleteLogs: DeleteLogItem[];
  machineTypes: MachineTypeItem[];
};

type OfflineMeta = {
  revision: number;
  lastSyncedRevision: number;
  lastSyncedAt: string | null;
};

type OfflineStageCategory = StageCategory & {
  sortOrder: number;
  isActive?: boolean;
};

export type OfflineShareImportMode = 'replace' | 'merge-stage-data';

type OfflineRequestBody = Record<string, unknown> & {
  files?: File[];
};

const STORAGE_KEY = 'ie-video-offline-db-v1';
const META_KEY = 'ie-video-offline-meta-v1';
const STAGE_TABS_KEY = 'ie-video-stage-tabs-v1';
export const OFFLINE_SYNC_EVENT = 'ie-offline-sync-changed';
const ASSET_DB_NAME = 'ie-video-offline-assets';
const ASSET_STORE_NAME = 'video-assets';
const OFFLINE_TOKEN_PREFIX = 'offline-token:';
const PUBLIC_ROUTES = new Set(['/auth/login']);
const DEFAULT_DEMO_STAGE_IDS = new Set(['c10', 'c4', 'c3', 'c2', 's1', 'a1', 'st1']);
const DEFAULT_DEMO_ROW_IDS = new Set(['r1', 'r2', 'r3']);
const DEFAULT_DEMO_HISTORY_IDS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'h7',
  'h8',
]);

let cachedDb: OfflineDb | null = null;
const objectUrlCache = new Map<string, string>();

/**
 * Trạng thái backend reachability — được cập nhật bởi health check.
 * null = chưa biết (đang check lần đầu)
 * true  = backend đang online và reach được
 * false = backend không reach được (dù navigator.onLine có thể vẫn true)
 */
let backendReachable: boolean | null = null;

/** Gọi từ health check để cập nhật trạng thái backend. */
export function setBackendReachable(reachable: boolean) {
  backendReachable = reachable;
}

/** Trả về trạng thái backend reachability hiện tại. */
export function isBackendReachable() {
  return backendReachable;
}

export function isOfflineMode() {
  const flag = import.meta.env.VITE_OFFLINE_MODE;
  if (typeof flag === 'string') {
    return flag.toLowerCase() === 'true';
  }

  return false;
}

export function isBrowserOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function shouldUseOfflineData() {
  // VITE_OFFLINE_MODE=true → luôn offline
  if (isOfflineMode()) return true;

  // navigator.onLine=false → browser phát hiện mất mạng
  if (isBrowserOffline()) return true;

  // Backend không reach được (health check đã confirm):
  //   - backendReachable=null  → chưa check xong, chưa kết luận → không force offline
  //   - backendReachable=false → đã xác nhận backend offline → dùng offline data
  if (backendReachable === false) return true;

  return false;
}

export function getCachedStageTabs() {
  if (typeof window === 'undefined') {
    return [...seedStageTabs];
  }

  const raw = window.localStorage.getItem(STAGE_TABS_KEY);
  if (!raw) {
    return [...seedStageTabs];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [...seedStageTabs];
    }

    const normalized = parsed
      .map((value) => normalizeStageTabValue(value))
      .filter((value): value is StageKey => value.length > 0);

    return normalized.length > 0 ? dedupeStageTabs(normalized) : [...seedStageTabs];
  } catch {
    return [...seedStageTabs];
  }
}

export function setCachedStageTabs(tabs: StageKey[]) {
  if (typeof window === 'undefined') {
    return dedupeStageTabs(tabs);
  }

  const normalized = dedupeStageTabs(tabs);
  window.localStorage.setItem(STAGE_TABS_KEY, JSON.stringify(normalized));
  return normalized;
}

export function cacheStageTabsFromStages(stages: Array<Pick<StageItem, 'stage'>>) {
  const currentTabs = getCachedStageTabs();
  const nextTabs = dedupeStageTabs([
    ...currentTabs,
    ...stages.map((item) => normalizeStageTabValue(item.stage)).filter((value) => value.length > 0),
  ]);

  return setCachedStageTabs(nextTabs);
}

export function isOfflineNetworkError(error: unknown) {
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    name?: unknown;
    response?: unknown;
    request?: unknown;
  };
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  const normalizedMessage = message.toLowerCase();

  if (code === 'ERR_CANCELED' || candidate.name === 'CanceledError') {
    return false;
  }

  if (candidate.response) {
    return false;
  }

  return (
    code === 'ERR_NETWORK' ||
    code === 'ERR_INTERNET_DISCONNECTED' ||
    code === 'ECONNABORTED' ||
    normalizedMessage === 'network error' ||
    normalizedMessage.includes('failed to fetch') ||
    normalizedMessage.includes('internet disconnected') ||
    normalizedMessage.includes('load failed') ||
    Boolean(candidate.request)
  );
}

export function getOfflineSyncStatus() {
  const meta = loadMeta();

  return {
    revision: meta.revision,
    lastSyncedRevision: meta.lastSyncedRevision,
    lastSyncedAt: meta.lastSyncedAt,
    pending: meta.revision > meta.lastSyncedRevision,
  };
}

export function notifyOfflineSyncStateChanged() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(OFFLINE_SYNC_EVENT));
}

export async function buildOfflineSyncFormData() {
  const db = loadDb();
  const formData = new FormData();
  const videoRefs: Array<{ assetId: string; stageId: string; originalName: string }> = [];

  formData.append(
    'snapshot',
    JSON.stringify({
      users: db.users,
      stageCategories: db.stageCategories,
      machineTypes: db.machineTypes,
      stages: db.stages,
      tableRows: db.tableRows,
      history: db.history,
      controlSessions: db.controlSessions,
      deleteLogs: db.deleteLogs,
    }),
  );

  for (const stage of db.stages) {
    if (!stage.videoAssetId) {
      continue;
    }

    const file = await readVideoAsset(stage.videoAssetId);
    if (!file) {
      continue;
    }

    const fileName =
      'name' in file && typeof file.name === 'string' && file.name.trim()
        ? file.name
        : `${stage.code || stage.id}.mp4`;

    formData.append('videos', file, fileName);
    videoRefs.push({
      assetId: stage.videoAssetId,
      stageId: stage.id,
      originalName: fileName,
    });
  }

  formData.append('videoRefs', JSON.stringify(videoRefs));
  return formData;
}

export async function buildOfflineShareBundle() {
  const db = loadDb();
  const videos: Array<{
    assetId: string;
    stageId: string;
    fileName: string;
    mimeType: string;
    dataUrl: string;
  }> = [];

  for (const stage of db.stages) {
    if (!stage.videoAssetId) {
      continue;
    }

    const file = await readVideoAsset(stage.videoAssetId);
    if (!file) {
      continue;
    }

    videos.push({
      assetId: stage.videoAssetId,
      stageId: stage.id,
      fileName:
        'name' in file && typeof file.name === 'string' && file.name.trim()
          ? file.name
          : `${stage.code || stage.id}.mp4`,
      mimeType: file.type || 'video/mp4',
      dataUrl: await blobToDataUrl(file),
    });
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    snapshot: {
      users: db.users,
      stageCategories: db.stageCategories,
      stages: db.stages,
      tableRows: db.tableRows,
      history: db.history,
      controlSessions: db.controlSessions,
      deleteLogs: db.deleteLogs,
      machineTypes: db.machineTypes,
    },
    videos,
  };
}

export function getOfflineUsers() {
  return loadDb().users.map(stripUser);
}

export function getOfflineStageCategories() {
  return [...loadDb().stageCategories]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map(stripStageCategory);
}

/**
 * Tạo stage trực tiếp trong offline DB — dùng khi browser offline hoặc VITE_OFFLINE_MODE=true.
 * Bypass hoàn toàn axios adapter để tránh các vấn đề với fakeConfig / FormData parsing.
 * Logic giống hệt handlePost cho path '/stages'.
 */
export async function createOfflineStages(payload: {
  date: string;
  season: string;
  stageCode: string;
  cutDie: string;
  area: StageKey;
  article: string;
  files: File[];
}) {
  const db = loadDb();
  const previousSnapshotJson = JSON.stringify(sanitizeDbForPersist(db));

  if (payload.files.length === 0) {
    throw new Error('At least one video file is required.');
  }

  const date = normalizeDate(payload.date);
  const season = validateTextOnlyField(payload.season, 'Season', 100);
  const stageCode = payload.stageCode.trim() || 'STAGE';
  const cutDie = validateTextOnlyField(payload.cutDie, 'Cut Die', 100);
  const area = payload.area.trim() as StageKey;
  const article = validateTextOnlyField(payload.article, 'Article', 255);

  const createdStages = await Promise.all(
    payload.files.map(async (file, index) => {
      const fallbackCode = payload.files.length === 1 ? cutDie.toUpperCase() : `${cutDie.toUpperCase()}-${index + 1}`;
      const parsedIdentity = parseStageIdentity(file.name, fallbackCode);
      const uniqueName = ensureUniqueStageName(db.stages, {
        area,
        stageDate: date,
        name: parsedIdentity.name,
      });
      const videoAssetId = createId();

      const nextStage: OfflineStageItem = {
        id: createId(),
        code: parsedIdentity.code,
        name: uniqueName,
        processStage: stageCode,
        season,
        cutDie,
        area,
        article,
        duration: formatDuration(30 + index * 8),
        mood: index % 2 === 0 ? 'NVA' : 'VA',
        stage: area || 'CUTTING',
        stageDate: date,
        completed: false,
        videoAssetId,
        sortOrder: db.stages.length + index + 1,
      };

      await storeVideoAsset(videoAssetId, file);
      db.stages.push(nextStage);
      db.tableRows.push(
        buildDefaultTableRow({
          stage: nextStage.stage,
          stageItemId: nextStage.id,
          no: parsedIdentity.code,
          partName: uniqueName,
          sortOrder: db.tableRows.length + index + 1,
        }),
      );

      return nextStage;
    }),
  );

  cachedDb = db;
  saveDb(db, previousSnapshotJson);

  const result: StageItem[] = await Promise.all(
    createdStages.map(async (stage) => ({
      ...stripStageItem(stage, db),
      videoUrl: stage.videoAssetId
        ? await getVideoObjectUrl(stage.videoAssetId)
        : undefined,
    })),
  );

  return result;
}


type OfflineStageFilterParams = {
  dateFrom?: string;
  dateTo?: string;
  season?: string;
  stage?: string;
  area?: string;
  article?: string;
  cutDie?: string;
  confirmedTableCtOnly?: string;
};

export async function getOfflineStages(filters?: OfflineStageFilterParams) {
  const db = loadDb();
  let stages = filterStages(db.stages, filters ?? {});
  if (filters?.confirmedTableCtOnly === 'true') {
    stages = stages.filter((stage) =>
      db.tableRows.some(
        (row) =>
          row.confirmed &&
          (row.stageItemId === stage.id ||
            (!row.stageItemId &&
              normalizeText(row.stage) === normalizeText(stage.area ?? stage.stage) &&
              normalizeText(row.no) === normalizeText(stage.code))),
      ),
    );
  }
  cacheStageTabsFromStages(stages);
  const nextStages: StageItem[] = [];

  for (const item of stages) {
    let videoUrl: string | undefined = item.videoUrl;

    if (item.videoAssetId) {
      try {
        videoUrl = await getVideoObjectUrl(item.videoAssetId);
      } catch {
        videoUrl = item.videoUrl;
      }
    }

    nextStages.push({
      ...stripStageItem(item, db),
      videoUrl,
    });
  }

  return nextStages;
}

export function getOfflineTableRows(params: {
  stage?: StageKey;
  stageCode?: string;
  stageItemId?: string;
}) {
  return filterTableRows(loadDb().tableRows, params).map(stripTableRow);
}

export function getOfflineHistoryItems(filters?: {
  stageItemId?: string;
  stageCode?: string;
}) {
  const db = loadDb();
  return filterHistory(db.history, filters ?? {}).map((item) => stripHistoryItem(item, db));
}

export function getOfflineControlSession(filters?: {
  stageItemId?: string;
  stageCode?: string;
}) {
  const session = findControlSession(loadDb().controlSessions, filters ?? {});
  return session ? stripControlSession(session) : null;
}

export function getOfflineMachineTypes(department?: string) {
  const normalizedDepartment = normalizeText(department);
  const machineTypes = normalizedDepartment
    ? loadDb().machineTypes.filter((item) => normalizeText(item.department) === normalizedDepartment)
    : loadDb().machineTypes;

  return machineTypes;
}

export function getOfflineDeleteLogs(filters: {
  entityType?: string;
  username?: string;
  search?: string;
} = {}) {
  return filterDeleteLogs(loadDb().deleteLogs, filters);
}

export async function restoreOfflineShareBundle(
  bundle: unknown,
  options?: {
    mode?: OfflineShareImportMode;
  },
) {
  const parsed = validateShareBundle(bundle);
  const mode = options?.mode ?? 'replace';
  const current = loadDb();
  const previousSnapshotJson = JSON.stringify(sanitizeDbForPersist(current));

  cachedDb =
    mode === 'merge-stage-data'
      ? mergeShareBundleStageData(current, parsed)
      : {
          users:
            Array.isArray(parsed.snapshot.users) && parsed.snapshot.users.length > 0
              ? (parsed.snapshot.users as OfflineUser[])
              : current.users,
          stageCategories:
            Array.isArray(parsed.snapshot.stageCategories) &&
            parsed.snapshot.stageCategories.length > 0
              ? (parsed.snapshot.stageCategories as OfflineStageCategory[])
              : current.stageCategories,
          stages:
            Array.isArray(parsed.snapshot.stages) && parsed.snapshot.stages.length > 0
              ? (parsed.snapshot.stages as OfflineStageItem[])
              : current.stages,
          tableRows:
            Array.isArray(parsed.snapshot.tableRows) && parsed.snapshot.tableRows.length > 0
              ? (parsed.snapshot.tableRows as OfflineTableRow[])
              : current.tableRows,
          history:
            Array.isArray(parsed.snapshot.history) && parsed.snapshot.history.length > 0
              ? (parsed.snapshot.history as OfflineHistoryEntry[])
              : current.history,
          controlSessions:
            Array.isArray(parsed.snapshot.controlSessions) &&
            parsed.snapshot.controlSessions.length > 0
              ? (parsed.snapshot.controlSessions as OfflineControlSession[])
              : current.controlSessions,
          deleteLogs:
            Array.isArray(parsed.snapshot.deleteLogs) && parsed.snapshot.deleteLogs.length > 0
              ? (parsed.snapshot.deleteLogs as DeleteLogItem[])
              : current.deleteLogs,
          machineTypes:
            Array.isArray(parsed.snapshot.machineTypes) && parsed.snapshot.machineTypes.length > 0
              ? (parsed.snapshot.machineTypes as MachineTypeItem[])
              : current.machineTypes,
        };

  if (mode === 'merge-stage-data') {
    await upsertVideoAssets(parsed.videos);
  } else {
    await replaceVideoAssets(parsed.videos);
  }
  resetVideoAssetCache();
  saveDb(cachedDb, previousSnapshotJson);
  return getOfflineSyncStatus();
}

export async function applySyncedSnapshot(snapshot: Partial<OfflineDb>) {
  void snapshot;
  await clearVideoAssets();
  resetVideoAssetCache();
  clearOfflineDbStorage();
  markOfflineSnapshotSynced();
}

export async function offlineAdapter(config: InternalAxiosRequestConfig) {
  const db = loadDb();
  const previousSnapshotJson = JSON.stringify(sanitizeDbForPersist(db));
  const token = getStoredToken();
  const path = normalizePath(config.baseURL, config.url);

  if (!PUBLIC_ROUTES.has(path) && !token) {
    return rejectRequest(config, 401, 'Session expired or token is invalid.');
  }

  const method = (config.method ?? 'get').toLowerCase();
  const body = parseRequestBody(config.data);
  const params = (config.params ?? {}) as Record<string, unknown>;

  try {
    const result = await dispatchOfflineRequest(db, method, path, body, params);
    cachedDb = result.db;
    if (result.persist !== false) {
      saveDb(result.db, previousSnapshotJson);
    }
    return buildResponse(config, result.data, result.status ?? 200);
  } catch (error) {
    if (error instanceof AxiosError) {
      throw error;
    }

    return rejectRequest(
      config,
      500,
      error instanceof Error ? error.message : 'Offline request failed.',
    );
  }
}

function createSeedDb(): OfflineDb {
  const users: OfflineUser[] = [
    {
      id: 'user-admin',
      username: 'administrator',
      displayName: 'Administrator',
      password: 'admin123',
      category: 'FF28',
    },
    {
      id: 'user-demo',
      username: 'demo',
      displayName: 'Demo User',
      password: 'demo123',
      category: 'LSA',
    },
  ];

  const stageCategories: OfflineStageCategory[] = [
    { id: 'cat-ff28', value: 'FF28', label: 'FF28', sortOrder: 1 },
    { id: 'cat-costing', value: 'COSTING', label: 'COSTING', sortOrder: 2 },
    { id: 'cat-lsa', value: 'LSA', label: 'LSA', sortOrder: 3 },
  ];

  return {
    users,
    stageCategories,
    stages: [],
    tableRows: [],
    history: [],
    controlSessions: [],
    deleteLogs: [],
    machineTypes: createSeedMachineTypes(),
  };
}

function createEmptyDb(): OfflineDb {
  return {
    users: [],
    stageCategories: [],
    stages: [],
    tableRows: [],
    history: [],
    controlSessions: [],
    deleteLogs: [],
    machineTypes: [],
  };
}

function createSeedMachineTypes(): MachineTypeItem[] {
  return [
    {
      id: 'machine-1',
      department: 'CUTTING',
      label: 'CUTTING-01',
      labelCn: 'Cutting Machine 01',
      labelVn: 'May cat 01',
      loss: '0%',
    },
    {
      id: 'machine-2',
      department: 'CUTTING',
      label: 'CUTTING-02',
      labelCn: 'Cutting Machine 02',
      labelVn: 'May cat 02',
      loss: '5%',
    },
    {
      id: 'machine-3',
      department: 'STITCHING',
      label: 'STITCHING-01',
      labelCn: 'Stitching Machine 01',
      labelVn: 'May may 01',
      loss: '3%',
    },
    {
      id: 'machine-4',
      department: 'ASSEMBLY',
      label: 'ASSEMBLY-01',
      labelCn: 'Assembly Machine 01',
      labelVn: 'May lap rap 01',
      loss: '2%',
    },
  ];
}

function loadDb(): OfflineDb {
  if (cachedDb) {
    cachedDb = cloneDbForMutation(cachedDb);
    return cachedDb;
  }

  if (typeof window === 'undefined') {
    cachedDb = createSeedDb();
    return cachedDb;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    cachedDb = createSeedDb();
    saveDb(cachedDb, undefined, false);
    return cachedDb;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<OfflineDb>;
    cachedDb = removeDefaultDemoData(cloneDbForMutation(mergeDb(createSeedDb(), parsed)));
    saveDb(cachedDb, undefined, false);
    return cachedDb;
  } catch {
    cachedDb = createSeedDb();
    saveDb(cachedDb, undefined, false);
    return cachedDb;
  }
}

function saveDb(db: OfflineDb, previousSnapshotJson?: string, markDirty = true) {
  if (typeof window === 'undefined') {
    return;
  }

  const nextSnapshotJson = JSON.stringify(sanitizeDbForPersist(db));
  window.localStorage.setItem(STORAGE_KEY, nextSnapshotJson);

  if (markDirty && previousSnapshotJson !== nextSnapshotJson) {
    touchOfflineRevision();
  }
}

function clearOfflineDbStorage() {
  cachedDb = createEmptyDb();

  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}

function loadMeta(): OfflineMeta {
  if (typeof window === 'undefined') {
    return {
      revision: 0,
      lastSyncedRevision: 0,
      lastSyncedAt: null,
    };
  }

  const raw = window.localStorage.getItem(META_KEY);
  if (!raw) {
    const meta: OfflineMeta = {
      revision: 0,
      lastSyncedRevision: 0,
      lastSyncedAt: null,
    };
    window.localStorage.setItem(META_KEY, JSON.stringify(meta));
    return meta;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<OfflineMeta>;
    return {
      revision: Number(parsed.revision ?? 0),
      lastSyncedRevision: Number(parsed.lastSyncedRevision ?? 0),
      lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null,
    };
  } catch {
    const meta: OfflineMeta = {
      revision: 0,
      lastSyncedRevision: 0,
      lastSyncedAt: null,
    };
    window.localStorage.setItem(META_KEY, JSON.stringify(meta));
    return meta;
  }
}

function saveMeta(meta: OfflineMeta) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(META_KEY, JSON.stringify(meta));
  notifyOfflineSyncStateChanged();
}

function touchOfflineRevision() {
  const meta = loadMeta();
  meta.revision += 1;
  saveMeta(meta);
}

export function markOfflineSnapshotSynced() {
  const meta = loadMeta();
  meta.lastSyncedRevision = meta.revision;
  meta.lastSyncedAt = new Date().toISOString();
  saveMeta(meta);
}

function mergeDb(seed: OfflineDb, parsed: Partial<OfflineDb>): OfflineDb {
  return {
    users: Array.isArray(parsed.users) && parsed.users.length > 0 ? (parsed.users as OfflineUser[]) : seed.users,
    stageCategories:
      Array.isArray(parsed.stageCategories) && parsed.stageCategories.length > 0
        ? (parsed.stageCategories as OfflineStageCategory[])
        : seed.stageCategories,
    stages: Array.isArray(parsed.stages) && parsed.stages.length > 0 ? (parsed.stages as OfflineStageItem[]) : seed.stages,
    tableRows:
      Array.isArray(parsed.tableRows) && parsed.tableRows.length > 0 ? (parsed.tableRows as OfflineTableRow[]) : seed.tableRows,
    history: Array.isArray(parsed.history) && parsed.history.length > 0 ? (parsed.history as OfflineHistoryEntry[]) : seed.history,
    controlSessions:
      Array.isArray(parsed.controlSessions) && parsed.controlSessions.length > 0
        ? (parsed.controlSessions as OfflineControlSession[])
        : seed.controlSessions,
    deleteLogs:
      Array.isArray(parsed.deleteLogs) && parsed.deleteLogs.length > 0
        ? (parsed.deleteLogs as DeleteLogItem[])
        : seed.deleteLogs,
    machineTypes:
      Array.isArray(parsed.machineTypes) && parsed.machineTypes.length > 0
        ? (parsed.machineTypes as MachineTypeItem[])
        : seed.machineTypes,
  };
}

function mergeShareBundleStageData(current: OfflineDb, parsed: ReturnType<typeof validateShareBundle>) {
  const nextStages = mergeStageItems(
    current.stages,
    Array.isArray(parsed.snapshot.stages) ? (parsed.snapshot.stages as OfflineStageItem[]) : [],
    parsed.videos,
  );

  return {
    ...current,
    stageCategories:
      Array.isArray(parsed.snapshot.stageCategories) && parsed.snapshot.stageCategories.length > 0
        ? mergeStageCategories(
            current.stageCategories,
            parsed.snapshot.stageCategories as OfflineStageCategory[],
          )
        : current.stageCategories,
    stages: nextStages,
    machineTypes:
      Array.isArray(parsed.snapshot.machineTypes) && parsed.snapshot.machineTypes.length > 0
        ? mergeMachineTypes(current.machineTypes, parsed.snapshot.machineTypes as MachineTypeItem[])
        : current.machineTypes,
  };
}

function mergeStageCategories(
  currentCategories: OfflineStageCategory[],
  nextCategories: OfflineStageCategory[],
) {
  const merged = new Map<string, OfflineStageCategory>();

  currentCategories.forEach((category) => {
    merged.set(normalizeText(category.value), category);
  });

  nextCategories.forEach((category) => {
    const key = normalizeText(category.value);
    if (!merged.has(key)) {
      merged.set(key, category);
    }
  });

  return [...merged.values()].sort((left, right) => left.sortOrder - right.sortOrder);
}

function mergeMachineTypes(
  currentTypes: MachineTypeItem[],
  nextTypes: MachineTypeItem[],
) {
  const merged = new Map<string, MachineTypeItem>();

  currentTypes.forEach((item) => {
    merged.set(item.id, item);
  });

  nextTypes.forEach((item) => {
    if (!merged.has(item.id)) {
      merged.set(item.id, item);
    }
  });

  return [...merged.values()];
}

function mergeStageItems(
  currentStages: OfflineStageItem[],
  nextStages: OfflineStageItem[],
  videos: Array<{
    assetId: string;
    stageId: string;
    fileName: string;
    mimeType: string;
    dataUrl: string;
  }>,
) {
  const videoByStageId = new Map(videos.map((video) => [video.stageId, video]));
  const merged = [...currentStages];
  const indexByKey = new Map<string, number>();

  merged.forEach((stage, index) => {
    indexByKey.set(getStageMergeKey(stage), index);
  });

  let nextSortOrder = merged.reduce((max, stage) => Math.max(max, stage.sortOrder), 0);

  nextStages.forEach((stage) => {
    const key = getStageMergeKey(stage);
    const importedVideo = videoByStageId.get(stage.id);
    const existingIndex = indexByKey.get(key);

    if (existingIndex != null) {
      const currentStage = merged[existingIndex];
      merged[existingIndex] = {
        ...currentStage,
        ...stage,
        id: currentStage.id,
        sortOrder: currentStage.sortOrder,
        videoAssetId: importedVideo?.assetId ?? stage.videoAssetId ?? currentStage.videoAssetId ?? null,
      };
      return;
    }

    nextSortOrder += 1;
    merged.push({
      ...stage,
      sortOrder: nextSortOrder,
      videoAssetId: importedVideo?.assetId ?? stage.videoAssetId ?? null,
    });
  });

  return merged.sort((left, right) => left.sortOrder - right.sortOrder);
}

async function upsertVideoAssets(
  videos: Array<{
    assetId: string;
    stageId: string;
    fileName: string;
    mimeType: string;
    dataUrl: string;
  }>,
) {
  if (videos.length === 0) {
    return;
  }

  for (const video of videos) {
    const file = await dataUrlToFile(video.dataUrl, video.fileName, video.mimeType);
    await storeVideoAsset(video.assetId, file);
  }
}

async function replaceVideoAssets(
  videos: Array<{
    assetId: string;
    stageId: string;
    fileName: string;
    mimeType: string;
    dataUrl: string;
  }>,
) {
  await clearVideoAssets();

  for (const video of videos) {
    const file = await dataUrlToFile(video.dataUrl, video.fileName, video.mimeType);
    await storeVideoAsset(video.assetId, file);
  }
}

async function clearVideoAssets() {
  const db = await openAssetDb();
  if (!db) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE_NAME, 'readwrite');
    tx.objectStore(ASSET_STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Unable to clear asset store.'));
  });
}

function resetVideoAssetCache() {
  objectUrlCache.forEach((url) => {
    URL.revokeObjectURL(url);
  });
  objectUrlCache.clear();
}

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to encode video asset.'));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToFile(dataUrl: string, fileName: string, mimeType: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: mimeType || blob.type || 'video/mp4' });
}

function validateShareBundle(bundle: unknown): {
  version: number;
  exportedAt: string;
  snapshot: Partial<OfflineDb>;
  videos: Array<{
    assetId: string;
    stageId: string;
    fileName: string;
    mimeType: string;
    dataUrl: string;
  }>;
} {
  if (!bundle || typeof bundle !== 'object') {
    throw new Error('Share bundle is invalid.');
  }

  const parsed = bundle as {
    version?: unknown;
    exportedAt?: unknown;
    snapshot?: Partial<OfflineDb>;
    videos?: unknown;
  };

  if (Number(parsed.version) !== 1) {
    throw new Error('Unsupported share bundle version.');
  }

  if (!parsed.snapshot || typeof parsed.snapshot !== 'object') {
    throw new Error('Share bundle snapshot is invalid.');
  }

  return {
    version: 1,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    snapshot: parsed.snapshot,
    videos: Array.isArray(parsed.videos)
      ? (parsed.videos as Array<{
          assetId: string;
          stageId: string;
          fileName: string;
          mimeType: string;
          dataUrl: string;
        }>)
      : [],
  };
}

function sanitizeDbForPersist(db: OfflineDb): OfflineDb {
  return {
    ...db,
    stages: db.stages.map((stage) => ({
      ...stage,
      videoUrl:
        typeof stage.videoUrl === 'string' && stage.videoUrl.startsWith('blob:')
          ? undefined
          : stage.videoUrl,
    })),
  };
}

function normalizePath(baseURL: string | undefined, url: string | undefined) {
  const raw = `${baseURL ?? ''}${url ?? ''}`;
  const withoutOrigin = raw.replace(/^https?:\/\/[^/]+/i, '');
  const withoutQuery = withoutOrigin.split('?')[0] ?? withoutOrigin;
  return withoutQuery.startsWith('/api') ? withoutQuery.slice(4) || '/' : withoutQuery;
}

function parseRequestBody(data: unknown): OfflineRequestBody {
  if (!data) return {};

  if (typeof FormData !== 'undefined' && data instanceof FormData) {
    const body: OfflineRequestBody = { files: [] };
    for (const [key, value] of data.entries()) {
      if (key === 'files' && typeof File !== 'undefined' && value instanceof File) {
        body.files?.push(value);
        continue;
      }
      body[key] = value;
    }
    return body;
  }

  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as OfflineRequestBody;
    } catch {
      return {};
    }
  }

  return data as OfflineRequestBody;
}

function stripFileExtension(name: string) {
  return name.replace(/\.[^.]+$/, '');
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function validateTextOnlyField(value: unknown, label: string, maxLength: number) {
  const normalizedValue = String(value ?? '').trim();

  if (!normalizedValue) {
    throw new Error(`${label} is required.`);
  }

  if (normalizedValue.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }

  if (!/^[\p{L}\p{N}\s]+$/u.test(normalizedValue)) {
    throw new Error(`${label} can only contain letters, numbers, and spaces.`);
  }

  return normalizedValue;
}

function formatDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatRange(startTime: number, endTime: number) {
  return `${formatClock(startTime)} - ${formatClock(endTime)}`;
}

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function buildResponse(config: InternalAxiosRequestConfig, data: unknown, status: number): AxiosResponse {
  return {
    data,
    status,
    statusText: status === 401 ? 'Unauthorized' : status === 404 ? 'Not Found' : 'OK',
    headers: {},
    config,
  };
}

function rejectRequest(
  config: InternalAxiosRequestConfig,
  status: number,
  message: string,
  data?: unknown,
) {
  const response = buildResponse(config, data ?? { message }, status);
  return Promise.reject(
    new AxiosError(
      message,
      status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
      config,
      undefined,
      response,
    ),
  );
}

async function dispatchOfflineRequest(
  db: OfflineDb,
  method: string,
  path: string,
  body: OfflineRequestBody,
  params: Record<string, unknown>,
): Promise<{ db: OfflineDb; data: unknown; status?: number; persist?: boolean }> {
  switch (method) {
    case 'get':
      return handleGet(db, path, params);
    case 'post':
      return handlePost(db, path, body);
    case 'patch':
      return handlePatch(db, path, body);
    case 'put':
      return handlePut(db, path, body);
    case 'delete':
      return handleDelete(db, path);
    default:
      throw new Error(`Unsupported offline method: ${method}`);
  }
}

async function handleGet(
  db: OfflineDb,
  path: string,
  params: Record<string, unknown>,
) {
  if (path === '/auth/me') {
    return {
      db,
      data: { user: getStoredSessionUser() },
      persist: false,
    };
  }

  if (path === '/auth/users') {
    return {
      db,
      data: {
        users: db.users.map(({ id, username, displayName }) => ({
          id,
          username,
          displayName,
        })),
      },
      persist: false,
    };
  }

  if (path === '/stages') {
    const stages = await Promise.all(
      filterStages(db.stages, params).map(async (item) => ({
        ...stripStageItem(item, db),
        videoUrl: item.videoAssetId ? await getVideoObjectUrl(item.videoAssetId) : item.videoUrl,
      })),
    );

    return {
      db,
      data: {
        stages,
      },
      persist: false,
    };
  }

  if (path === '/table-ct') {
    return {
      db,
      data: {
        rows: filterTableRows(db.tableRows, params).map(stripTableRow),
      },
      persist: false,
    };
  }

  if (path === '/history') {
    return {
      db,
      data: {
        items: filterHistory(db.history, params).map((item) => stripHistoryItem(item, db)),
      },
      persist: false,
    };
  }

  if (path === '/control-session') {
    const session = findControlSession(db.controlSessions, params);
    return {
      db,
      data: {
        session: session ? stripControlSession(session) : null,
      },
      persist: false,
    };
  }

  if (path === '/stage-categories') {
    return {
      db,
      data: {
        categories: [...db.stageCategories]
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map(stripStageCategory),
      },
      persist: false,
    };
  }

  if (path === '/machine-types') {
    const department = normalizeText(params.department);
    return {
      db,
      data: {
        machineTypes: department
          ? db.machineTypes.filter((item) => normalizeText(item.department) === department)
          : db.machineTypes,
      },
      persist: false,
    };
  }

  if (path === '/delete-logs') {
    return {
      db,
      data: {
        logs: filterDeleteLogs(db.deleteLogs, params),
      },
      persist: false,
    };
  }

  throw new Error(`Unknown offline route: ${path}`);
}

async function handlePost(db: OfflineDb, path: string, body: OfflineRequestBody) {
  if (path === '/auth/login') {
    const username = normalizeText(body.username);
    const password = String(body.password ?? '');
    const category = normalizeText(body.category);
    const user = db.users.find(
      (item) =>
        normalizeText(item.username) === username &&
        item.password === password &&
        normalizeText(item.category) === category,
    );

    if (!user) {
      throw new Error('Invalid username, password, or category.');
    }

    return {
      db,
      data: {
        accessToken: `${OFFLINE_TOKEN_PREFIX}${user.username}`,
        user: {
          username: user.username,
          displayName: user.displayName,
          category: user.category,
        },
      },
      persist: false,
    };
  }

  if (path === '/auth/register') {
    const username = normalizeText(body.username);
    const displayName = String(body.displayName ?? '').trim();
    const password = String(body.password ?? '');

    if (!username || !displayName || !password) {
      throw new Error('Username, display name, and password are required.');
    }

    if (db.users.some((item) => normalizeText(item.username) === username)) {
      throw new Error('Username already exists.');
    }

    const created: OfflineUser = {
      id: createId(),
      username,
      displayName,
      password,
      category: 'FF28',
    };

    db.users.unshift(created);

    return {
      db,
      data: {
        user: stripUser(created),
      },
      persist: true,
    };
  }

  if (path === '/stages') {
    const files = Array.isArray(body.files) ? body.files : [];
    if (files.length === 0) {
      throw new Error('At least one video file is required.');
    }

    const date = normalizeDate(String(body.date ?? ''));
    const season = validateTextOnlyField(body.season, 'Season', 100);
    const stageCode = String(body.stageCode ?? '').trim() || 'STAGE';
    const cutDie = validateTextOnlyField(body.cutDie, 'Cut Die', 100);
    const area = String(body.area ?? '').trim() as StageKey;
    const article = validateTextOnlyField(body.article, 'Article', 255);

    const createdStages = await Promise.all(
      files.map(async (file, index) => {
        const fallbackCode =
          files.length === 1 ? cutDie.toUpperCase() : `${cutDie.toUpperCase()}-${index + 1}`;
        const parsedIdentity = parseStageIdentity(file.name, fallbackCode);
        const uniqueName = ensureUniqueStageName(db.stages, {
          area,
          stageDate: date,
          name: parsedIdentity.name,
        });
        const videoAssetId = createId();

        const nextStage: OfflineStageItem = {
          id: createId(),
          code: parsedIdentity.code,
          name: uniqueName,
          processStage: stageCode,
          season,
          cutDie,
          area,
          article,
          duration: formatDuration(30 + index * 8),
          mood: index % 2 === 0 ? 'NVA' : 'VA',
          stage: area || 'CUTTING',
          stageDate: date,
          completed: false,
          videoAssetId,
          sortOrder: db.stages.length + index + 1,
        };

        await storeVideoAsset(videoAssetId, file);
        db.stages.push(nextStage);
        db.tableRows.push(
          buildDefaultTableRow({
            stage: nextStage.stage,
            stageItemId: nextStage.id,
            no: parsedIdentity.code,
            partName: uniqueName,
            sortOrder: db.tableRows.length + index + 1,
          }),
        );

        return nextStage;
      }),
    );

    return {
      db,
      data: {
        stages: createdStages.map((stage) => stripStageItem(stage, db)),
      },
      persist: true,
    };
  }

  if (path === '/stage-categories') {
    const value = String(body.value ?? '').trim();
    const label = String(body.label ?? '').trim();

    if (!value || !label) {
      throw new Error('Value and label are required.');
    }

    if (db.stageCategories.some((item) => normalizeText(item.value) === normalizeText(value))) {
      throw new Error('Category value already exists.');
    }

    const category: OfflineStageCategory = {
      id: createId(),
      value,
      label,
      sortOrder: db.stageCategories.length + 1,
    };

    db.stageCategories.push(category);
    return { db, data: { category: stripStageCategory(category) }, persist: true };
  }

  if (path === '/stages/duplicate') {
    const sourceId = String(body.sourceId ?? '').trim();
    const targetArea = String(body.targetArea ?? '').trim() as StageKey;
    const source = db.stages.find((item) => item.id === sourceId);
    if (!source) {
      throw new Error('Source stage not found.');
    }

    const relatedCopies = db.stages.filter((item) =>
      normalizeText(item.code).startsWith(normalizeText(source.code)),
    ).length;
    const code = `${source.code}-COPY${relatedCopies + 1}`;
    const duplicateName = `${source.name} Copy`;
    const nextStage: OfflineStageItem = {
      ...source,
      id: createId(),
      code,
      name: duplicateName,
      stage: source.stage,
      area: targetArea || source.area,
      stageDate: source.stageDate || formatDate(new Date()),
      videoAssetId: source.videoAssetId ?? null,
      sortOrder: db.stages.length + 1,
      completed: false,
    };

    if (source.videoAssetId) {
      const duplicatedAssetId = createId();
      const duplicated = await cloneVideoAsset(source.videoAssetId, duplicatedAssetId);
      nextStage.videoAssetId = duplicated ? duplicatedAssetId : source.videoAssetId;
    }

    db.stages.push(nextStage);

    const sourceRows = db.tableRows.filter(
      (row) =>
        row.confirmed &&
        (row.stageItemId === source.id ||
          (!row.stageItemId &&
            normalizeText(row.no) === normalizeText(source.code) &&
            normalizeText(row.stage) === normalizeText(source.area ?? source.stage))),
    );
    const rowsToClone = sourceRows;

    rowsToClone.forEach((row, index) => {
      db.tableRows.push({
        ...row,
        id: createId(),
        stageItemId: nextStage.id,
        stage: targetArea,
        no: nextStage.code,
        partName: duplicateName,
        confirmed: row.confirmed,
        done: row.done,
        sortOrder: index + 1,
        nvaValues: [...row.nvaValues],
        vaValues: [...row.vaValues],
      });
    });

    db.history
      .filter(
        (entry) =>
          entry.stageItemId === source.id ||
          (!entry.stageItemId && normalizeText(entry.stageCode) === normalizeText(source.code)),
      )
      .forEach((entry) => {
        db.history.unshift({
          ...entry,
          id: createId(),
          stageItemId: nextStage.id,
          stageCode: nextStage.code,
          committed: entry.committed,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      });

    return { db, data: { stage: stripStageItem(nextStage, db) } };
  }

  if (path === '/table-ct/export' || path === '/table-ct/export-lsa') {
    return { db, data: await buildWorkbookBlob(path, db, body) };
  }

  if (path === '/history') {
    const entry: OfflineHistoryEntry = {
      id: createId(),
      stageItemId: normalizeNullableId(body.stageItemId),
      stageCode: String(body.stageCode ?? '').trim(),
      startTime: Number(body.startTime ?? 0),
      endTime: Number(body.endTime ?? 0),
      type: String(body.type ?? 'NVA').toUpperCase() as 'NVA' | 'VA' | 'SKIP',
      value: Number(body.value ?? 0),
      committed: false,
      locked: false,
      range: formatRange(Number(body.startTime ?? 0), Number(body.endTime ?? 0)),
      label: `${String(body.type ?? 'NVA').toUpperCase()}: ${Number(body.value ?? 0).toFixed(1)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.history.unshift(entry);
    return { db, data: { item: stripHistoryItem(entry, db) } };
  }

  throw new Error(`Unknown offline route: ${path}`);
}


async function handlePut(db: OfflineDb, path: string, body: OfflineRequestBody) {
  if (path === '/control-session') {
    const stageCode = String(body.stageCode ?? '').trim();
    if (!stageCode) {
      throw new Error('stageCode is required.');
    }

    const stageItemId = normalizeNullableId(body.stageItemId);
    const now = new Date().toISOString();
    const current = findControlSession(db.controlSessions, { stageCode, stageItemId });
    const session: OfflineControlSession = {
      id: current?.id ?? createId(),
      stageItemId,
      stageCode,
      elapsed: Number(body.elapsed ?? 0),
      isRunning: Boolean(body.isRunning),
      segmentStart: Number(body.segmentStart ?? 0),
      nva: normalizeNullableNumber(body.nva),
      va: normalizeNullableNumber(body.va),
      skip: normalizeNullableNumber(body.skip),
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };

    if (current) {
      Object.assign(current, session);
    } else {
      db.controlSessions.unshift(session);
    }

    return { db, data: { session: stripControlSession(session) } };
  }

  throw new Error(`Unknown offline route: ${path}`);
}

async function handlePatch(db: OfflineDb, path: string, body: OfflineRequestBody) {
  if (path === '/stages/reorder') {
    const stage = String(body.stage ?? '').trim() as StageKey;
    const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds.map(String) : [];
    // Assign returned new array (immutable reorder)
    db.stages = reorderStageItems(db.stages, orderedIds, stage);
    return { db, data: { ok: true } };
  }

  if (path === '/table-ct/reorder') {
    const stage = String(body.stage ?? '').trim() as StageKey;
    const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds.map(String) : [];
    // Assign returned new array (immutable reorder)
    db.tableRows = reorderTableRows(db.tableRows, orderedIds, stage);
    return { db, data: { ok: true } };
  }

  if (path === '/table-ct/confirm') {
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const confirmed = typeof body.confirmed === 'boolean' ? body.confirmed : true;
    const idSet = new Set(ids);
    db.tableRows = db.tableRows.map((row) =>
      idSet.has(row.id)
        ? {
            ...row,
            confirmed,
            nvaValues: [...row.nvaValues],
            vaValues: [...row.vaValues],
          }
        : row,
    );
    const rows = db.tableRows.filter((row) => idSet.has(row.id)).map(stripTableRow);
    return { db, data: { rows } };
  }

  if (path === '/history/commit') {
    const stageCode = String(body.stageCode ?? '').trim();
    const stageItemId = normalizeNullableId(body.stageItemId);
    const now = new Date().toISOString();

    const commitIdSet = new Set(
      db.history
        .filter(
          (entry) =>
            (!stageCode || normalizeText(entry.stageCode) === normalizeText(stageCode)) &&
            (!stageItemId || entry.stageItemId === stageItemId) &&
            !entry.committed,
        )
        .map((entry) => entry.id),
    );

    db.history = db.history.map((entry) =>
      commitIdSet.has(entry.id)
        ? { ...entry, committed: true, updatedAt: now }
        : entry,
    );

    const items = db.history.filter((entry) => commitIdSet.has(entry.id));
    return { db, data: { items: items.map((item) => stripHistoryItem(item, db)) } };
  }

  const stageCategoryMatch = path.match(/^\/stage-categories\/([^/]+)$/);
  if (stageCategoryMatch) {
    const catIdx = db.stageCategories.findIndex((item) => item.id === stageCategoryMatch[1]);
    if (catIdx === -1) {
      throw new Error('Category not found.');
    }

    const category = db.stageCategories[catIdx];
    const updatedCategory: OfflineStageCategory = {
      ...category,
      value: typeof body.value === 'string' ? body.value.trim() : category.value,
      label: typeof body.label === 'string' ? body.label.trim() : category.label,
    };
    const newCategories = [...db.stageCategories];
    newCategories[catIdx] = updatedCategory;
    db.stageCategories = newCategories;

    return { db, data: { category: stripStageCategory(updatedCategory) } };
  }

  const tableRowMatch = path.match(/^\/table-ct\/([^/]+)$/);
  if (tableRowMatch) {
    const rowIndex = db.tableRows.findIndex((item) => item.id === tableRowMatch[1]);
    const row = rowIndex >= 0 ? db.tableRows[rowIndex] : null;
    if (!row) {
      throw new Error('Table row not found.');
    }

    const nextRow: OfflineTableRow = {
      ...row,
      nvaValues: [...row.nvaValues],
      vaValues: [...row.vaValues],
    };

    if (typeof body.machineType === 'string') {
      nextRow.machineType = body.machineType || 'Select..';
    }

    if (typeof body.confirmed === 'boolean') {
      nextRow.confirmed = body.confirmed;
    }

    db.tableRows = db.tableRows.map((item) => (item.id === nextRow.id ? nextRow : item));

    return { db, data: { row: stripTableRow(nextRow) } };
  }

  const metricsMatch = path.match(/^\/table-ct\/([^/]+)\/metrics$/);
  if (metricsMatch) {
    const rowIndex = db.tableRows.findIndex((item) => item.id === metricsMatch[1]);
    const row = rowIndex >= 0 ? db.tableRows[rowIndex] : null;
    if (!row) {
      throw new Error('Table row not found.');
    }

    const columnIndex = Number(body.columnIndex ?? -1);
    if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex > 9) {
      throw new Error('columnIndex must be between 0 and 9.');
    }

    const nvaValue = normalizeNullableNumber(body.nvaValue);
    const vaValue = normalizeNullableNumber(body.vaValue);

    // Build new nvaValues/vaValues arrays immutably (row.nvaValues may be frozen by Immer)
    const nvaValues = [...row.nvaValues];
    const vaValues = [...row.vaValues];
    if (nvaValue !== null) nvaValues[columnIndex] = nvaValue;
    if (vaValue !== null) vaValues[columnIndex] = vaValue;

    const nextRow: OfflineTableRow = { ...row, nvaValues, vaValues };

    db.tableRows = db.tableRows.map((item) => (item.id === nextRow.id ? nextRow : item));

    return { db, data: { row: stripTableRow(nextRow) } };
  }


  const doneMatch = path.match(/^\/table-ct\/([^/]+)\/done$/);
  if (doneMatch) {
    const rowIndex = db.tableRows.findIndex((item) => item.id === doneMatch[1]);
    const row = rowIndex >= 0 ? db.tableRows[rowIndex] : null;
    if (!row) {
      throw new Error('Table row not found.');
    }

    const nextRow: OfflineTableRow = {
      ...row,
      done: !row.done,
      nvaValues: [...row.nvaValues],
      vaValues: [...row.vaValues],
    };

    db.tableRows = db.tableRows.map((item) => (item.id === nextRow.id ? nextRow : item));

    return { db, data: { row: stripTableRow(nextRow) } };
  }

  throw new Error(`Unknown offline route: ${path}`);
}

async function handleDelete(db: OfflineDb, path: string) {
  const stageMatch = path.match(/^\/stages\/([^/]+)$/);
  if (stageMatch) {
    const index = db.stages.findIndex((item) => item.id === stageMatch[1]);
    if (index === -1) throw new Error('Stage not found.');
    const [removed] = db.stages.splice(index, 1);
    db.tableRows = db.tableRows.filter((row) => row.stageItemId !== removed.id && row.no !== removed.code);
    db.history = db.history.filter((item) => item.stageItemId !== removed.id && item.stageCode !== removed.code);
    db.controlSessions = db.controlSessions.filter(
      (session) => session.stageItemId !== removed.id && session.stageCode !== removed.code,
    );
    addDeleteLog(db, 'StageList', removed.id, `${removed.code}. ${removed.name}`);
    if (
      removed.videoAssetId &&
      !db.stages.some((stage) => stage.videoAssetId === removed.videoAssetId)
    ) {
      await deleteVideoAsset(removed.videoAssetId);
      const objectUrl = objectUrlCache.get(removed.videoAssetId);
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrlCache.delete(removed.videoAssetId);
      }
    }
    return { db, data: { ok: true } };
  }

  const historyMatch = path.match(/^\/history\/([^/]+)$/);
  if (historyMatch) {
    const index = db.history.findIndex((item) => item.id === historyMatch[1]);
    if (index === -1) throw new Error('History item not found.');
    const [removed] = db.history.splice(index, 1);
    addDeleteLog(db, 'HistoryEntry', removed.id, `${removed.type}: ${removed.value.toFixed(1)}`);
    return { db, data: { ok: true } };
  }

  const rowMatch = path.match(/^\/table-ct\/([^/]+)$/);
  if (rowMatch) {
    const index = db.tableRows.findIndex((item) => item.id === rowMatch[1]);
    if (index === -1) throw new Error('Table row not found.');
    const [removed] = db.tableRows.splice(index, 1);
    addDeleteLog(db, 'TableCT', removed.id, `${removed.no}. ${removed.partName}`);
    return { db, data: { ok: true } };
  }

  const userMatch = path.match(/^\/auth\/users\/([^/]+)$/);
  if (userMatch) {
    const index = db.users.findIndex((item) => item.id === userMatch[1]);
    if (index === -1) throw new Error('User not found.');
    const [removed] = db.users.splice(index, 1);
    addDeleteLog(db, 'User', removed.id, removed.displayName);
    return { db, data: { ok: true } };
  }

  const categoryMatch = path.match(/^\/stage-categories\/([^/]+)$/);
  if (categoryMatch) {
    const index = db.stageCategories.findIndex((item) => item.id === categoryMatch[1]);
    if (index === -1) throw new Error('Category not found.');
    const [removed] = db.stageCategories.splice(index, 1);
    addDeleteLog(db, 'StageCategory', removed.id, removed.label);
    return { db, data: { ok: true } };
  }

  throw new Error(`Unknown offline route: ${path}`);
}

function addDeleteLog(
  db: OfflineDb,
  entityType: string,
  entityId: string,
  entityLabel: string,
) {
  db.deleteLogs.unshift({
    id: createId(),
    entityType,
    entityId,
    entityLabel,
    actorUserId: null,
    actorUsername: getStoredSessionUser().username,
    metadata: null,
    createdAt: new Date().toISOString(),
  });
}



function filterStages(stages: OfflineStageItem[], params: Record<string, unknown>) {
  const dateFrom = normalizeDateValue(params.dateFrom);
  const dateTo = normalizeDateValue(params.dateTo);
  const season = normalizeText(params.season);
  const stage = normalizeText(params.stage);
  const area = normalizeText(params.area);
  const article = normalizeText(params.article);
  const cutDie = normalizeText(params.cutDie);

  return stages
    .filter((item) => {
      if (season && !normalizeText(item.season).includes(season)) return false;
      if (stage && !normalizeText(item.processStage ?? item.code).includes(stage)) return false;
      if (area && !normalizeText(item.area ?? item.stage).includes(area)) return false;
      if (article && !normalizeText(item.article ?? item.name).includes(article)) return false;
      if (cutDie && !normalizeText(item.cutDie).includes(cutDie)) return false;
      if (dateFrom && item.stageDate && item.stageDate < dateFrom) return false;
      if (dateTo && item.stageDate && item.stageDate > dateTo) return false;
      return true;
    })
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

function filterTableRows(rows: OfflineTableRow[], params: Record<string, unknown>) {
  const stage = normalizeText(params.stage);
  const stageCode = normalizeText(params.stageCode);
  const stageItemId = normalizeNullableId(params.stageItemId);

  return rows.filter((row) => {
    if (stage && normalizeText(row.stage) !== stage) return false;
    if (stageCode && normalizeText(row.no) !== stageCode) return false;
    if (stageItemId && row.stageItemId !== stageItemId) return false;
    return true;
  });
}

function filterHistory(history: OfflineHistoryEntry[], params: Record<string, unknown>) {
  const stageCode = normalizeText(params.stageCode);
  const stageItemId = normalizeNullableId(params.stageItemId);

  return history.filter((item) => {
    if (stageCode && normalizeText(item.stageCode) !== stageCode) return false;
    if (stageItemId && item.stageItemId !== stageItemId) return false;
    return true;
  });
}

function filterDeleteLogs(logs: DeleteLogItem[], params: Record<string, unknown>) {
  const entityType = normalizeText(params.entityType);
  const username = normalizeText(params.username);
  const search = normalizeText(params.search);

  return logs.filter((log) => {
    if (entityType && normalizeText(log.entityType) !== entityType) return false;
    if (username && normalizeText(log.actorUsername) !== username) return false;
    if (search) {
      const haystack = [
        log.entityType,
        log.entityLabel,
        log.entityId,
        log.actorUsername ?? '',
        JSON.stringify(log.metadata ?? {}),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function findControlSession(
  sessions: OfflineControlSession[],
  params: Record<string, unknown>,
) {
  const stageCode = normalizeText(params.stageCode);
  const stageItemId = normalizeNullableId(params.stageItemId);

  return (
    sessions.find((session) => {
      if (stageCode && normalizeText(session.stageCode) !== stageCode) return false;
      if (stageItemId && session.stageItemId !== stageItemId) return false;
      return true;
    }) ?? null
  );
}

// Returns a NEW array – immutable to avoid mutating potentially-frozen arrays from Redux/Immer
function reorderStageItems(
  items: OfflineStageItem[],
  orderedIds: string[],
  stage: StageKey,
): OfflineStageItem[] {
  const scoped = items.filter((item) => item.stage === stage);
  const map = new Map(scoped.map((item) => [item.id, item]));
  const reordered = orderedIds.map((id) => map.get(id)).filter(Boolean) as OfflineStageItem[];
  const remainder = scoped.filter((item) => !orderedIds.includes(item.id));
  const next = [...reordered, ...remainder];
  let stageIndex = 0;
  return items.map((item) => {
    if (item.stage !== stage) return item;
    const updated = { ...next[stageIndex], sortOrder: stageIndex + 1 };
    stageIndex += 1;
    return updated;
  });
}

// Returns a NEW array – immutable to avoid mutating potentially-frozen arrays from Redux/Immer
function reorderTableRows(
  rows: OfflineTableRow[],
  orderedIds: string[],
  stage: StageKey,
): OfflineTableRow[] {
  const scoped = rows.filter((row) => row.stage === stage);
  const map = new Map(scoped.map((row) => [row.id, row]));
  const reordered = orderedIds.map((id) => map.get(id)).filter(Boolean) as OfflineTableRow[];
  const remainder = scoped.filter((row) => !orderedIds.includes(row.id));
  const next = [...reordered, ...remainder];
  let stageIndex = 0;
  return rows.map((row) => {
    if (row.stage !== stage) return row;
    const updated = { ...next[stageIndex], sortOrder: stageIndex + 1 };
    stageIndex += 1;
    return updated;
  });
}

function stripStageItem(item: OfflineStageItem, db?: OfflineDb): StageItem {

  return {
    id: item.id,
    code: item.code,
    name: item.name,
    processStage: item.processStage,
    season: item.season,
    cutDie: item.cutDie,
    area: item.area,
    article: item.article,
    duration: item.duration,
    mood: item.mood,
    stage: item.stage,
    stageDate: item.stageDate,
    completed: db ? isStageCompleted(db, item) : item.completed,
    videoUrl: item.videoUrl,
  };
}

function cloneDbForMutation(db: OfflineDb): OfflineDb {
  return {
    users: db.users.map((item) => ({ ...item })),
    stageCategories: db.stageCategories.map((item) => ({ ...item })),
    stages: db.stages.map((item) => ({ ...item })),
    tableRows: db.tableRows.map((row) => ({
      ...row,
      nvaValues: [...row.nvaValues],
      vaValues: [...row.vaValues],
    })),
    history: db.history.map((item) => ({ ...item })),
    controlSessions: db.controlSessions.map((item) => ({ ...item })),
    deleteLogs: db.deleteLogs.map((item) => ({ ...item })),
    machineTypes: db.machineTypes.map((item) => ({ ...item })),
  };
}

function removeDefaultDemoData(db: OfflineDb): OfflineDb {
  const demoStageIds = new Set(
    db.stages
      .filter((stage) => DEFAULT_DEMO_STAGE_IDS.has(stage.id))
      .map((stage) => stage.id),
  );
  const demoStageCodes = new Set(
    db.stages
      .filter((stage) => demoStageIds.has(stage.id))
      .map((stage) => normalizeText(stage.code)),
  );

  return {
    ...db,
    stages: db.stages.filter((stage) => !demoStageIds.has(stage.id)),
    tableRows: db.tableRows.filter(
      (row) =>
        !DEFAULT_DEMO_ROW_IDS.has(row.id) &&
        !demoStageIds.has(row.stageItemId ?? '') &&
        !demoStageCodes.has(normalizeText(row.no)),
    ),
    history: db.history.filter(
      (item) =>
        !DEFAULT_DEMO_HISTORY_IDS.has(item.id) &&
        !demoStageIds.has(item.stageItemId ?? '') &&
        !demoStageCodes.has(normalizeText(item.stageCode)),
    ),
    controlSessions: db.controlSessions.filter(
      (session) =>
        !demoStageIds.has(session.stageItemId ?? '') &&
        !demoStageCodes.has(normalizeText(session.stageCode)),
    ),
  };
}

function stripTableRow(row: OfflineTableRow): CtRow {
  return {
    id: row.id,
    stageItemId: row.stageItemId,
    no: row.no,
    partName: row.partName,
    nvaValues: [...row.nvaValues],
    vaValues: [...row.vaValues],
    machineType: row.machineType,
    confirmed: row.confirmed,
    done: row.done,
  };
}

function stripHistoryItem(item: OfflineHistoryEntry, db?: OfflineDb): HistoryItem {
  return {
    id: item.id,
    startTime: item.startTime,
    endTime: item.endTime,
    range: item.range,
    label: item.label,
    committed: item.committed,
    locked: db ? isHistoryLocked(db, item) : item.locked,
  };
}

function stripControlSession(item: OfflineControlSession): ControlSessionItem {
  return {
    id: item.id,
    stageItemId: item.stageItemId,
    stageCode: item.stageCode,
    elapsed: item.elapsed,
    isRunning: item.isRunning,
    segmentStart: item.segmentStart,
    nva: item.nva,
    va: item.va,
    skip: item.skip,
  };
}

function stripStageCategory(item: OfflineStageCategory): StageCategory {
  return {
    id: item.id,
    value: item.value,
    label: item.label,
  };
}

function dedupeStageTabs(tabs: StageKey[]) {
  const seen = new Set<string>();
  const next: StageKey[] = [];

  tabs.forEach((tab) => {
    const normalized = normalizeStageTabValue(tab);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    next.push(normalized as StageKey);
  });

  return next;
}

function normalizeStageTabValue(value: unknown) {
  return String(value ?? '').trim().toUpperCase();
}

function stripUser(user: OfflineUser): AuthUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
  };
}

function createId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `offline-${Math.random().toString(36).slice(2, 10)}`;
}

function getStageMergeKey(stage: Pick<OfflineStageItem, 'stage' | 'code'>) {
  return `${normalizeText(stage.stage)}::${normalizeText(stage.code)}`;
}

function normalizeNullableId(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeNullableNumber(value: unknown) {
  if (value === null || typeof value === 'undefined' || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStageIdentity(rawName: string, fallbackCode: string) {
  const withoutExtension = stripFileExtension(rawName).trim();
  const normalizedFallbackCode = fallbackCode.trim().toUpperCase() || 'NEW';
  const matched = withoutExtension.match(/^([^.]+)\.\s*(.+)$/);

  if (!matched) {
    return {
      code: normalizedFallbackCode,
      name: withoutExtension || normalizedFallbackCode,
    };
  }

  return {
    code: matched[1].trim().toUpperCase() || normalizedFallbackCode,
    name: matched[2].trim() || withoutExtension || normalizedFallbackCode,
  };
}

function normalizeDate(value: string) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return formatDate(parsed);
}

function normalizeDateValue(value: unknown) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? trimmed : formatDate(parsed);
}

function ensureUniqueStageName(
  stages: OfflineStageItem[],
  payload: {
    area: StageKey;
    stageDate: string;
    name: string;
  },
) {
  const hasName = (name: string) =>
    stages.some(
      (stage) =>
        normalizeText(stage.area ?? stage.stage) === normalizeText(payload.area) &&
        normalizeText(stage.stageDate) === normalizeText(payload.stageDate) &&
        normalizeText(stage.name) === normalizeText(name),
    );

  if (!hasName(payload.name)) {
    return payload.name;
  }

  let suffix = 1;
  let nextName = `${payload.name} (${suffix})`;
  while (hasName(nextName)) {
    suffix += 1;
    nextName = `${payload.name} (${suffix})`;
  }

  return nextName;
}

function getStageIdentityKey(stage: Pick<OfflineStageItem, 'id' | 'stage' | 'area' | 'code'>) {
  return `${normalizeText(stage.area ?? stage.stage)}::${normalizeText(stage.code)}`;
}

function isStageCompleted(db: OfflineDb, stage: OfflineStageItem) {
  const identityKey = getStageIdentityKey(stage);
  const rows = db.tableRows.filter(
    (row) =>
      row.stageItemId === stage.id ||
      (!row.stageItemId &&
        `${normalizeText(row.stage)}::${normalizeText(row.no)}` === identityKey),
  );

  return rows.length > 0 && rows.every((row) => row.confirmed);
}

function isHistoryLocked(db: OfflineDb, item: OfflineHistoryEntry) {
  return db.tableRows.some((row) => {
    if (!row.confirmed) {
      return false;
    }

    if (item.stageItemId && row.stageItemId === item.stageItemId) {
      return true;
    }

    return normalizeText(row.no) === normalizeText(item.stageCode);
  });
}

function buildDefaultTableRow({
  stage,
  stageItemId,
  no,
  partName,
  sortOrder,
}: {
  stage: StageKey;
  stageItemId: string | null;
  no: string;
  partName: string;
  sortOrder: number;
}): OfflineTableRow {
  return {
    id: createId(),
    stageItemId,
    no,
    partName,
    stage,
    nvaValues: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    vaValues: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    machineType: 'Select..',
    confirmed: false,
    done: false,
    sortOrder,
  };
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function sumValues(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

function openAssetDb() {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open(ASSET_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ASSET_STORE_NAME)) {
        db.createObjectStore(ASSET_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open asset store.'));
  });
}

async function storeVideoAsset(assetId: string, file: File) {
  const db = await openAssetDb();
  if (!db) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE_NAME, 'readwrite');
    tx.objectStore(ASSET_STORE_NAME).put(file, assetId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Unable to store video asset.'));
  });
}

async function cloneVideoAsset(sourceAssetId: string, targetAssetId: string) {
  const source = await readVideoAsset(sourceAssetId);
  if (!source) {
    return false;
  }

  const sourceFile =
    typeof File !== 'undefined' && source instanceof File
      ? source
      : new File([source], `${targetAssetId}.mp4`, {
          type: source.type || 'video/mp4',
        });
  const cloned = new File([sourceFile], sourceFile.name || `${targetAssetId}.mp4`, {
    type: sourceFile.type || 'video/mp4',
    lastModified: sourceFile.lastModified,
  });

  await storeVideoAsset(targetAssetId, cloned);
  return true;
}

async function deleteVideoAsset(assetId: string) {
  const db = await openAssetDb();
  if (!db) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE_NAME, 'readwrite');
    tx.objectStore(ASSET_STORE_NAME).delete(assetId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Unable to delete video asset.'));
  });
}

async function readVideoAsset(assetId: string) {
  const db = await openAssetDb();
  if (!db) {
    return null;
  }

  return new Promise<File | Blob | null>((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE_NAME, 'readonly');
    const request = tx.objectStore(ASSET_STORE_NAME).get(assetId);

    request.onsuccess = () => {
      const value = request.result as File | Blob | undefined;
      if (!value) {
        resolve(null);
        return;
      }

      if (typeof File !== 'undefined' && value instanceof File) {
        resolve(value);
        return;
      }

      if (typeof Blob !== 'undefined' && value instanceof Blob) {
        resolve(new File([value], `${assetId}.mp4`, { type: value.type || 'video/mp4' }));
        return;
      }

      resolve(null);
    };

    request.onerror = () => reject(request.error ?? new Error('Unable to read video asset.'));
  });
}

async function getVideoObjectUrl(assetId: string) {
  const cached = objectUrlCache.get(assetId);
  if (cached) {
    return cached;
  }

  const db = await openAssetDb();
  if (!db) {
    return undefined;
  }

  const file = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE_NAME, 'readonly');
    const request = tx.objectStore(ASSET_STORE_NAME).get(assetId);
    request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Unable to read video asset.'));
  });

  if (!file) {
    return undefined;
  }

  const url = URL.createObjectURL(file);
  objectUrlCache.set(assetId, url);
  return url;
}

async function buildWorkbookBlob(
  path: string,
  db: OfflineDb,
  body: OfflineRequestBody,
) {
  const workbook = new ExcelJS.Workbook();
  const rowIds = Array.isArray(body.rowIds) ? body.rowIds.map(String) : [];
  const rows = rowIds.length > 0 ? db.tableRows.filter((row) => rowIds.includes(row.id)) : db.tableRows;

  if (path === '/table-ct/export-lsa') {
    const sheet = workbook.addWorksheet('LSA Summary');
    sheet.addRow(['Stage', 'Stage Item', 'Row', 'Part Name', 'Machine Type', 'Confirmed', 'Done', 'NVA Total', 'VA Total']);
    rows.forEach((row) => {
      sheet.addRow([
        String(body.stage ?? 'ALL'),
        String(body.stageItemId ?? 'ALL'),
        row.no,
        row.partName,
        row.machineType,
        row.confirmed ? 'Yes' : 'No',
        row.done ? 'Yes' : 'No',
        sumValues(row.nvaValues).toFixed(2),
        sumValues(row.vaValues).toFixed(2),
      ]);
    });
    return buildExcelBlob(await workbook.xlsx.writeBuffer());
  }

  const sheet = workbook.addWorksheet('TableCT');
  sheet.addRow(['Stage', 'Stage Item', 'No', 'Part Name', 'Machine Type', 'Confirmed', 'Done']);
  rows.forEach((row) => {
    sheet.addRow([
      String(body.stage ?? 'ALL'),
      String(body.stageItemId ?? 'ALL'),
      row.no,
      row.partName,
      row.machineType,
      row.confirmed ? 'Yes' : 'No',
      row.done ? 'Yes' : 'No',
    ]);
  });
  return buildExcelBlob(await workbook.xlsx.writeBuffer());
}

function buildExcelBlob(buffer: ExcelJS.Buffer) {
  if (typeof Blob === 'undefined') {
    return buffer;
  }

  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
