import { useEffect, useRef } from 'react';

import { isBackendReachable, getOfflineSyncStatus, shouldUseOfflineData } from '@/lib/offline-api';
import { showToast } from '@/components/common/toast';
import { syncOfflineSnapshot } from '@/services/sync';

type SyncBridgeProps = {
  enabled: boolean;
};

export function SyncBridge({ enabled }: SyncBridgeProps) {
  const inFlightRef = useRef(false);
  // Track last error to avoid spamming repeated identical toasts
  const lastErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    const runSync = async () => {
      // Skip if browser is offline or another sync is in progress
      if (!navigator.onLine || inFlightRef.current) {
        return;
      }

      // Skip sync when we are intentionally in offline mode
      // (VITE_OFFLINE_MODE=true, or backend health check says unreachable)
      if (shouldUseOfflineData() || !isBackendReachable()) {
        return;
      }

      const status = getOfflineSyncStatus();
      if (!status.pending) {
        lastErrorRef.current = null;
        return;
      }

      inFlightRef.current = true;

      try {
        await syncOfflineSnapshot();
        lastErrorRef.current = null;
        showToast({
          title: 'Sync completed',
          description: 'Offline data was uploaded to the server.',
          variant: 'success',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to sync offline data.';

        // Only show toast when the error message changes to avoid repeated notifications
        if (lastErrorRef.current !== message) {
          lastErrorRef.current = message;
          showToast({
            title: 'Sync failed',
            description: message,
            variant: 'error',
          });
        }
        // Leave revision pending so the next cycle retries automatically.
      } finally {
        inFlightRef.current = false;
      }
    };

    const handleOnline = () => {
      // Reset error cache when network comes back so fresh errors are shown
      lastErrorRef.current = null;
      void runSync();
    };

    void runSync();
    window.addEventListener('online', handleOnline);
    const intervalId = window.setInterval(() => {
      void runSync();
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.clearInterval(intervalId);
    };
  }, [enabled]);

  return null;
}
