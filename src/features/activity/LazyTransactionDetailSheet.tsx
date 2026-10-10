import { lazy, Suspense, useState } from 'react';
import type { Transaction } from '@/domain/types';

const TransactionDetailSheet = lazy(() => import('./TransactionDetailSheet').then((m) => ({ default: m.TransactionDetailSheet })));

/** Downloads the detail sheet on the first tap, then stays mounted so its exit animation plays. */
export function LazyTransactionDetailSheet({ tx, onClose }: { tx: Transaction | null; onClose: () => void }) {
  const [used, setUsed] = useState(false);
  if (tx && !used) setUsed(true); // derive-from-props during render (React-endorsed pattern)
  if (!used) return null;
  return (
    <Suspense fallback={null}>
      <TransactionDetailSheet tx={tx} onClose={onClose} />
    </Suspense>
  );
}
