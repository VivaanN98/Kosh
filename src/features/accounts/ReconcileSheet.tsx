import { useState } from 'react';
import { Scale } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/bits';
import { AmountField } from '@/components/ui/AmountField';
import { Money } from '@/components/ui/Money';
import { useToast } from '@/components/ui/Toast';
import { useDerived, useSnapshot, useStore } from '@/data/hooks';
import { parseRupees } from '@/lib/money';
import { idempotencyKey } from '@/lib/ids';
import { balancesByAccount } from '@/domain/ledger/metrics';
import { toKoshError } from '@/domain/errors';
import type { Account } from '@/domain/types';

/**
 * Reconcile: enter what the bank (or card statement) shows. The difference is posted as an
 * adjustment against equity — never as income or spending.
 */
export function ReconcileSheet({ account, open, onClose }: { account: Account; open: boolean; onClose: () => void }) {
  const store = useStore();
  const snap = useSnapshot();
  const d = useDerived();
  const toast = useToast();
  const [key] = useState(() => idempotencyKey('rec'));
  const [value, setValue] = useState('');
  const [asOf, setAsOf] = useState(d.today);
  const [busy, setBusy] = useState(false);
  const isCard = account.kind === 'credit_card';
  const entered = parseRupees(value);
  const ledger = balancesByAccount(snap.entries.filter((e) => e.accountId === account.id), asOf).get(account.id) ?? 0;
  const actual = entered === null ? null : isCard ? -entered : entered;
  const diff = actual === null ? null : actual - ledger;

  const confirm = async () => {
    if (actual === null) return;
    setBusy(true);
    try {
      await store.run((repo) => repo.reconcileAccount({ accountId: account.id, actualBalance: actual, asOf }, key), 'accounts', 'transactions', 'entries');
      toast({ tone: 'success', message: diff === 0 ? 'Balance matches — marked reconciled' : 'Adjustment recorded' });
      onClose();
    } catch (err) {
      toast({ tone: 'error', message: toKoshError(err).friendly });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isCard ? `Reconcile ${account.name}` : `Set balance: ${account.name}`}
      footer={
        <Button variant="primary" size="lg" block disabled={actual === null} loading={busy} onClick={confirm} icon={<Scale size={18} />} data-testid="confirm-reconcile">
          {diff === 0 ? 'Mark as reconciled' : isCard ? 'Record adjustment' : 'Set balance'}
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        <p className="text-[14px] text-text-2">
          Kosh shows <Money amount={isCard ? -ledger : ledger} className="font-medium text-text" /> {isCard ? 'owed' : ''} on this date. Enter what {isCard ? 'your card statement shows' : 'this account actually holds right now'}.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <AmountField label={isCard ? 'Outstanding per bank' : 'Balance per bank'} value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" data-testid="reconcile-amount" />
          <TextField label="As of" type="date" value={asOf} max={d.today} onChange={(e) => setAsOf(e.target.value)} />
        </div>
        {diff !== null && (
          <div className="rounded-[14px] bg-surface-2 px-4 py-3 text-[14px]">
            {diff === 0 ? (
              <span className="text-positive">Everything matches.</span>
            ) : (
              <>
                Difference <Money amount={isCard ? -diff : diff} signed className="font-semibold" /> is saved as a balance adjustment. It never counts as income or spending.
              </>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
