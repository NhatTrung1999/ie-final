import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileVideo,
  Upload,
  X,
} from 'lucide-react';

import type { StageCategory, StageKey } from '@/types/dashboard';

type UploadVideoModalProps = {
  open: boolean;
  categories: StageCategory[];
  defaultArea: StageKey;
  onClose: () => void;
  onUpload: (payload: {
    date: string;
    season: string;
    stageCode: string;
    cutDie: string;
    area: StageKey;
    article: string;
    files: File[];
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  }) => Promise<void>;
};

const STAGE_OPTIONS = [
  'Choose option',
  'Pullover',
  'CR0',
  'CR1',
  'CR2',
  'SMS',
  'CS1',
  'CS2',
  'CS3',
  'MASSPRODUCTION',
  'Customer',
];

const TEXT_ONLY_PATTERN = /^[\p{L}\p{N}\s]+$/u;
const TEXT_ONLY_MESSAGE = 'Only letters, numbers, and spaces are allowed.';

function sanitizeTextInput(value: string) {
  return value.replace(/[^\p{L}\p{N}\s]/gu, '');
}

function getTextInputError(value: string, label: string, maxLength: number) {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return `${label} is required.`;
  }

  if (normalizedValue.length > maxLength) {
    return `${label} must be ${maxLength} characters or fewer.`;
  }

  if (!TEXT_ONLY_PATTERN.test(normalizedValue)) {
    return TEXT_ONLY_MESSAGE;
  }

  return '';
}

