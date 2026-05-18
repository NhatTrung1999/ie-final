import { apiClient } from '@/lib/api-client';
import {
  getOfflineDeleteLogs,
  isOfflineNetworkError,
  setBackendReachable,
  shouldUseOfflineData,
} from '@/lib/offline-api';

export type DeleteLogItem = {
  id: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  actorUserId: string | null;
  actorUsername: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type ListDeleteLogsResponse = {
  logs: DeleteLogItem[];
};

export type DeleteLogFilters = {
  entityType?: string;
  username?: string;
  search?: string;
};

export async function fetchDeleteLogs(filters: DeleteLogFilters = {}) {
  if (shouldUseOfflineData()) {
    return getOfflineDeleteLogs(filters);
  }

  try {
    const response = await apiClient.get<ListDeleteLogsResponse>('/delete-logs', {
      params: {
        ...(filters.entityType ? { entityType: filters.entityType } : {}),
        ...(filters.username ? { username: filters.username } : {}),
        ...(filters.search ? { search: filters.search } : {}),
      },
    });

    return response.data.logs;
  } catch (error) {
    if (shouldUseOfflineData() || isOfflineNetworkError(error)) {
      setBackendReachable(false);
      return getOfflineDeleteLogs(filters);
    }

    throw error;
  }
}
