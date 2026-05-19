import { AxiosError } from 'axios';

import { apiClient } from '@/lib/api-client';
import {
  getOfflineUsers,
  isOfflineNetworkError,
  setBackendReachable,
  shouldUseOfflineData,
} from '@/lib/offline-api';
import { getStoredSessionUser, type SessionUser } from '@/lib/storage';

const DEFAULT_FACTORY = 'LYV';
const FACTORIES = new Set(['LYV', 'LHG', 'LVL', 'LYM']);

type LoginPayload = {
  username: string;
  password: string;
  category: string;
};

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    username: string;
    displayName: string;
    category: string;
    factory?: string;
    role?: string;
  };
};

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  factory: string;
  role: string;
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

export async function loginRequest(payload: LoginPayload) {
  try {
    const { data } = await apiClient.post<LoginResponse>('/auth/login', payload);

    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: {
        username: data.user.username || payload.username,
        displayName: data.user.displayName || payload.username,
        category: data.user.category || payload.category,
        factory: normalizeFactory(data.user.factory),
        role: data.user.role || 'user',
      },
    };
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      const { data } = await apiClient.post<LoginResponse>('/auth/login', payload);
      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: {
          username: data.user.username || payload.username,
          displayName: data.user.displayName || payload.username,
          category: data.user.category || payload.category,
          factory: normalizeFactory(data.user.factory),
          role: data.user.role || 'user',
        },
      };
    }

    throw new Error(getErrorMessage(error, 'Unable to sign in right now.'));
  }
}

export async function getCurrentUser() {
  if (shouldUseOfflineData()) {
    const session = getStoredSessionUser();
    return {
      username: session.username || 'Administrator',
      category: session.category || 'FF28',
      factory: normalizeFactory(session.factory),
      role: session.role || 'user',
    };
  }

  try {
    const { data } = await apiClient.get<{
      user: {
        username?: string;
        displayName?: string;
        category?: string;
        factory?: string;
        role?: string;
      };
    }>('/auth/me');

    const user: SessionUser = {
      username: data.user.displayName || data.user.username || 'Administrator',
      category: data.user.category || 'FF28',
      factory: normalizeFactory(data.user.factory),
      role: data.user.role || 'user',
    };

    return user;
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      const session = getStoredSessionUser();
      return {
        username: session.username || 'Administrator',
        category: session.category || 'FF28',
        factory: normalizeFactory(session.factory),
        role: session.role || 'user',
      };
    }

    throw new Error(getErrorMessage(error, 'Session expired or token is invalid.'));
  }
}

export async function registerUser(payload: {
  username: string;
  displayName: string;
  password: string;
  factory: string;
  role: string;
}) {
  try {
    const { data } = await apiClient.post<{
      user?: AuthUser;
    }>('/auth/register', payload);

    return data.user;
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      const { data } = await apiClient.post<{
        user?: AuthUser;
      }>('/auth/register', payload);
      return data.user;
    }

    throw new Error(getErrorMessage(error, 'Unable to create user right now.'));
  }
}

export async function fetchUsers() {
  if (shouldUseOfflineData()) {
    return getOfflineUsers();
  }

  try {
    const { data } = await apiClient.get<{
      users?: AuthUser[];
    }>('/auth/users');

    return data.users ?? [];
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      return getOfflineUsers();
    }

    throw new Error(getErrorMessage(error, 'Unable to load users right now.'));
  }
}

export async function deleteUser(id: string) {
  try {
    await apiClient.delete(`/auth/users/${id}`);
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      setBackendReachable(false);
      await apiClient.delete(`/auth/users/${id}`);
      return;
    }

    throw new Error(getErrorMessage(error, 'Unable to delete user right now.'));
  }
}

function normalizeFactory(factory?: string) {
  const normalized = factory?.trim().toUpperCase();
  return normalized && FACTORIES.has(normalized) ? normalized : DEFAULT_FACTORY;
}
