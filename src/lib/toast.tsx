'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { IconAlert, IconCheck, IconClose } from '@/components/icons';

type ToastKind = 'success' | 'error';

interface ToastEntry {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<(kind: ToastKind, message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((list) => [...list, { id, kind, message }]);
      setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex animate-pop-in items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-pop dark:border-white/10 dark:bg-[#12182a]"
          >
            <span
              className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                toast.kind === 'success'
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : 'bg-red-500/15 text-red-500'
              }`}
            >
              {toast.kind === 'success' ? (
                <IconCheck className="h-4 w-4" />
              ) : (
                <IconAlert className="h-4 w-4" />
              )}
            </span>
            <p className="flex-1 pt-0.5 text-sm text-strong">{toast.message}</p>
            <button
              onClick={() => dismiss(toast.id)}
              className="shrink-0 text-faint transition hover:text-strong"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Returns a function to show a toast: `toast('success', 'Saved')`. */
export function useToast() {
  return useContext(ToastContext);
}
