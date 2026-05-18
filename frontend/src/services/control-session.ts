import { AxiosError } from 'axios';

import { apiClient } from '@/lib/api-client';
import {
  getOfflineControlSession,
  isOfflineNetworkError,
  setBackendReachable,
  shouldUseOfflineData,
} from '@/lib/offline-api';
import type { ControlSessionItem } from '@/types/dashboard';

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

export async function fetchControlSession(filters?: {
  stageItemId?: string;
  stageCode?: string;
}) {
  if (shouldUseOfflineData()) {
    return getOfflineControlSession(filters);
  }

  try {
    const { data } = await apiClient.get<{ session?: ControlSessionItem | null }>(
      '/control-session',
      {
        params:
          filters?.stageItemId || filters?.stageCode
            ? {
                ...(filters.stageItemId ? { stageItemId: filters.stageItemId } : {}),
                ...(filters.stageCode ? { stageCode: filters.stageCode } : {}),
              }
            : undefined,
      },
    );

    return data.session ?? null;
  } catch (error) {
    if (shouldUseOfflineData() || isOfflineNetworkError(error)) {
      setBackendReachable(false);
      return getOfflineControlSession(filters);
    }

    throw new Error(getErrorMessage(error, 'Unable to load control session.'));
  }
}

export async function saveControlSession(payload: {
  stageItemId?: string;
  stageCode: string;
  elapsed: number;
  isRunning: boolean;
  segmentStart: number;
  nva?: number | null;
  va?: number | null;
  skip?: number | null;
}) {
  try {
    const { data } = await apiClient.put<{ session: ControlSessionItem }>(
      '/control-session',
      payload,
    );
    return data.session;
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      const { data } = await apiClient.put<{ session: ControlSessionItem }>(
        '/control-session',
        payload,
      );
      return data.session;
    }

    throw new Error(getErrorMessage(error, 'Unable to save control session.'));
  }
}
