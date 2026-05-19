import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';

import {
  createStageCategory,
  deleteStageCategory,
  fetchStageCategories,
  updateStageCategory,
} from '@/services/stage-categories';
import type { StageCategory } from '@/types/dashboard';

type ManageStageCategoriesModalProps = {
  open: boolean;
  onClose: () => void;
  onChanged: (categories: StageCategory[]) => void;
};

export function ManageStageCategoriesModal({
  open,
  onClose,
  onChanged,
}: ManageStageCategoriesModalProps) {
  const [categories, setCategories] = useState<StageCategory[]>([]);
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!open) return;

    setValue('');
    setLabel('');
    setEditingId(null);
    setError('');
    setSuccess('');
    setIsSubmitting(false);

    void loadCategories();
  }, [open]);

  if (!open) return null;

  async function loadCategories() {
    try {
      const next = await fetchStageCategories();
      setCategories(next);
      onChanged(next);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Unable to load categories.',
      );
    }
  }

  const resetForm = () => {
    setValue('');
    setLabel('');
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      setIsSubmitting(true);

      if (editingId) {
        await updateStageCategory(editingId, { value, label });
        setSuccess('Category updated successfully.');
      } else {
        await createStageCategory({ value, label });
        setSuccess('Category created successfully.');
      }

      resetForm();
      await loadCategories();
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Unable to save category.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (category: StageCategory) => {
    setEditingId(category.id);
    setValue(category.value);
    setLabel(category.label);
    setError('');
    setSuccess('');
  };

  const handleDelete = async (id: string) => {
    try {
      setError('');
      setSuccess('');
      await deleteStageCategory(id);
      setSuccess('Category deleted successfully.');
      if (editingId === id) {
        resetForm();
      }
      await loadCategories();
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Unable to delete category.',
      );
    }
  };

  return (
    <div className="absolute inset-0 z-60 flex items-center justify-center overflow-y-auto bg-slate-950/45 px-3 py-5 backdrop-blur-[2px] sm:px-4 sm:py-8">
      <div className="w-full max-w-215 overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_22px_64px_rgba(15,23,42,0.16)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_22px_64px_rgba(0,0,0,0.42)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700 sm:px-4.5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-linear-to-b from-blue-500 to-violet-500" />
              <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
                Stage Setup
              </span>
            </div>
            <h2 className="text-[18px] font-semibold tracking-tight text-slate-700 dark:text-slate-100">
              Manage Categories
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 px-4 py-3.5 sm:grid-cols-[288px_1fr] sm:px-4.5">
          <form onSubmit={handleSubmit} className="space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300">Value</span>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="CUTTING"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-950/40"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300">Label</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="CUTTING"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-950/40"
              />
            </label>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-500 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-300">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-600 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-300">
                {success}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-linear-to-r from-blue-500 to-violet-600 text-[13px] font-semibold text-white transition hover:from-blue-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Plus className="h-4 w-4" />
                {editingId ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="flex h-10 items-center justify-center rounded-xl bg-slate-100 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Clear
              </button>
            </div>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-2.5 flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold text-slate-700 dark:text-slate-100">Current Categories</div>
                <div className="text-[11px] text-slate-400 dark:text-slate-400">
                  These values drive StageList tabs and area options.
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                {categories.length}
              </span>
            </div>

            <div className="max-h-90 space-y-2 overflow-y-auto pr-1">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-slate-700 dark:text-slate-100">
                      {category.label}
                    </div>
                    <div className="truncate text-[11px] text-slate-400 dark:text-slate-400">{category.value}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleEdit(category)}
                    className="flex h-8 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-2.5 text-[11px] font-semibold text-blue-600 transition hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/35 dark:text-blue-300 dark:hover:bg-blue-950/55"
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(category.id)}
                    className="flex h-8 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-2.5 text-[11px] font-semibold text-red-500 transition hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-300 dark:hover:bg-red-950/55"
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
