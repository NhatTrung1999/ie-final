import { AxiosError } from 'axios';

import { apiClient } from '@/lib/api-client';
import {
  getOfflineTableRows,
  isOfflineNetworkError,
  setBackendReachable,
  shouldUseOfflineData,
} from '@/lib/offline-api';
import type { CtRow, StageKey } from '@/types/dashboard';

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

export async function fetchTableCt(params: {
  stage?: StageKey;
  stageCode?: string;
  stageItemId?: string;
}) {
  if (shouldUseOfflineData()) {
    return getOfflineTableRows(params);
  }

  try {
    const { data } = await apiClient.get<{ rows?: CtRow[] }>('/table-ct', {
      params,
    });

    return data.rows ?? [];
  } catch (error) {
    if (shouldUseOfflineData() || isOfflineNetworkError(error)) {
      setBackendReachable(false);
      return getOfflineTableRows(params);
    }

    throw new Error(getErrorMessage(error, 'Unable to load table rows.'));
  }
}

export async function reorderTableCtRows(payload: {
  stage: StageKey;
  orderedIds: string[];
}) {
  try {
    await apiClient.patch('/table-ct/reorder', payload);
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      await apiClient.patch('/table-ct/reorder', payload);
      return;
    }

    throw new Error(getErrorMessage(error, 'Unable to save table row order.'));
  }
}

export async function updateTableCtRow(
  id: string,
  payload: {
    machineType?: string;
    confirmed?: boolean;
  },
) {
  try {
    const { data } = await apiClient.patch<{ row: CtRow }>(`/table-ct/${id}`, payload);
    return data.row;
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      const { data } = await apiClient.patch<{ row: CtRow }>(`/table-ct/${id}`, payload);
      return data.row;
    }

    throw new Error(getErrorMessage(error, 'Unable to update table row.'));
  }
}

export async function confirmTableCtRows(payload: {
  ids: string[];
  confirmed?: boolean;
}) {
  try {
    const { data } = await apiClient.patch<{ rows: CtRow[] }>('/table-ct/confirm', payload);
    return data.rows ?? [];
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      const { data } = await apiClient.patch<{ rows: CtRow[] }>('/table-ct/confirm', payload);
      return data.rows ?? [];
    }

    throw new Error(getErrorMessage(error, 'Unable to confirm table rows.'));
  }
}

export async function updateTableCtMetrics(
  id: string,
  payload: {
    columnIndex: number;
    nvaValue?: number;
    vaValue?: number;
  },
) {
  try {
    const { data } = await apiClient.patch<{ row: CtRow }>(`/table-ct/${id}/metrics`, payload);
    return data.row;
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      const { data } = await apiClient.patch<{ row: CtRow }>(`/table-ct/${id}/metrics`, payload);
      return data.row;
    }

    throw new Error(getErrorMessage(error, 'Unable to update table metrics.'));
  }
}

export async function markTableCtDone(id: string) {
  try {
    const { data } = await apiClient.patch<{ row: CtRow }>(`/table-ct/${id}/done`);
    return data.row;
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      const { data } = await apiClient.patch<{ row: CtRow }>(`/table-ct/${id}/done`);
      return data.row;
    }

    throw new Error(getErrorMessage(error, 'Unable to mark table row as done.'));
  }
}

export async function deleteTableCtRow(id: string) {
  try {
    await apiClient.delete(`/table-ct/${id}`);
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      await apiClient.delete(`/table-ct/${id}`);
      return;
    }

    throw new Error(getErrorMessage(error, 'Unable to delete table row.'));
  }
}

export async function exportTableCtWorkbook(payload: {
  stage?: StageKey;
  stageItemId?: string | null;
  rowIds: string[];
}) {
  try {
    const response = await apiClient.post('/table-ct/export', payload, {
      responseType: 'blob',
    });

    return response.data as Blob;
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      const response = await apiClient.post('/table-ct/export', payload, {
        responseType: 'blob',
      });
      return response.data as Blob;
    }

    throw new Error(getErrorMessage(error, 'Unable to export Time Study workbook.'));
  }
}

export async function exportLsaWorkbook(payload: {
  stage?: StageKey;
  stageItemId?: string | null;
  rowIds: string[];
  filteredStageItemIds?: string[];
  estimateOutputPairs?: number;
  workingTimeSeconds?: number;
  taktTimeSeconds?: number;
  manpowerStandardLabor?: number;
  capacityPerHour?: number;
  totalCtSeconds?: number;
}) {
  try {
    const response = await apiClient.post('/table-ct/export-lsa', payload, {
      responseType: 'blob',
    });

    return response.data as Blob;
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      const response = await apiClient.post('/table-ct/export-lsa', payload, {
        responseType: 'blob',
      });
      return response.data as Blob;
    }

    throw new Error(getErrorMessage(error, 'Unable to export LSA workbook.'));
  }
}
