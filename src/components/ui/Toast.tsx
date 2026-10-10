/**
 * Toasts with optional Undo. Destructive actions use an undo toast instead of a confirm dialog.
 */
import { AnimatePresence, m } from 'motion/react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { springs } from '@/motion/springs';

export interface ToastOptions {
  message: string;
  tone?: 'default' | 'error' | 'success';
  action?: { label: string; onClick: () => void | Promise<void> };
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<(t: ToastOptions) => void>(() => undefined);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    (t: ToastOptions) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-2), { ...t, id }]);
      timers.current.set(id, setTimeout(() => dismiss(id), t.duration ?? (t.action ? 6000 : 3500)));
    },
    [dismiss],
  );

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+16px+var(--safe-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <m.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={springs.snappy}
              className="glass pointer-events-auto flex min-h-[48px] w-full max-w-[420px] items-center gap-3 rounded-[16px] py-2 pl-4 pr-2 shadow-3"
            >
              {t.tone === 'error' ? (
                <CircleAlert size={18} className="shrink-0 text-negative" aria-hidden="true" />
              ) : t.tone === 'success' ? (
                <CircleCheck size={18} className="shrink-0 text-positive" aria-hidden="true" />
              ) : null}
              <p className="min-w-0 flex-1 text-[14px] leading-snug">{t.message}</p>
              {t.action && (
                <button
                  type="button"
                  className="tap shrink-0 rounded-[12px] px-3 text-[14px] font-semibold text-peri hover:bg-surface-2"
                  onClick={() => {
                    dismiss(t.id);
                    void t.action!.onClick();
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
