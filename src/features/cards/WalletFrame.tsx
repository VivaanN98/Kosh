import { AnimatePresence } from 'motion/react';
import type { ReactNode } from 'react';
import { Camera, CreditCard, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState, Skeleton } from '@/components/ui/bits';
import type { PaymentCard } from '@/domain/types';
import { CardDetails } from './CardDetails';
import { useWallet } from './WalletContext';

export type PreviewState = 'live' | 'loading' | 'empty';

export function WalletFrame({
  cards,
  state,
  onEdit,
  children,
  addPlacement = 'below',
}: {
  cards: PaymentCard[];
  state: PreviewState;
  onEdit: (c: PaymentCard) => void;
  children: ReactNode;
  addPlacement?: 'below' | 'header';
}) {
  const wallet = useWallet();
  const selected = cards.find((c) => c.id === wallet.selectedId);
  const actions = (
    <div className="flex gap-2">
      <Button size="sm" icon={<Camera size={15} />} onClick={() => wallet.openAdd('scan')} data-testid="wallet-scan">
        Scan card
      </Button>
      <Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => wallet.openAdd('choose')} data-testid="wallet-add">
        Add card
      </Button>
    </div>
  );

  if (state === 'loading') {
    return (
      <div aria-busy="true" aria-label="Loading cards">
        <Skeleton className="aspect-[1.586] w-full rounded-[18px]" />
        <Skeleton className="-mt-[52%] ml-[4%] aspect-[1.586] w-[92%] rounded-[18px] opacity-60" />
      </div>
    );
  }
  if (state === 'empty' || cards.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={<CreditCard size={24} />} title="No cards yet" body="Add a card to see it here. It shares its account's balance — nothing is double counted." action={actions} />
      </div>
    );
  }
  return (
    <div>
      {addPlacement === 'header' && <div className="mb-4 flex justify-end">{actions}</div>}
      {children}
      <AnimatePresence mode="wait">{selected && wallet.expanded && <CardDetails key={selected.id} card={selected} onEdit={onEdit} />}</AnimatePresence>
      {addPlacement === 'below' && <div className="mt-5 flex justify-center">{actions}</div>}
    </div>
  );
}

export function cardLabel(c: PaymentCard, accountName: string | undefined): string {
  return `${c.displayName ?? c.issuer}, ${c.network} ${c.cardType}${c.last4 ? ` ending ${c.last4}` : ''}${accountName ? `, linked to ${accountName}` : ''}`;
}
