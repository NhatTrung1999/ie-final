import { useOfflineSyncStatus, useSystemStatus } from '@/components/common/system-status-hooks';
import { cn } from '@/lib/utils';

export function SystemStatusBadge({ className }: { className?: string }) {
  const status = useSystemStatus();

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide',
        status.tone === 'offline'
          ? 'border-slate-200 bg-slate-50 text-slate-500'
          : status.tone === 'warn'
            ? 'border-amber-200 bg-amber-50 text-amber-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700',
        className,
      )}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          status.tone === 'offline'
            ? 'bg-slate-400'
            : status.tone === 'warn'
              ? 'bg-amber-500'
              : 'bg-emerald-500',
        )}
      />
      <span>{status.label}</span>
    </div>
  );
}

export function SyncStatusBadge({ className }: { className?: string }) {
  const status = useOfflineSyncStatus();

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide',
        status.tone === 'pending'
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700',
        className,
      )}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          status.tone === 'pending' ? 'bg-amber-500' : 'bg-emerald-500',
        )}
      />
      <span>{status.label}</span>
    </div>
  );
}
