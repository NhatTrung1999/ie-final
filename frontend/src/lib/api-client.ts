import axios, { type InternalAxiosRequestConfig } from 'axios';

import {
  clearStoredSession,
  getStoredRefreshToken,
  getStoredSessionUser,
  getStoredToken,
  persistSession,
} from '@/lib/storage';
import {
  isBackendReachable,
  isBrowserOffline,
  isOfflineMode,
  offlineAdapter,
} from '@/lib/offline-api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://192.168.18.42:3001/api';
export const UNAUTHORIZED_EVENT = 'ie-auth-unauthorized';

const nativeAdapter = axios.getAdapter(axios.defaults.adapter);
const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
  adapter: nativeAdapter,
});

type RetriableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _forceOnline?: boolean;
};

let refreshInFlight: Promise<string> | null = null;

async function dynamicAdapter(config: InternalAxiosRequestConfig) {
  if ((config as RetriableRequestConfig)._forceOnline) {
    return nativeAdapter(config);
  }

  if (isOfflineMode() || isBrowserOffline() || isBackendReachable() === false) {
    return offlineAdapter(config);
  }

  return nativeAdapter(config);
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
  adapter: dynamicAdapter,
});

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config as RetriableRequestConfig | undefined;
    const status = error?.response?.status;
    const requestUrl = String(originalRequest?.url ?? '');

    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !requestUrl.includes('/auth/login') &&
      !requestUrl.includes('/auth/refresh')
    ) {
      const refreshToken = getStoredRefreshToken();

      if (refreshToken) {
        originalRequest._retry = true;

        try {
          refreshInFlight ??= refreshClient
            .post<{
              accessToken: string;
              refreshToken: string;
              user?: {
                username?: string;
                displayName?: string;
                category?: string;
                factory?: string;
                role?: string;
              };
            }>('/auth/refresh', { refreshToken })
            .then(({ data }) => {
              const currentUser = getStoredSessionUser();
              persistSession(
                data.accessToken,
                {
                  username:
                    data.user?.displayName ||
                    data.user?.username ||
                    currentUser.username,
                  category: data.user?.category || currentUser.category,
                  factory: data.user?.factory || currentUser.factory,
                  role: data.user?.role || currentUser.role,
                },
                data.refreshToken
              );
              return data.accessToken;
            })
            .finally(() => {
              refreshInFlight = null;
            });

          const accessToken = await refreshInFlight;
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient(originalRequest);
        } catch {
          clearStoredSession();
        }
      }
    }

    if (status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }

    return Promise.reject(error);
  },
);
