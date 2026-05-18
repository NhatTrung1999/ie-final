import { useEffect, useState } from 'react';

import {
  getOfflineSyncStatus,
  isOfflineMode,
  OFFLINE_SYNC_EVENT,
  setBackendReachable,
} from '@/lib/offline-api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://192.168.18.42:3001/api';

type SystemStatus = {
  label: string;
  tone: 'offline' | 'online' | 'warn';
};

type SyncStatus = {
  label: string;
  tone: 'synced' | 'pending';
};

type ReachabilityStatus = 'checking' | 'online' | 'offline';

export function useSystemStatus() {
  const [reachability, setReachability] = useState<ReachabilityStatus>(() =>
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'checking',
  );

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void checkBackendReachable().then((isReachable) => {
        if (!cancelled) {
          setReachability(isReachable ? 'online' : 'offline');
        }
      });
    };
    const timerId = window.setInterval(refresh, 5000);

    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    refresh();

    return () => {
      cancelled = true;
      window.clearInterval(timerId);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, []);

  if (isOfflineMode()) {
    return {
      label: 'Offline mode',
      tone: 'offline',
    } satisfies SystemStatus;
  }

  if (reachability === 'checking') {
    return {
      label: 'Checking...',
      tone: 'warn',
    } satisfies SystemStatus;
  }

  if (reachability === 'offline') {
    return {
      label: 'Offline',
      tone: 'warn',
    } satisfies SystemStatus;
  }

  return {
    label: 'Online',
    tone: 'online',
  } satisfies SystemStatus;
}

export function useOfflineSyncStatus() {
  const [status, setStatus] = useState(() => getOfflineSyncStatus());

  useEffect(() => {
    const refresh = () => setStatus(getOfflineSyncStatus());
    window.addEventListener('storage', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    window.addEventListener(OFFLINE_SYNC_EVENT, refresh as EventListener);
    const intervalId = window.setInterval(refresh, 5000);

    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      window.removeEventListener(OFFLINE_SYNC_EVENT, refresh as EventListener);
      window.clearInterval(intervalId);
    };
  }, []);

  if (status.pending) {
    return {
      label: 'Pending sync',
      tone: 'pending',
      pending: true,
    } satisfies SyncStatus & { pending: boolean };
  }

  return {
    label: 'Synced',
    tone: 'synced',
    pending: false,
  } satisfies SyncStatus & { pending: boolean };
}

async function checkBackendReachable() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setBackendReachable(false);
    return false;
  }

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    window.clearTimeout(timeoutId);
    const reachable = response.ok;
    setBackendReachable(reachable);
    return reachable;
  } catch {
    setBackendReachable(false);
    return false;
  }
}
