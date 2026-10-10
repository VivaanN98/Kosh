import { Pause, Play, XCircle } from 'lucide-react';
import { Money } from '@/components/ui/Money';
import { IconTile } from '@/components/ui/CategoryIcon';
import { useToast } from '@/components/ui/Toast';
import { useDerived, useStore } from '@/data/hooks';
import { FREQUENCY_LABEL, nextOccurrence } from '@/domain/recurring';
import { addDays, formatRelativeDay } from '@/lib/dates';
import { toKoshError } from '@/domain/errors';
import type { RecurringRule, Subscription } from '@/domain/types';

export function SubscriptionRow({ sub, rule: r, onEdit }: { sub: Subscription; rule: RecurringRule; onEdit: () => void }) {
  const d = useDerived();
  const store = useStore();
  const toast = useToast();
  const c = r.categoryId ? d.categoryById.get(r.categoryId) : undefined;
  const next = r.status === 'active' ? nextOccurrence(r, addDays(d.today, -1)) : null;
  const card = r.paymentCardId ? d.cardById.get(r.paymentCardId) : undefined;
  const setStatus = async (status: RecurringRule['status']) => {
    try {
      await store.run((repo) => repo.setRecurringStatus(r.id, status), 'rules');
      if (status === 'cancelled') toast({ message: `${sub.name} cancelled. Past charges stay in your history.` });
    } catch (err) {
      toast({ tone: 'error', message: toKoshError(err).friendly });
    }
  };
  return (
    <li className="flex items-center gap-3 px-2 py-2.5" data-testid="subscription-row">
      <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <IconTile name={c?.icon ?? 'tv'} color={c?.color ?? '#b4a7f5'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">
            {sub.name}
            {r.status === 'paused' && <span className="ml-2 rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-text-2">Paused</span>}
          </span>
          <span className="block truncate text-[12.5px] text-text-3">
            {FREQUENCY_LABEL[r.frequency]} · {card ? (card.displayName ?? card.issuer) : d.accountById.get(r.accountId)?.name}
            {next ? ` · renews ${formatRelativeDay(next, d.today)}` : ''}
          </span>
        </span>
        <Money amount={r.amount} className="text-[15px] font-medium" />
      </button>
      <button
        type="button"
        className="tap inline-flex items-center justify-center rounded-[12px] text-text-2 hover:bg-surface-2"
        aria-label={r.status === 'paused' ? `Resume ${sub.name}` : `Pause ${sub.name}`}
        onClick={() => setStatus(r.status === 'paused' ? 'active' : 'paused')}
      >
        {r.status === 'paused' ? <Play size={17} /> : <Pause size={17} />}
      </button>
      <button type="button" className="tap inline-flex items-center justify-center rounded-[12px] text-text-2 hover:bg-surface-2" aria-label={`Cancel ${sub.name}`} onClick={() => setStatus('cancelled')}>
        <XCircle size={17} />
      </button>
    </li>
  );
}
