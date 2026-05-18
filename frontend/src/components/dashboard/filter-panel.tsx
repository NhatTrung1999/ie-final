import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  X,
} from 'lucide-react';

import type { StageCategory, StageFilters } from '@/types/dashboard';

type FilterPanelProps = {
  open: boolean;
  categories: StageCategory[];
  onClose: () => void;
  value: StageFilters;
  onApply: (filters: StageFilters) => void;
  onReset: () => void;
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

export function FilterPanel({
  open,
  categories,
  onClose,
  value,
  onApply,
  onReset,
}: FilterPanelProps) {
  const [draft, setDraft] = useState<StageFilters>(value);

  useEffect(() => {
    if (open) {
      setDraft(value);
    }
  }, [open, value]);

  return (
    <div
      className={[
        'absolute inset-0 z-40 transition-all duration-300',
        open ? 'pointer-events-auto bg-slate-950/12' : 'pointer-events-none bg-transparent',
      ].join(' ')}
      onClick={onClose}
    >
      <aside
        className={[
          'absolute right-0 top-0 flex h-full w-full max-w-[360px] flex-col border-l border-slate-200 bg-white shadow-[-12px_0_36px_rgba(15,23,42,0.1)] transition-transform duration-300 sm:max-w-[340px]',
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-gradient-to-b from-blue-500 to-violet-500" />
              <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
                Quick Filter
              </span>
            </div>
            <h2 className="text-[19px] font-semibold tracking-tight text-slate-700">
              Filter
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Date From">
              <DateInput
                align="left"
                value={draft.dateFrom}
                onChange={(date) =>
                  setDraft((current) => ({ ...current, dateFrom: formatDateValue(date) }))
                }
              />
            </Field>

            <Field label="Date To">
              <DateInput
                align="right"
                value={draft.dateTo}
                onChange={(date) =>
                  setDraft((current) => ({ ...current, dateTo: formatDateValue(date) }))
                }
              />
            </Field>
          </div>

          <Field label="Season">
            <input
              type="text"
              value={draft.season}
              onChange={(e) => setDraft((current) => ({ ...current, season: e.target.value }))}
              placeholder="ENTER YOUR SEASON..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-50"
            />
          </Field>

          <Field label="Stage">
            <select
              value={draft.stage}
              onChange={(e) => setDraft((current) => ({ ...current, stage: e.target.value }))}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-50"
            >
              <option value="">Choose option</option>
              {STAGE_OPTIONS.filter((o) => o !== 'Choose option').map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Cut Die">
            <input
              type="text"
              value={draft.cutDie}
              onChange={(e) => setDraft((current) => ({ ...current, cutDie: e.target.value }))}
              placeholder="ENTER YOUR CUTDIE..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-50"
            />
          </Field>

          <Field label="Area">
            <select
              value={draft.area}
              onChange={(e) => setDraft((current) => ({ ...current, area: e.target.value }))}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-50"
            >
              <option value="">Choose option</option>
              {categories.map((option) => (
                <option key={option.id} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Article">
            <input
              type="text"
              value={draft.article}
              onChange={(e) => setDraft((current) => ({ ...current, article: e.target.value }))}
              placeholder="ENTER ARTICLE..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-50"
            />
          </Field>
        </div>

        <div className="border-t border-slate-100 px-4 py-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                onReset();
                onClose();
              }}
              className="h-11 rounded-xl border border-slate-200 bg-slate-50 text-[14px] font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => {
                onApply(draft);
                onClose();
              }}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-[14px] font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.24)] transition hover:from-blue-600 hover:to-blue-700"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Apply
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function DateInput({
  align = 'left',
  value,
  onChange,
}: {
  align?: 'left' | 'right';
  value: string;
  onChange: (date: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = useMemo(() => normalizeFilterDate(value), [value]);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  }, [selectedDate]);

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
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-[13px] font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-300 focus:ring-2 focus:ring-blue-50"
      >
        <span>{formatDisplayDate(selectedDate)}</span>
        <CalendarDays className="h-4 w-4 text-slate-500" />
      </button>

      {open ? (
        <div
          className={[
            'absolute top-[calc(100%+0.5rem)] z-50 w-[280px] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_20px_60px_rgba(15,23,42,0.14)]',
            align === 'right' ? 'right-0' : 'left-0',
          ].join(' ')}
        >
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
              const isSelected = isSameDay(date, selectedDate);
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

function normalizeFilterDate(value: string) {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
