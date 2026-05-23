import { AxiosError, type AxiosRequestConfig } from 'axios';

import { apiClient } from '@/lib/api-client';
import {
  getOfflineHistoryItems,
  isOfflineNetworkError,
  setBackendReachable,
  shouldUseOfflineData,
} from '@/lib/offline-api';
import type { HistoryItem } from '@/types/dashboard';

type FetchOptions = {
  forceOnline?: boolean;
};

type ForceOnlineRequestConfig = AxiosRequestConfig & {
  params?: {
    stageItemId?: string;
    stageCode?: string;
  };
  _forceOnline?: boolean;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AxiosError) {
    return (
      (typeof error.response?.data?.message === 'string' && error.response.data.message) ||
      (error.code === 'ECONNABORTED' ? 'Request timed out.' : error.message) ||
      fallback
    );
  }

  return error instanceof Error ? error.message : fallback;
}

export async function fetchHistory(
  filters?: { stageItemId?: string; stageCode?: string },
  options?: FetchOptions,
) {
  if (!options?.forceOnline && shouldUseOfflineData()) {
    return getOfflineHistoryItems(filters);
  }

  try {
    const requestConfig: ForceOnlineRequestConfig = {
      params:
        filters?.stageItemId || filters?.stageCode
          ? {
              ...(filters.stageItemId ? { stageItemId: filters.stageItemId } : {}),
              ...(filters.stageCode ? { stageCode: filters.stageCode } : {}),
            }
          : undefined,
      _forceOnline: options?.forceOnline,
    };
    const { data } = await apiClient.get<{ items?: HistoryItem[] }>(
      '/history',
      requestConfig,
    );

    return data.items ?? [];
  } catch (error) {
    if (!options?.forceOnline && (shouldUseOfflineData() || isOfflineNetworkError(error))) {
      setBackendReachable(false);
      return getOfflineHistoryItems(filters);
    }

    throw new Error(getErrorMessage(error, 'Unable to load history items.'));
  }
}

export async function createHistory(payload: {
  stageItemId?: string;
  stageCode: string;
  ctColumn?: string;
  startTime: number;
  endTime: number;
  type: 'NVA' | 'VA' | 'SKIP';
  value: number;
}) {
  try {
    const { data } = await apiClient.post<{ item: HistoryItem }>('/history', payload);
    return data.item;
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      const { data } = await apiClient.post<{ item: HistoryItem }>('/history', payload);
      return data.item;
    }

    throw new Error(getErrorMessage(error, 'Unable to create history item.'));
  }
}

export async function deleteHistory(id: string) {
  try {
    await apiClient.delete(`/history/${id}`);
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      await apiClient.delete(`/history/${id}`);
      return;
    }

    throw new Error(getErrorMessage(error, 'Unable to delete history item.'));
  }
}

export async function commitHistory(payload: { stageItemId?: string; stageCode?: string }) {
  try {
    const { data } = await apiClient.patch<{ items?: HistoryItem[] }>('/history/commit', {
      ...(payload.stageItemId ? { stageItemId: payload.stageItemId } : {}),
      ...(payload.stageCode ? { stageCode: payload.stageCode } : {}),
    });

    return data.items ?? [];
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      const { data } = await apiClient.patch<{ items?: HistoryItem[] }>('/history/commit', {
        ...(payload.stageItemId ? { stageItemId: payload.stageItemId } : {}),
        ...(payload.stageCode ? { stageCode: payload.stageCode } : {}),
      });
      return data.items ?? [];
    }

    throw new Error(getErrorMessage(error, 'Unable to commit history items.'));
  }
}
