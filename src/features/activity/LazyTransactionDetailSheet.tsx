import { lazy, Suspense, useState } from 'react';
import type { Transaction } from '@/domain/types';

const TransactionDetailSheet = lazy(() => import('./TransactionDetailSheet').then((m) => ({ default: m.TransactionDetailSheet })));

export function LazyTransactionDetailSheet({ tx, onClose }: { tx: Transaction | null; onClose: () => void }) {
  const [used, setUsed] = useState(false);
  if (tx && !used) setUsed(true);
  if (!used) return null;
  return (
    <Suspense fallback={null}>
      <TransactionDetailSheet tx={tx} onClose={onClose} />
    </Suspense>
  );
}
