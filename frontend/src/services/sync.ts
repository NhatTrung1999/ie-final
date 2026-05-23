import axios, { AxiosError } from 'axios';

import {
  buildOfflineSyncFormData,
  clearOfflineSyncedData,
  getOfflineSyncStatus,
  isOfflineNetworkError,
  setBackendReachable,
} from '@/lib/offline-api';
import { getStoredToken } from '@/lib/storage';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://192.168.18.42:3001/api';

const syncClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 0,
});

type SyncOfflineSnapshotResult = {
  snapshot?: Record<string, unknown>;
  syncedAt?: string;
} | null;

let syncInFlight: Promise<SyncOfflineSnapshotResult> | null = null;

syncClient.interceptors.request.use((config) => {
  const token = getStoredToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

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

async function runOfflineSnapshotSync(): Promise<SyncOfflineSnapshotResult> {
  if (!getOfflineSyncStatus().pending) {
    return null;
  }

  try {
    const formData = await buildOfflineSyncFormData();
    const { data } =
      await syncClient.post<Exclude<SyncOfflineSnapshotResult, null>>(
        '/sync/snapshot',
        formData,
      );

    await clearOfflineSyncedData();

    // Sync thành công → backend đang online và reach được.
    // Gọi setBackendReachable(true) để:
    //   1. Đánh dấu backend reachable
    //   2. Fire OFFLINE_REACHABILITY_EVENT → dashboard tự reload dữ liệu
    //      từ API server (trả về đầy đủ cả online data + synced data)
    setBackendReachable(true);

    return data;
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
    }

    throw new Error(getErrorMessage(error, 'Unable to sync offline data.'));
  }
}

export async function syncOfflineSnapshot() {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = runOfflineSnapshotSync().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}
