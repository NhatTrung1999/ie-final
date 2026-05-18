import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Upload, X } from 'lucide-react';

import type { OfflineShareImportMode } from '@/lib/offline-api';
import { cn } from '@/lib/utils';

type ImportShareBundleModalProps = {
  open: boolean;
  onClose: () => void;
  onImport: (payload: {
    bundle: unknown;
    mode: OfflineShareImportMode;
  }) => Promise<void>;
};

type BundlePreview = {
  version: number;
  exportedAt: string;
  stageCount: number;
  videoCount: number;
  userCount: number;
};

const IMPORT_MODES: Array<{
  value: OfflineShareImportMode;
  label: string;
  description: string;
  warning: string;
}> = [
  {
    value: 'replace',
    label: 'Replace all data',
    description: 'Overwrite the current local database with the imported bundle.',
    warning: 'This will replace users, stages, CT rows, history, and videos on this device.',
  },
  {
    value: 'merge-stage-data',
    label: 'Merge stage data only',
    description: 'Keep current local data and only merge stage items, stage categories, and videos.',
    warning: 'This keeps your local accounts, delete logs, and sync state untouched.',
  },
];

export function ImportShareBundleModal({
  open,
  onClose,
  onImport,
}: ImportShareBundleModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<unknown | null>(null);
  const [bundlePreview, setBundlePreview] = useState<BundlePreview | null>(null);
  const [mode, setMode] = useState<OfflineShareImportMode>('replace');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setIsDragging(false);
    setSelectedFile(null);
    setSelectedBundle(null);
    setBundlePreview(null);
    setMode('replace');
    setSubmitError('');
    setIsSubmitting(false);
  }, [open]);

  if (!open) {
    return null;
  }

  const handleChooseFile = () => {
    inputRef.current?.click();
  };

  const handleFileSelected = async (file: File | null) => {
    if (!file) {
      return;
    }

    try {
      const bundle = JSON.parse(await file.text()) as unknown;
      setSelectedFile(file);
      setSelectedBundle(bundle);
      setBundlePreview(summarizeBundle(bundle));
      setSubmitError('');
    } catch (error) {
      setSelectedFile(null);
      setSelectedBundle(null);
      setBundlePreview(null);
      setSubmitError(
        error instanceof Error ? error.message : 'Unable to read the selected bundle.',
      );
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!selectedBundle) {
      setSubmitError('Please choose a share bundle first.');
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError('');
      await onImport({
        bundle: selectedBundle,
        mode,
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Unable to import share bundle.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentMode = IMPORT_MODES.find((item) => item.value === mode) ?? IMPORT_MODES[0];

  return (
    <div className="absolute inset-0 z-60 flex items-center justify-center overflow-y-auto bg-slate-950/25 px-3 py-5 backdrop-blur-[2px] sm:px-4 sm:py-8">
      <div className="w-full max-w-[640px] overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_22px_64px_rgba(15,23,42,0.16)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-4.5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-linear-to-b from-blue-500 to-violet-500" />
              <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
                Data Sharing
              </span>
            </div>
            <h2 className="text-[18px] font-semibold tracking-tight text-slate-700">
              Import Share Bundle
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

        <form onSubmit={handleSubmit} className="space-y-3 px-4 py-3.5 sm:px-4.5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-2.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Upload className="h-4 w-4" />
              </span>
              <div>
                <div className="text-[13px] font-semibold text-slate-700">
                  Drag and drop a share bundle here
                </div>
                <div className="text-[11px] text-slate-400">
                  Or click to pick a JSON file exported from another device.
                </div>
              </div>
            </div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              void handleFileSelected(event.target.files?.[0] ?? null);
              event.target.value = '';
            }}
          />

          <div
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              void handleFileSelected(event.dataTransfer.files?.[0] ?? null);
            }}
            onClick={handleChooseFile}
            className={cn(
              'cursor-pointer rounded-2xl border-2 border-dashed px-4 py-5 transition',
              isDragging
                ? 'border-emerald-300 bg-emerald-50/70'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80',
            )}
          >
            <div className="flex flex-col items-center gap-3 text-center">
              <div
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-full',
                  isDragging ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500',
                )}
              >
                <FileText className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-700">
                  {selectedFile ? selectedFile.name : 'Drop file here or click to browse'}
                </p>
                <p className="text-xs leading-5 text-slate-400">
                  The file will be checked before import, then you confirm the action below.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {IMPORT_MODES.map((item) => {
              const active = item.value === mode;

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setMode(item.value)}
                  className={cn(
                    'rounded-2xl border px-3 py-3 text-left transition',
                    active
                      ? 'border-emerald-300 bg-emerald-50/70'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                        active ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400',
                      )}
                    >
                      {active ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-slate-700">{item.label}</p>
                      <p className="mt-0.5 text-[11px] leading-5 text-slate-400">{item.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] leading-5 text-amber-800">
            <span className="font-semibold">{currentMode.label}: </span>
            {currentMode.warning}
          </div>

          {bundlePreview ? (
            <div className="grid grid-cols-1 gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Exported at
                </div>
                <div className="mt-1 text-[13px] font-medium text-slate-700">
                  {formatDateTime(bundlePreview.exportedAt)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Bundle version
                </div>
                <div className="mt-1 text-[13px] font-medium text-slate-700">
                  v{bundlePreview.version}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Stage items
                </div>
                <div className="mt-1 text-[13px] font-medium text-slate-700">
                  {bundlePreview.stageCount}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Videos
                </div>
                <div className="mt-1 text-[13px] font-medium text-slate-700">
                  {bundlePreview.videoCount}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 sm:col-span-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Users
                </div>
                <div className="mt-1 text-[13px] font-medium text-slate-700">
                  {bundlePreview.userCount}
                </div>
              </div>
            </div>
          ) : null}

          {submitError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] font-medium text-red-500">
              {submitError}
            </div>
          ) : null}

          <div className="flex flex-col gap-2.5 pt-1 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-10 rounded-xl border border-slate-200 px-4 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedBundle || isSubmitting}
              className="h-10 rounded-xl bg-emerald-500 px-4 text-[13px] font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              {isSubmitting ? 'Importing...' : 'Confirm import'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function summarizeBundle(bundle: unknown): BundlePreview {
  if (!bundle || typeof bundle !== 'object') {
    throw new Error('Share bundle is invalid.');
  }

  const parsed = bundle as {
    version?: unknown;
    exportedAt?: unknown;
    snapshot?: {
      stages?: unknown;
      users?: unknown;
    };
    videos?: unknown;
  };

  const exportedAt = typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '';

  return {
    version: Number(parsed.version) || 1,
    exportedAt,
    stageCount: Array.isArray(parsed.snapshot?.stages) ? parsed.snapshot?.stages.length : 0,
    videoCount: Array.isArray(parsed.videos) ? parsed.videos.length : 0,
    userCount: Array.isArray(parsed.snapshot?.users) ? parsed.snapshot?.users.length : 0,
  };
}

function formatDateTime(value: string) {
  if (!value) {
    return 'Unknown';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
