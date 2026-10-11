import { m } from 'motion/react';
import { Archive, Pencil, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { useToast } from '@/components/ui/Toast';
import { useDerived, useSnapshot, useStore } from '@/data/hooks';
import { useAddSheet } from '@/features/add/AddSheetContext';
import { springs } from '@/motion/springs';
import { formatRelativeDay } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import { NETWORK_LABEL } from '@/domain/cards/artwork';
import type { PaymentCard } from '@/domain/types';
import { useWallet } from './WalletContext';

export function CardDetails({ card, onEdit }: { card: PaymentCard; onEdit: (c: PaymentCard) => void }) {
  const snap = useSnapshot();
  const d = useDerived();
  const store = useStore();
  const toast = useToast();
  const add = useAddSheet();
  const wallet = useWallet();
  const account = d.accountById.get(card.accountId);
  const bal = d.balances.get(card.accountId) ?? 0;
  const recent = snap.transactions.filter((t) => t.paymentCardId === card.id && !t.deletedAt).slice(0, 4);
  const isCredit = account?.kind === 'credit_card';

  const remove = async () => {
    try {
      await store.run((repo) => repo.updatePaymentCard(card.id, { archived: true }), 'cards');
      wallet.select(null);
      toast({ message: `${card.displayName ?? card.issuer} removed`, action: { label: 'Undo', onClick: () => store.run((repo) => repo.updatePaymentCard(card.id, { archived: false }), 'cards') } });
    } catch (err) {
      toast({ tone: 'error', message: String((err as Error).message) });
    }
  };

  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={springs.smooth}
      className="card mt-4 p-4"
      data-testid="card-details"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium">{card.displayName ?? card.issuer}</p>
          <p className="text-[12.5px] text-text-3">
            {NETWORK_LABEL[card.network]} · {card.cardType}
            {card.last4 ? ` · ending ${card.last4}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11.5px] text-text-3">{isCredit ? 'Owed on' : 'Uses'} {account?.name}</p>
          <Money amount={isCredit ? -bal : bal} className="text-[15px] font-medium" />
        </div>
      </div>
      <p className="mt-2 text-[12px] text-text-3">A card is a way to pay from {account?.name ?? 'its account'} — it shares that balance, so nothing is counted twice.</p>
      {recent.length > 0 && (
        <ul className="mt-3 divide-y divide-[var(--line)] text-[13.5px]">
          {recent.map((t) => (
            <li key={t.id} className="flex min-h-[40px] items-center justify-between gap-3">
              <span className="truncate">{t.merchant ?? d.categoryById.get(t.categoryId ?? '')?.name ?? 'Payment'}</span>
              <span className="num shrink-0 text-text-2">
                {formatRelativeDay(t.occurredOn, d.today)} · {t.type === 'refund' ? '+' : '−'}
                {formatINR(t.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Button size="sm" variant="primary" icon={<ShoppingBag size={15} />} onClick={() => add.open({ mode: 'expense', accountId: card.accountId, paymentCardId: card.id })}>
          Pay
        </Button>
        <Button size="sm" icon={<Pencil size={15} />} onClick={() => onEdit(card)}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" icon={<Archive size={15} />} onClick={remove} data-testid="remove-card">
          Remove
        </Button>
      </div>
    </m.div>
  );
}