export function UploadVideoModal({
  open,
  categories,
  defaultArea,
  onClose,
  onUpload,
}: UploadVideoModalProps) {
  const maxFiles = 5;
  const today = useMemo(() => new Date(), []);
  const [date, setDate] = useState(today);
  const [season, setSeason] = useState('');
  const [stageCode, setStageCode] = useState('Choose option');
  const [cutDie, setCutDie] = useState('');
  const [area, setArea] = useState<StageKey>(defaultArea || categories[0]?.value || '');
  const [article, setArticle] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [fileError, setFileError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;

    // Clear transient errors when reopening
    setFileError('');
    setSubmitError('');
    setFieldErrors({});

    if (defaultArea) {
      setArea(defaultArea);
      return;
    }

    if (categories[0]?.value) {
      setArea(categories[0].value);
    }
  }, [categories, defaultArea, open]);

  if (!open) return null;

  const resetForm = () => {
    setDate(today);
    setSeason('');
    setStageCode('Choose option');
    setCutDie('');
    setArea(defaultArea);
    setArticle('');
    setFiles([]);
    setFileNames([]);
    setFileError('');
    setSubmitError('');
    setFieldErrors({});
    setIsSubmitting(false);
    setUploadProgress(0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    // Validate required fields
    const errors: Record<string, string> = {};
    const seasonError = getTextInputError(season, 'Season', 100);
    const cutDieError = getTextInputError(cutDie, 'Cut Die', 100);
    const articleError = getTextInputError(article, 'Article', 255);

    if (seasonError) errors.season = seasonError;
    if (stageCode === 'Choose option') errors.stageCode = 'Please select a stage.';
    if (cutDieError) errors.cutDie = cutDieError;
    if (articleError) errors.article = articleError;
    if (files.length === 0) errors.files = 'Please select at least one video file.';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});

    try {
      setIsSubmitting(true);
      setUploadProgress(0);
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      await onUpload({
        date: formatDateValue(date),
        season,
        stageCode,
        cutDie,
        area,
        article,
        files,
        onProgress: setUploadProgress,
        signal: abortController.signal,
      });
      // Keep form values so user can upload another video with the same info.
      // Only clear the file selection and transient state.
      setFiles([]);
      setFileNames([]);
      setFileError('');
      setSubmitError('');
      setFieldErrors({});
      setUploadProgress(0);
      abortControllerRef.current = null;
    } catch (error) {
      if (error instanceof Error && error.message === 'Upload canceled.') {
        resetForm();
        onClose();
        abortControllerRef.current = null;
        return;
      }

      setSubmitError(
        error instanceof Error ? error.message : 'Unable to upload videos right now.',
      );
    } finally {
      setIsSubmitting(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (isSubmitting) {
      abortControllerRef.current?.abort();
      return;
    }

    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(e.target.files ?? []);

    if (nextFiles.length > maxFiles) {
      setFiles([]);
      setFileNames([]);
      setFileError(`You can only upload up to ${maxFiles} videos at a time.`);
      e.target.value = '';
      return;
    }

    setFileError('');
    setSubmitError('');
    setFiles(nextFiles);
    setFileNames(nextFiles.map((file) => file.name));
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/25 px-3 py-6 backdrop-blur-[2px] sm:px-4 sm:py-10">
      <div className="w-full max-w-[432px] overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_20px_64px_rgba(15,23,42,0.16)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-gradient-to-b from-blue-500 to-violet-500" />
              <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
                Add Stage Video
              </span>
            </div>
            <h2 className="text-[20px] font-semibold tracking-tight text-slate-700">
              Upload Video
            </h2>
          </div>
          <button
            onClick={handleCancel}
            className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 px-4 py-3.5 sm:px-5">
          <Field label="Date">
            <DateInput value={date} onChange={setDate} />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Season" error={fieldErrors.season}>
              <input
                value={season}
                onChange={(e) => {
                  setSeason(sanitizeTextInput(e.target.value));
                  if (fieldErrors.season) setFieldErrors((prev) => ({ ...prev, season: '' }));
                }}
                maxLength={100}
                placeholder="ENTER YOUR SEASON..."
                className={`h-10 w-full rounded-xl border bg-white px-3 text-[13px] uppercase text-slate-600 outline-none transition placeholder:text-slate-400 focus:ring-2 ${
                  fieldErrors.season
                    ? 'border-red-300 focus:border-red-400 focus:ring-red-50'
                    : 'border-slate-200 focus:border-blue-300 focus:ring-blue-50'
                }`}
              />
            </Field>

            <Field label="Stage" error={fieldErrors.stageCode}>
              <select
                value={stageCode}
                onChange={(e) => {
                  setStageCode(e.target.value);
                  if (fieldErrors.stageCode) setFieldErrors((prev) => ({ ...prev, stageCode: '' }));
                }}
                className={`h-10 w-full rounded-xl border bg-white px-3 text-[13px] font-medium text-slate-700 outline-none transition focus:ring-2 ${
                  fieldErrors.stageCode
                    ? 'border-red-300 focus:border-red-400 focus:ring-red-50'
                    : 'border-slate-200 focus:border-blue-300 focus:ring-blue-50'
                }`}
              >
                {STAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Cut Die" error={fieldErrors.cutDie}>
              <input
                value={cutDie}
                onChange={(e) => {
                  setCutDie(sanitizeTextInput(e.target.value));
                  if (fieldErrors.cutDie) setFieldErrors((prev) => ({ ...prev, cutDie: '' }));
                }}
                maxLength={100}
                placeholder="ENTER YOUR CUTDIE..."
                className={`h-10 w-full rounded-xl border bg-white px-3 text-[13px] uppercase text-slate-600 outline-none transition placeholder:text-slate-400 focus:ring-2 ${
                  fieldErrors.cutDie
                    ? 'border-red-300 focus:border-red-400 focus:ring-red-50'
                    : 'border-slate-200 focus:border-blue-300 focus:ring-blue-50'
                }`}
              />
            </Field>

            <Field label="Area">
              <select
                value={area}
                onChange={(e) => setArea(e.target.value as StageKey)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-50"
              >
                {categories.map((option) => (
                  <option key={option.id} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Article" error={fieldErrors.article}>
            <input
              value={article}
              onChange={(e) => {
                setArticle(sanitizeTextInput(e.target.value));
                if (fieldErrors.article) setFieldErrors((prev) => ({ ...prev, article: '' }));
              }}
              maxLength={255}
              placeholder="ENTER YOUR ARTICLE..."
              className={`h-10 w-full rounded-xl border bg-white px-3 text-[13px] uppercase text-slate-600 outline-none transition placeholder:text-slate-400 focus:ring-2 ${
                fieldErrors.article
                  ? 'border-red-300 focus:border-red-400 focus:ring-red-50'
                  : 'border-slate-200 focus:border-blue-300 focus:ring-blue-50'
              }`}
            />
          </Field>

          <Field label="Video" error={fieldErrors.files ?? fileError}>
            <label className="flex h-10 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 transition hover:border-slate-300">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
                <FileVideo className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-slate-500">
                {fileNames.length === 0
                  ? 'Choose video files...'
                  : fileNames.length === 1
                    ? fileNames[0]
                    : `${fileNames.length} videos selected`}
              </span>
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                Browse
              </span>
              <input
                type="file"
                accept="video/*"
                multiple
                onChange={(e) => {
                  handleFileChange(e);
                  if (fieldErrors.files) setFieldErrors((prev) => ({ ...prev, files: '' }));
                }}
                className="hidden"
              />
            </label>
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] text-slate-400">
                Maximum {maxFiles} videos per upload
              </span>
              <span className="text-[11px] font-medium text-slate-500">
                {fileNames.length}/{maxFiles}
              </span>
            </div>
          </Field>

          {isSubmitting ? (
            <div className="space-y-1.5 rounded-xl border border-blue-100 bg-blue-50/80 px-3 py-3">
              <div className="flex items-center justify-between text-[12px] font-medium text-slate-600">
                <span>Upload progress</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-[width] duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          ) : null}

          {submitError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-500">
              {submitError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-2 pt-0.5 sm:grid-cols-2">
            <button
              type="submit"
              disabled={fileNames.length === 0 || !!fileError || isSubmitting}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-[14px] font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.24)] transition hover:from-blue-600 hover:to-blue-700 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
            >
              <Upload className="h-4 w-4" />
              {isSubmitting ? 'Uploading...' : 'Upload'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="h-10 flex-1 rounded-xl bg-red-500 text-[14px] font-semibold text-white transition hover:bg-red-600"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-slate-700">{label}</span>
      {children}
      {error ? (
        <p className="text-[11px] font-medium text-red-500">{error}</p>
      ) : null}
    </label>
  );
}

function DateInput({
  value,
  onChange,
}: {
  value: Date | string;
  onChange: (date: Date) => void;
}) {
  const normalizedValue = normalizeDate(value);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(normalizedValue.getFullYear(), normalizedValue.getMonth(), 1)
  );
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const nextValue = normalizeDate(value);
    setVisibleMonth(new Date(nextValue.getFullYear(), nextValue.getMonth(), 1));
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const days = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const startOffset = (firstDay + 6) % 7;
    const gridStart = new Date(year, month, 1 - startOffset);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });
  }, [visibleMonth]);

  const isSameDay = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();

  const formatDisplayDate = (date: Date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${date.getFullYear()}`;
  };

  const monthLabel = visibleMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-[13px] font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-300 focus:ring-2 focus:ring-blue-50"
      >
        <span>{formatDisplayDate(normalizedValue)}</span>
        <CalendarDays className="h-4 w-4 text-slate-500" />
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[280px] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_20px_60px_rgba(15,23,42,0.14)]">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                setVisibleMonth(
                  (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1)
                )
              }
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="text-sm font-semibold text-slate-700">{monthLabel}</div>

            <button
              type="button"
              onClick={() =>
                setVisibleMonth(
                  (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1)
                )
              }
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-1">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => (
              <div
                key={day}
                className="flex h-8 items-center justify-center text-[11px] font-semibold uppercase tracking-wide text-slate-400"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((date) => {
              const isSelected = isSameDay(date, normalizedValue);
              const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
              const isToday = isSameDay(date, new Date());

              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  onClick={() => {
                    onChange(date);
                    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                    setOpen(false);
                  }}
                  className={[
                    'flex h-8 items-center justify-center rounded-lg text-sm transition',
                    isSelected
                      ? 'bg-gradient-to-r from-blue-500 to-violet-500 font-semibold text-white shadow-sm'
                      : isCurrentMonth
                        ? 'text-slate-700 hover:bg-slate-100'
                        : 'text-slate-300 hover:bg-slate-50',
                    !isSelected && isToday ? 'ring-1 ring-blue-200' : '',
                  ].join(' ')}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function normalizeDate(value: Date | string) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
