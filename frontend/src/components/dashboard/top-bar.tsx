import { useEffect, useRef, useState } from 'react';
import {
  ChevronRight,
  Download,
  Loader2,
  LogOut,
  Moon,
  RefreshCw,
  SlidersHorizontal,
  Sun,
  UserPlus,
  Video,
  ClipboardList,
  PanelsTopLeft,
  Upload,
} from 'lucide-react';

import {
  SyncStatusBadge,
  SystemStatusBadge,
} from '@/components/common/system-status-badge';
import { useOfflineSyncStatus, useSystemStatus } from '@/components/common/system-status-hooks';
import type { ThemeMode } from '@/lib/storage';

type TopBarProps = {
  onOpenFilter: () => void;
  onSignOut: () => void;
  onOpenCreateUser: () => void;
  onOpenDeleteLogs: () => void;
  onOpenManageStageCategories: () => void;
  onSyncNow: () => Promise<void>;
  onExportShareBundle: () => Promise<void>;
  onImportShareBundle: () => void;
  displayName: string;
  subtitle: string;
  role: string;
  theme: ThemeMode;
  onToggleTheme: () => void;
  isLoading?: boolean;
};

export function TopBar({
  onOpenFilter,
  onSignOut,
  onOpenCreateUser,
  onOpenDeleteLogs,
  onOpenManageStageCategories,
  onSyncNow,
  onExportShareBundle,
  onImportShareBundle,
  displayName,
  subtitle,
  role,
  theme,
  onToggleTheme,
  isLoading = false,
}: TopBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const systemStatus = useSystemStatus();
  const syncStatus = useOfflineSyncStatus();
  const showOfflineTools = systemStatus.tone !== 'online';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAdminUser = role.trim().toLowerCase() === 'admin';

  return (
    <header className="flex h-auto shrink-0 items-center justify-between border-b-2 border-gray-100 bg-white px-3 py-2 sm:h-14 sm:px-4 sm:py-0 lg:px-5 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-blue-500 to-violet-600 shadow-md shadow-blue-200 dark:shadow-blue-900/40">
            <Video className="h-4 w-4 text-white" />
          </div>
          <span className="truncate text-sm font-bold tracking-tight text-gray-800 dark:text-slate-100">
            IE Video CT
          </span>
        </div>
      </div>

      <div className="flex items-center gap-0.5 sm:gap-1">
        <SystemStatusBadge className="hidden sm:inline-flex" />

        {showOfflineTools ? (
          <>
            <SyncStatusBadge className="hidden sm:inline-flex" />

            <button
              onClick={() => {
                if (isSyncing) {
                  return;
                }

                setIsSyncing(true);
                void onSyncNow().finally(() => setIsSyncing(false));
              }}
              disabled={isSyncing || !syncStatus.pending}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50 lg:px-3"
              title={syncStatus.pending ? 'Sync pending data now' : 'No pending data to sync'}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Syncing' : 'Sync now'}</span>
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        <button
          onClick={onOpenFilter}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 lg:px-3"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
          ) : (
            <SlidersHorizontal className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">{isLoading ? 'Loading...' : 'Filter'}</span>
        </button>

        <div className="mx-1 hidden h-5 w-px bg-gray-200 sm:block" />

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((open) => !open)}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition hover:bg-gray-100 sm:px-2"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-violet-600 text-xs font-bold text-white shadow">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="hidden flex-col items-start sm:flex">
              <span className="text-xs leading-tight font-semibold text-gray-700">{displayName}</span>
              <span className="text-[10px] leading-tight text-gray-400">{subtitle}</span>
            </div>
            <ChevronRight
              className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${
                dropdownOpen ? 'rotate-90' : ''
              }`}
            />
          </button>

          {dropdownOpen ? (
            <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-gray-100 dark:border-slate-700/70 bg-white dark:bg-slate-900 py-1.5 shadow-lg shadow-gray-200/80 dark:shadow-black/50">
              <div className="mb-1 border-b border-gray-100 dark:border-slate-700/60 px-3 py-2">
                <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">{displayName}</p>
              </div>

              {isAdminUser ? (
                <>
                  <button
                    onClick={onOpenCreateUser}
                    className="w-full px-3 py-2 text-left transition hover:bg-blue-50 dark:hover:bg-slate-800"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
                        <UserPlus className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Create user</p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={onOpenDeleteLogs}
                    className="w-full px-3 py-2 text-left transition hover:bg-amber-50 dark:hover:bg-slate-800"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/30">
                        <ClipboardList className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Delete logs</p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={onOpenManageStageCategories}
                    className="w-full px-3 py-2 text-left transition hover:bg-violet-50 dark:hover:bg-slate-800"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-900/30">
                        <PanelsTopLeft className="h-3.5 w-3.5 text-violet-500 dark:text-violet-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Stage categories</p>
                      </div>
                    </div>
                  </button>
                </>
              ) : null}

              <div className={isAdminUser || showOfflineTools ? 'mt-1 border-t border-gray-100 dark:border-slate-700/60 pt-1' : ''}>
                {showOfflineTools ? (
                  <>
                    <button
                      onClick={() => {
                        void onExportShareBundle();
                        setDropdownOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left transition hover:bg-sky-50 dark:hover:bg-slate-800"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-900/30">
                          <Download className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Export share bundle</p>
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        onImportShareBundle();
                        setDropdownOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left transition hover:bg-emerald-50 dark:hover:bg-slate-800"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
                          <Upload className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Import share bundle</p>
                        </div>
                      </div>
                    </button>
                  </>
                ) : null}

                <button
                  onClick={onSignOut}
                  className="group w-full px-3 py-2 text-left transition hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/30 transition group-hover:bg-red-100 dark:group-hover:bg-red-900/50">
                      <LogOut className="h-3.5 w-3.5 text-red-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-red-500 dark:text-red-400">Sign out</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
