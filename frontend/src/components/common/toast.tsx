import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';

import { cn } from '@/lib/utils';

type ToastVariant = 'success' | 'error' | 'info';

type ToastDetail = {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
};

const TOAST_EVENT = 'ie-toast';

export function showToast(detail: Omit<ToastDetail, 'id'>) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ToastDetail>(TOAST_EVENT, {
      detail: {
        id: createToastId(),
        variant: 'info',
        duration: 3500,
        ...detail,
      },
    }),
  );
}

export function ToastViewport() {
  const [toasts, setToasts] = useState<ToastDetail[]>([]);

  useEffect(() => {
    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastDetail>).detail;
      if (!detail) {
        return;
      }

      setToasts((current) => [...current, detail]);

      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== detail.id));
      }, detail.duration ?? 3500);
    };

    window.addEventListener(TOAST_EVENT, handleToast);
    return () => window.removeEventListener(TOAST_EVENT, handleToast);
  }, []);

  const stack = useMemo(() => [...toasts].reverse(), [toasts]);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(92vw,24rem)] flex-col gap-2">
      {stack.map((toast) => (
        <ToastCard
          key={toast.id}
          toast={toast}
          onDismiss={() =>
            setToasts((current) => current.filter((item) => item.id !== toast.id))
          }
        />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastDetail;
  onDismiss: () => void;
}) {
  const icon =
    toast.variant === 'error' ? (
      <CircleAlert className="h-4 w-4" />
    ) : toast.variant === 'success' ? (
      <CheckCircle2 className="h-4 w-4" />
    ) : (
      <Info className="h-4 w-4" />
    );

  return (
    <div
      className={cn(
        'pointer-events-auto rounded-2xl border bg-white px-4 py-3 shadow-xl shadow-slate-900/10 backdrop-blur',
        toast.variant === 'error'
          ? 'border-rose-200'
          : toast.variant === 'success'
            ? 'border-emerald-200'
            : 'border-slate-200',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            toast.variant === 'error'
              ? 'bg-rose-50 text-rose-600'
              : toast.variant === 'success'
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-sky-50 text-sky-600',
          )}
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">{toast.title}</p>
          {toast.description ? (
            <p className="mt-0.5 text-xs leading-5 text-slate-500">{toast.description}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function createToastId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `toast-${Math.random().toString(36).slice(2, 10)}`;
}
