import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Section } from '@/components/ui/bits';
import { useSnapshot } from '@/data/hooks';
import type { PaymentCard } from '@/domain/types';
import { AddCardSheet } from './AddCardSheet';
import { Wallet } from './Wallet';
import { useCardVariant, WalletProvider } from './WalletContext';

export function CardsSection() {
  const snap = useSnapshot();
  const cards = useMemo(() => snap.cards.filter((c) => !c.archivedAt), [snap.cards]);
  const [editing, setEditing] = useState<PaymentCard | null>(null);
  const [variant] = useCardVariant();
  return (
    <WalletProvider>
      <Section
        title="Cards"
        action={
          <Link to="/settings#card-style" className="tap -mr-2 inline-flex items-center rounded-[12px] px-2 text-[13px] font-medium text-text-2 hover:text-text">
            Card style
          </Link>
        }
      >
        <div className="mx-auto max-w-[420px]" data-testid={`wallet-${variant}`}>
          <Wallet variant={variant} cards={cards} onEdit={setEditing} />
        </div>
      </Section>
      <AddCardSheet editing={editing} onEditDone={() => setEditing(null)} />
    </WalletProvider>
  );
}
