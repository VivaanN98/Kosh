import { Pencil, Trash2, Undo2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { BigMoney, Money } from '@/components/ui/Money';
import { IconTile } from '@/components/ui/CategoryIcon';
import { useToast } from '@/components/ui/Toast';
import { useDerived, useSnapshot, useStore } from '@/data/hooks';
import { useAddSheet } from '@/features/add/AddSheetContext';
import { formatDate } from '@/lib/dates';
import { toKoshError } from '@/domain/errors';
import type { Transaction } from '@/domain/types';
import { describeTransaction } from './TransactionRow';

const TYPE_LABEL: Record<Transaction['type'], string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
  card_payment: 'Card payment',
  refund: 'Refund',
  opening_balance: 'Opening balance',
  adjustment: 'Reconciliation adjustment',
  goal_transfer: 'Goal transfer',
};

export function TransactionDetailSheet({ tx, onClose }: { tx: Transaction | null; onClose: () => void }) {
  const d = useDerived();
  const snap = useSnapshot();
  const store = useStore();
  const toast = useToast();
  const add = useAddSheet();
  const live = tx ? (snap.transactions.find((t) => t.id === tx.id) ?? tx) : null;
  const v = live ? describeTransaction(live, d) : null;
  const refunds = live ? snap.transactions.filter((t) => t.refundOf === live.id && !t.deletedAt) : [];
  const refunded = refunds.reduce((s, t) => s + t.amount, 0);
  const editable = live && !['opening_balance', 'adjustment', 'goal_transfer'].includes(live.type);
  const original = live?.refundOf ? snap.transactions.find((t) => t.id === live.refundOf) : undefined;

  const remove = async () => {
    if (!live) return;
    onClose();
    try {
      await store.deleteTransaction(live.id);
      toast({ message: 'Transaction deleted', action: { label: 'Undo', onClick: () => store.restoreTransaction(live.id).catch((e) => toast({ tone: 'error', message: toKoshError(e).friendly })) } });
    } catch (err) {
      toast({ tone: 'error', message: toKoshError(err).friendly });
    }
  };

  const rows: [string, React.ReactNode][] = live
    ? [
        ['Type', TYPE_LABEL[live.type]],
        ['Date', formatDate(live.occurredOn, 'EEEE, d MMMM yyyy')],
        ...(live.categoryId ? ([['Category', d.categoryById.get(live.categoryId)?.name ?? '—']] as [string, string][]) : []),
        [live.toAccountId ? 'From' : 'Account', d.accountById.get(live.accountId)?.name ?? '—'],
        ...(live.toAccountId ? ([['To', d.accountById.get(live.toAccountId)?.name ?? '—']] as [string, string][]) : []),
        ...(live.paymentCardId ? ([['Card', d.cardById.get(live.paymentCardId)?.displayName ?? 'Card']] as [string, string][]) : []),
        ...(live.merchant ? ([['Merchant', live.merchant]] as [string, string][]) : []),
        ...(live.note ? ([['Note', live.note]] as [string, string][]) : []),
        ...(original ? ([['Refund of', original.merchant ?? 'Expense']] as [string, string][]) : []),
        ...(refunded > 0 ? ([['Refunded', <Money key="r" amount={refunded} tone="positive" />]] as [string, React.ReactNode][]) : []),
      ]
    : [];

  return (
    <Sheet open={!!live} onClose={onClose} title={v?.title ?? 'Transaction'} testId="tx-detail">
      {live && v && (
        <div className="pb-2">
          <div className="mb-6 flex items-center gap-4">
            <IconTile name={v.icon} color={v.color} size={52} iconSize={24} />
            <div>
              <BigMoney amount={Math.abs(live.amount)} size="lg" className={v.display === 'in' ? 'text-positive' : ''} />
              <p className="text-[13px] text-text-3">{v.subtitle}</p>
            </div>
          </div>
          <dl className="divide-y divide-[var(--line)] rounded-[16px] border border-line">
            {rows.map(([k, val]) => (
              <div key={k} className="flex items-start justify-between gap-4 px-4 py-3 text-[14px]">
                <dt className="text-text-2">{k}</dt>
                <dd className="text-right font-medium">{val}</dd>
              </div>
            ))}
          </dl>
          {live.type === 'goal_transfer' && <p className="mt-3 text-[13px] text-text-3">Edit or remove goal contributions from the goal in Plans.</p>}
          <div className="mt-5 grid grid-cols-2 gap-2">
            {editable && (
              <Button
                icon={<Pencil size={16} />}
                onClick={() => {
                  onClose();
                  add.open({ edit: live, refundOf: original });
                }}
              >
                Edit
              </Button>
            )}
            {live.type === 'expense' && refunded < live.amount && (
              <Button
                icon={<Undo2 size={16} />}
                onClick={() => {
                  onClose();
                  add.open({ refundOf: live });
                }}
              >
                Refund
              </Button>
            )}
            {live.type !== 'goal_transfer' && (
              <Button variant="danger" icon={<Trash2 size={16} />} onClick={remove} data-testid="delete-transaction" className={editable && live.type === 'expense' ? 'col-span-2' : ''}>
                Delete
              </Button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
