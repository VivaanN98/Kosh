import { m } from 'motion/react';
import { memo } from 'react';
import { IconTile } from '@/components/ui/CategoryIcon';
import { formatINR } from '@/lib/money';
import { formatRelativeDay } from '@/lib/dates';
import type { Derived } from '@/data/hooks';
import type { Transaction } from '@/domain/types';

export interface TxView {
  title: string;
  subtitle: string;
  icon: string;
  color: string | null;
  /** Signed effect for display: negative = money out, positive = money in, 0 = neutral move. */
  display: 'out' | 'in' | 'move';
}

export function describeTransaction(t: Transaction, d: Pick<Derived, 'accountById' | 'categoryById' | 'cardById'>, contextAccountId?: string): TxView {
  const acct = d.accountById.get(t.accountId);
  const to = t.toAccountId ? d.accountById.get(t.toAccountId) : undefined;
  const cat = t.categoryId ? d.categoryById.get(t.categoryId) : undefined;
  const parent = cat?.parentId ? d.categoryById.get(cat.parentId) : undefined;
  const color = cat?.color ?? parent?.color ?? null;
  const card = t.paymentCardId ? d.cardById.get(t.paymentCardId) : undefined;
  const via = card ? (card.displayName ?? card.issuer) : acct?.name;
  switch (t.type) {
    case 'expense':
      return { title: t.merchant ?? cat?.name ?? 'Expense', subtitle: [cat?.name, via].filter(Boolean).join(' · '), icon: cat?.icon ?? 'receipt', color, display: 'out' };
    case 'income':
      return { title: t.merchant ?? cat?.name ?? 'Income', subtitle: [cat?.name, acct?.name].filter(Boolean).join(' · '), icon: cat?.icon ?? 'trending-up', color, display: 'in' };
    case 'refund':
      return { title: `Refund${t.merchant ? ` · ${t.merchant}` : ''}`, subtitle: [cat?.name, acct?.name].filter(Boolean).join(' · '), icon: 'refund', color: 'var(--positive)', display: 'in' };
    case 'card_payment':
      return { title: `Paid ${to?.name ?? 'card'}`, subtitle: `From ${acct?.name ?? 'account'} · not an expense`, icon: 'credit-card', color: 'var(--peri)', display: contextAccountId ? (contextAccountId === t.accountId ? 'out' : 'in') : 'move' };
    case 'transfer':
      return { title: `${acct?.name ?? 'Account'} → ${to?.name ?? 'Account'}`, subtitle: 'Transfer', icon: 'transfer', color: 'var(--peri)', display: contextAccountId ? (contextAccountId === t.accountId ? 'out' : 'in') : 'move' };
    case 'goal_transfer':
      return { title: to?.kind === 'goal' ? `Saved to ${to.name}` : `Withdrawn from ${acct?.name ?? 'goal'}`, subtitle: 'Goal transfer · not an expense', icon: 'piggy-bank', color: 'var(--mint)', display: contextAccountId ? (contextAccountId === t.accountId ? 'out' : 'in') : 'move' };
    case 'opening_balance':
      return { title: 'Opening balance', subtitle: acct?.name ?? '', icon: 'scale', color: null, display: t.amount >= 0 ? 'in' : 'out' };
    case 'adjustment':
      return { title: 'Balance adjustment', subtitle: `${acct?.name ?? ''} · reconciliation`, icon: 'scale', color: null, display: t.amount >= 0 ? 'in' : 'out' };
  }
}

export const TransactionRow = memo(function TransactionRow({
  t,
  d,
  onOpen,
  showDate = false,
  pending = false,
  contextAccountId,
}: {
  t: Transaction;
  d: Pick<Derived, 'accountById' | 'categoryById' | 'cardById' | 'today'>;
  onOpen?: (t: Transaction) => void;
  showDate?: boolean;
  pending?: boolean;
  contextAccountId?: string;
}) {
  const v = describeTransaction(t, d, contextAccountId);
  const abs = Math.abs(t.amount);
  const amountText = v.display === 'out' ? `−${formatINR(abs)}` : v.display === 'in' ? `+${formatINR(abs)}` : formatINR(abs);
  return (
    <m.li layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="list-none">
      <button
        type="button"
        onClick={() => onOpen?.(t)}
        className="group flex min-h-[60px] w-full items-center gap-3 rounded-[14px] px-2 py-2 text-left transition-colors hover:bg-surface-2"
        data-testid="tx-row"
      >
        <IconTile name={v.icon} color={v.color} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium leading-tight">{v.title}</span>
          <span className="mt-0.5 block truncate text-[12.5px] text-text-3">
            {showDate ? `${formatRelativeDay(t.occurredOn, d.today)} · ` : ''}
            {v.subtitle}
          </span>
        </span>
        <span className={`num shrink-0 text-[15px] font-medium ${v.display === 'in' ? 'text-positive' : 'text-text'} ${pending ? 'opacity-60' : ''}`}>
          {amountText}
        </span>
      </button>
    </m.li>
  );
});
