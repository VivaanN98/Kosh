import { useEffect, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { useSnapshot, useStore } from '@/data/hooks';
import { Button } from '@/components/ui/Button';
import { RouteSkeleton } from '@/components/layout/RouteSkeleton';

/** Shows a layout-matched skeleton while the ledger loads, and a calm retry on failure. */
export function StoreGate({ children }: { children: ReactNode }) {
  const snap = useSnapshot();
  const store = useStore();
  const ready = snap.status === 'ready';

  // Due recurring items and statement closings are processed on load and whenever the app comes
  // back to the foreground (at most every 5 minutes). The server makes this idempotent.
  useEffect(() => {
    if (!ready) return;
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 5 * 60_000) return;
      last = Date.now();
      void store.runScheduledJobs();
      store.scheduleLedgerRefresh(0);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [ready, store]);
  if (snap.status === 'error') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="serif text-[28px]">We couldn&rsquo;t load your ledger</p>
        <p className="max-w-[36ch] text-[14px] text-text-2">{snap.error}</p>
        <Button variant="primary" icon={<RefreshCw size={16} />} onClick={() => void store.load()}>
          Try again
        </Button>
      </div>
    );
  }
  if (snap.status === 'loading') {
    return (
      <div className="min-h-dvh md:pl-[var(--sidebar-w)]">
        <RouteSkeleton />
      </div>
    );
  }
  return <>{children}</>;
}
