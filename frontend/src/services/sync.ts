import axios, { AxiosError } from 'axios';

import {
  applySyncedSnapshot,
  buildOfflineSyncFormData,
  getOfflineSyncStatus,
  isOfflineNetworkError,
  setBackendReachable,
} from '@/lib/offline-api';
import { getStoredToken } from '@/lib/storage';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://192.168.18.42:3001/api';

const syncClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

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

export async function syncOfflineSnapshot() {
  if (!getOfflineSyncStatus().pending) {
    return null;
  }

  try {
    const formData = await buildOfflineSyncFormData();
    const { data } = await syncClient.post<{
      snapshot?: Record<string, unknown>;
      syncedAt?: string;
    }>('/sync/snapshot', formData);

    if (data.snapshot) {
      await applySyncedSnapshot(data.snapshot);
    }

    return data;
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
    }

    throw new Error(getErrorMessage(error, 'Unable to sync offline data.'));
  }
}
