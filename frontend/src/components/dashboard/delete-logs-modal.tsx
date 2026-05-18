import { useEffect, useMemo, useState } from 'react';
import { Download, FileClock, Search, Trash2, User, X } from 'lucide-react';

import {
  fetchDeleteLogs,
  type DeleteLogFilters,
  type DeleteLogItem,
} from '@/services/delete-logs';

type DeleteLogsModalProps = {
  open: boolean;
  onClose: () => void;
};

export function DeleteLogsModal({ open, onClose }: DeleteLogsModalProps) {
  const [logs, setLogs] = useState<DeleteLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [entityType, setEntityType] = useState('');
  const [username, setUsername] = useState('');
  const [search, setSearch] = useState('');

  const entityOptions = useMemo(
    () => ['StageList', 'TableCT', 'HistoryEntry', 'User'],
    [],
  );

  useEffect(() => {
    if (!open) return;

    setEntityType('');
    setUsername('');
    setSearch('');
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const filters: DeleteLogFilters = {
      entityType,
      username,
      search,
    };

    setIsLoading(true);
    setError('');
    void fetchDeleteLogs(filters)
      .then((nextLogs) => {
        setLogs(nextLogs);
      })
      .catch((nextError) => {
        setError(
          nextError instanceof Error ? nextError.message : 'Unable to load delete logs.',
        );
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [entityType, open, search, username]);

  if (!open) return null;

  const handleExport = () => {
    const headers = [
      'Entity Type',
      'Entity Label',
      'Entity ID',
      'Actor Username',
      'Created At',
      'Metadata',
    ];
    const rows = logs.map((log) => [
      log.entityType,
      log.entityLabel,
      log.entityId,
      log.actorUsername ?? '',
      formatDateTime(log.createdAt),
      log.metadata ? JSON.stringify(log.metadata) : '',
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `delete-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="absolute inset-0 z-60 flex items-center justify-center overflow-y-auto bg-slate-950/25 px-3 py-5 backdrop-blur-[2px] sm:px-4 sm:py-8">
      <div className="w-full max-w-220 overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_22px_64px_rgba(15,23,42,0.16)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-4.5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-linear-to-b from-blue-500 to-violet-500" />
              <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
                Audit Trail
              </span>
            </div>
            <h2 className="text-[18px] font-semibold tracking-tight text-slate-700">
              Delete Logs
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-3.5 sm:px-4.5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-2.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-500">
                <Trash2 className="h-4 w-4" />
              </span>
              <div>
                <div className="text-[13px] font-semibold text-slate-700">
                  Deletion history
                </div>
                <div className="text-[11px] text-slate-400">
                  Keep track of who deleted data and when it happened.
                </div>
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] font-medium text-red-500">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5 sm:grid-cols-[1.1fr_1fr_auto]">
            <label className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Search
              </span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Label, ID, metadata..."
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-[13px] text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </label>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Type
                </span>
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                >
                  <option value="">All</option>
                  {entityOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Username
                </span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Search username..."
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={handleExport}
              disabled={logs.length === 0}
              className="flex h-10 items-center justify-center gap-2 self-end rounded-xl bg-emerald-500 px-4 text-[13px] font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>

          <div className="max-h-[54vh] space-y-2.5 overflow-y-auto pr-1">
            {isLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[13px] text-slate-400">
                Loading delete logs...
              </div>
            ) : logs.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-center">
                <div className="mb-2 flex justify-center text-slate-300">
                  <FileClock className="h-5 w-5" />
                </div>
                <p className="text-[13px] font-medium text-slate-500">No delete logs yet.</p>
              </div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-500">
                          {log.entityType}
                        </span>
                        <span className="truncate text-[13px] font-semibold text-slate-700">
                          {log.entityLabel}
                        </span>
                      </div>
                      <div className="mt-1 text-[12px] text-slate-400">
                        ID: {log.entityId}
                      </div>
                    </div>

                    <div className="text-right text-[12px] text-slate-400">
                      <div>{formatDateTime(log.createdAt)}</div>
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[12px] text-slate-500">
                    <div className="inline-flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      <span>{log.actorUsername ?? 'Unknown user'}</span>
                    </div>
                  </div>

                  {log.metadata ? (
                    <pre className="mt-2.5 overflow-x-auto rounded-xl bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-full items-center justify-center rounded-xl bg-slate-100 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}
