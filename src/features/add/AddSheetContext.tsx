import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Transaction, Uuid } from '@/domain/types';
import type { Paise } from '@/lib/money';
import type { AddMode } from './suggest';

export interface AddPreset {
  mode?: AddMode;
  edit?: Transaction;
  refundOf?: Transaction;
  accountId?: Uuid;
  toAccountId?: Uuid;
  amount?: Paise;
  paymentCardId?: Uuid;
}

interface AddSheetApi {
  open: (preset?: AddPreset) => void;
  close: () => void;
}

const Ctx = createContext<AddSheetApi>({ open: () => undefined, close: () => undefined });

export const useAddSheet = () => useContext(Ctx);

const loadSheet = () => import('./AddSheet');
const AddSheet = lazy(loadSheet);

export function AddSheetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; preset: AddPreset; nonce: number }>({ open: false, preset: {}, nonce: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const preload = () => void loadSheet().then(() => setMounted(true));
    const onPainted = () => (idle ? idle(preload) : setTimeout(preload, 200));
    window.addEventListener('kosh:painted', onPainted, { once: true });
    const fallback = setTimeout(preload, 5000);
    return () => {
      window.removeEventListener('kosh:painted', onPainted);
      clearTimeout(fallback);
    };
  }, []);

  const open = useCallback((preset: AddPreset = {}) => {
    setMounted(true);
    setState((s) => ({ open: true, preset, nonce: s.nonce + 1 }));
  }, []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  const api = useMemo(() => ({ open, close }), [open, close]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {mounted && (
        <Suspense fallback={null}>
          <AddSheet key={state.nonce} open={state.open} preset={state.preset} onClose={close} />
        </Suspense>
      )}
    </Ctx.Provider>
  );
}
