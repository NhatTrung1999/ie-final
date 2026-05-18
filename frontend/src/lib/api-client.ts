import axios, { type InternalAxiosRequestConfig } from 'axios';

import { getStoredToken } from '@/lib/storage';
import {
  isBackendReachable,
  isBrowserOffline,
  isOfflineMode,
  offlineAdapter,
} from '@/lib/offline-api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://192.168.18.42:3001/api';
export const UNAUTHORIZED_EVENT = 'ie-auth-unauthorized';

const nativeAdapter = axios.getAdapter(axios.defaults.adapter);

async function dynamicAdapter(config: InternalAxiosRequestConfig) {
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
  (error) => {
    if (error?.response?.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }

    return Promise.reject(error);
  },
);
