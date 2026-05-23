import { AxiosError, type AxiosRequestConfig } from 'axios';

import { apiClient } from '@/lib/api-client';
import {
  createOfflineStages,
  getOfflineStages,
  isOfflineNetworkError,
  setBackendReachable,
  shouldUseOfflineData,
} from '@/lib/offline-api';
import type { StageFilters, StageItem, StageKey } from '@/types/dashboard';

type FetchOptions = {
  forceOnline?: boolean;
};

type ForceOnlineRequestConfig = AxiosRequestConfig & {
  params?: Record<string, string> | undefined;
  _forceOnline?: boolean;
};

const FILE_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api'
).replace(/\/api$/, '');

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AxiosError) {
    if (error.code === 'ERR_CANCELED') {
      return 'Upload canceled.';
    }

    return (
      (typeof error.response?.data?.message === 'string' && error.response.data.message) ||
      (error.code === 'ECONNABORTED' ? 'Request timed out.' : error.message) ||
      fallback
    );
  }

  return error instanceof Error ? error.message : fallback;
}

function mapStageItem(item: StageItem): StageItem {
  return {
    ...item,
    videoUrl: item.videoUrl
      ? item.videoUrl.startsWith('http')
        ? item.videoUrl
        : `${FILE_BASE_URL}${item.videoUrl}`
      : undefined,
  };
}

export async function fetchStages(
  filters?: Partial<StageFilters>,
  options?: FetchOptions,
) {
  if (!options?.forceOnline && shouldUseOfflineData()) {
    return getOfflineStages({
      dateFrom: filters?.dateFrom,
      dateTo: filters?.dateTo,
      season: filters?.season,
      stage: filters?.stage,
      area: filters?.area,
      article: filters?.article,
      cutDie: filters?.cutDie,
      confirmedTableCtOnly: filters?.confirmedTableCtOnly,
    });
  }

  try {
    const params = Object.fromEntries(
      Object.entries(filters ?? {}).filter(([, value]) => {
        if (typeof value !== 'string') {
          return false;
        }

        const normalized = value.trim();
        return normalized !== '' && normalized.toUpperCase() !== 'CHOOSE OPTION';
      }),
    );

    const requestConfig: ForceOnlineRequestConfig = {
      params: Object.keys(params).length > 0 ? params : undefined,
      _forceOnline: options?.forceOnline,
    };
    const { data } = await apiClient.get<{ stages?: StageItem[] }>(
      '/stages',
      requestConfig,
    );
    return (data.stages ?? []).map(mapStageItem);
  } catch (error) {
    if (!options?.forceOnline && (shouldUseOfflineData() || isOfflineNetworkError(error))) {
      setBackendReachable(false);
      return getOfflineStages({
        dateFrom: filters?.dateFrom,
        dateTo: filters?.dateTo,
        season: filters?.season,
        stage: filters?.stage,
        area: filters?.area,
        article: filters?.article,
        cutDie: filters?.cutDie,
        confirmedTableCtOnly: filters?.confirmedTableCtOnly,
      });
    }

    throw new Error(getErrorMessage(error, 'Unable to load stage items.'));
  }
}

export async function createStages(payload: {
  date: string;
  season: string;
  stageCode: string;
  cutDie: string;
  area: StageKey;
  article: string;
  files: File[];
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}) {
  const formData = new FormData();
  formData.append('date', payload.date);
  formData.append('season', payload.season);
  formData.append('stageCode', payload.stageCode);
  formData.append('cutDie', payload.cutDie);
  formData.append('area', payload.area);
  formData.append('article', payload.article);
  payload.files.forEach((file) => {
    formData.append('files', file);
  });

  // File upload xử lý riêng khi offline:
  // Dùng createOfflineStages thay vì để dynamic adapter xử lý FormData
  // (tránh vấn đề FormData parsing qua offlineAdapter khi offline).
  if (shouldUseOfflineData()) {
    return createOfflineStages({
      date: payload.date,
      season: payload.season,
      stageCode: payload.stageCode,
      cutDie: payload.cutDie,
      area: payload.area,
      article: payload.article,
      files: payload.files,
    });
  }

  // Online: apiClient dùng dynamic adapter (xem api-client.ts).
  // Dynamic adapter tự route sang offlineAdapter nếu browser offline tại thời điểm request.
  // Với file upload, nếu mạng ngắt giữa chừng → safety net bên dưới.
  try {
    // KHÔNG set Content-Type thủ công — để axios/browser tự thêm boundary.
    const { data } = await apiClient.post<{ stages?: StageItem[] }>('/stages', formData, {
      timeout: 0,
      signal: payload.signal,
      onUploadProgress: (progressEvent) => {
        if (!payload.onProgress || !progressEvent.total) {
          return;
        }

        const percent = Math.min(
          100,
          Math.max(0, Math.round((progressEvent.loaded * 100) / progressEvent.total)),
        );
        payload.onProgress(percent);
      },
    });
    return (data.stages ?? []).map(mapStageItem);
  } catch (error) {
    // Safety net: mất mạng giữa chừng → fallback offline.
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      return createOfflineStages({
        date: payload.date,
        season: payload.season,
        stageCode: payload.stageCode,
        cutDie: payload.cutDie,
        area: payload.area,
        article: payload.article,
        files: payload.files,
      });
    }

    throw new Error(getErrorMessage(error, 'Unable to create stage items.'));
  }
}

export async function deleteStage(id: string) {
  try {
    await apiClient.delete(`/stages/${id}`);
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      await apiClient.delete(`/stages/${id}`);
      return;
    }

    throw new Error(getErrorMessage(error, 'Unable to delete stage item.'));
  }
}

export async function reorderStages(payload: { stage: StageKey; orderedIds: string[] }) {
  try {
    await apiClient.patch('/stages/reorder', payload);
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      await apiClient.patch('/stages/reorder', payload);
      return;
    }

    throw new Error(getErrorMessage(error, 'Unable to save stage order.'));
  }
}

export async function duplicateStage(payload: {
  sourceId: string;
  targetArea: StageKey;
}) {
  try {
    const { data } = await apiClient.post<{ stage: StageItem }>('/stages/duplicate', payload);
    return mapStageItem(data.stage);
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      const { data } = await apiClient.post<{ stage: StageItem }>('/stages/duplicate', payload);
      return mapStageItem(data.stage);
    }

    throw new Error(getErrorMessage(error, 'Unable to duplicate stage item.'));
  }
}
