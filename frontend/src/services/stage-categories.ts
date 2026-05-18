import { AxiosError } from 'axios';

import { apiClient } from '@/lib/api-client';
import {
  getOfflineStageCategories,
  isOfflineNetworkError,
  setBackendReachable,
  shouldUseOfflineData,
} from '@/lib/offline-api';
import type { StageCategory } from '@/types/dashboard';

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

export async function fetchStageCategories() {
  if (shouldUseOfflineData()) {
    return getOfflineStageCategories();
  }

  try {
    const { data } = await apiClient.get<{ categories?: StageCategory[] }>('/stage-categories');
    return data.categories ?? [];
  } catch (error) {
    if (shouldUseOfflineData() || isOfflineNetworkError(error)) {
      setBackendReachable(false);
      return getOfflineStageCategories();
    }

    throw new Error(getErrorMessage(error, 'Unable to load stage categories.'));
  }
}

export async function createStageCategory(payload: { value: string; label: string }) {
  try {
    const { data } = await apiClient.post<{ category: StageCategory }>(
      '/stage-categories',
      payload,
    );
    return data.category;
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      const { data } = await apiClient.post<{ category: StageCategory }>(
        '/stage-categories',
        payload,
      );
      return data.category;
    }

    throw new Error(getErrorMessage(error, 'Unable to create stage category.'));
  }
}

export async function updateStageCategory(
  id: string,
  payload: { value?: string; label?: string },
) {
  try {
    const { data } = await apiClient.patch<{ category: StageCategory }>(
      `/stage-categories/${id}`,
      payload,
    );
    return data.category;
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      const { data } = await apiClient.patch<{ category: StageCategory }>(
        `/stage-categories/${id}`,
        payload,
      );
      return data.category;
    }

    throw new Error(getErrorMessage(error, 'Unable to update stage category.'));
  }
}

export async function deleteStageCategory(id: string) {
  try {
    await apiClient.delete(`/stage-categories/${id}`);
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      await apiClient.delete(`/stage-categories/${id}`);
      return;
    }

    throw new Error(getErrorMessage(error, 'Unable to delete stage category.'));
  }
}
