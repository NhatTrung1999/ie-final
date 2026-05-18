import { History, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { removeHistoryItem } from '@/store/slices/dashboard-slice';
import type { HistoryItem } from '@/types/dashboard';

type HistoryPanelProps = {
  isPlaying?: boolean;
  onDeleteApplied?: (item: HistoryItem) => void;
  onSelectItem?: (item: HistoryItem) => void;
};

export function HistoryPanel({ isPlaying, onDeleteApplied, onSelectItem }: HistoryPanelProps) {
  const dispatch = useAppDispatch();
  const historyItems = useAppSelector((state) => state.dashboard.historyItems);
  const historyError = useAppSelector((state) => state.dashboard.historyError);

  return (
    <div className="flex min-h-[220px] flex-1 flex-col overflow-hidden border-t-2 border-gray-100 dark:border-slate-800/60 lg:min-h-0">
      <div className="flex shrink-0 items-center gap-1.5 px-3 py-2.5">
        <History className="h-3.5 w-3.5 text-gray-400 dark:text-slate-500" />
        <span className="text-[11px] font-bold tracking-widest text-gray-500 dark:text-slate-400 uppercase">
          History Playback
        </span>
        {historyItems.length > 0 ? (
          <span className="ml-auto rounded-full bg-gray-100 dark:bg-slate-700/60 px-1.5 py-0.5 text-[10px] font-bold text-gray-500 dark:text-slate-300">
            {historyItems.length}
          </span>
        ) : null}
      </div>

      <div className="history-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
        {historyError ? (
          <div className="mb-2 rounded-xl border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            {historyError}
          </div>
        ) : null}

        {historyItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100 dark:bg-slate-700/50">
              <History className="h-4 w-4 text-gray-300 dark:text-slate-600" />
            </div>
            <p className="text-[11px] text-gray-400 dark:text-slate-500">No history playback yet</p>
          </div>
        ) : (
          historyItems.map((entry) => {
            const tone = getTone(entry.label);

            return (
              <div
                key={entry.id}
                onClick={() => onSelectItem?.(entry)}
                className="group flex cursor-pointer items-center gap-2 rounded-xl bg-gray-50 dark:bg-slate-800/50 px-2.5 py-2 transition-all hover:bg-gray-100 dark:hover:bg-slate-700/60"
              >
                <div className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone.dot)} />

                <span className="shrink-0 text-[10px] font-mono text-gray-400 dark:text-slate-500">
                  {entry.range.replace(' - ', '–')}
                </span>

                <span
                  className={cn(
                    'ml-auto shrink-0 rounded-lg border px-1.5 py-0.5 text-[10px] font-bold',
                    tone.badge
                  )}
                >
                  {entry.label}
                </span>

                <button
                  type="button"
                  disabled={entry.committed || entry.locked || isPlaying}
                  onClick={async (event) => {
                    event.stopPropagation();
                    if (entry.committed || entry.locked || isPlaying) {
                      return;
                    }

                    const result = await dispatch(removeHistoryItem(entry.id));

                    if (removeHistoryItem.fulfilled.match(result)) {
                      onDeleteApplied?.(entry);
                    }
                  }}
                  title={
                    isPlaying
                      ? 'Cannot delete history while video is playing.'
                      : entry.committed
                        ? 'This history entry has already been committed to TableCT.'
                        : entry.locked
                          ? 'This history entry is locked because the related TableCT row is confirmed.'
                          : 'Delete history entry'
                  }
                  className={cn(
                    'shrink-0 rounded-lg p-1 transition-all',
                    entry.committed || entry.locked || isPlaying
                      ? 'cursor-not-allowed text-gray-200 dark:text-slate-700 opacity-100'
                      : 'text-gray-300 dark:text-slate-600 opacity-0 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-400 dark:hover:text-red-400 group-hover:opacity-100',
                  )}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function getTone(label: string) {
  if (label.startsWith('VA')) {
    return {
      dot: 'bg-emerald-400',
      badge: 'border-emerald-200 dark:border-emerald-700/50 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
    };
  }

  if (label.startsWith('SKIP')) {
    return {
      dot: 'bg-amber-400',
      badge: 'border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    };
  }

  return {
    dot: 'bg-red-400',
    badge: 'border-red-200 dark:border-red-700/50 bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400',
  };
}
