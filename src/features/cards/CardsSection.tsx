import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Section } from '@/components/ui/bits';
import { useSnapshot } from '@/data/hooks';
import type { PaymentCard } from '@/domain/types';
import { AddCardSheet } from './AddCardSheet';
import { Wallet } from './Wallet';
import { readVariant, WalletProvider } from './WalletContext';

/** Cards inside Accounts, using the variant picked in the Design Lab (until one is finalised). */
export function CardsSection() {
  const snap = useSnapshot();
  const cards = useMemo(() => snap.cards.filter((c) => !c.archivedAt), [snap.cards]);
  const [editing, setEditing] = useState<PaymentCard | null>(null);
  const [variant] = useState(readVariant);
  return (
    <WalletProvider>
      <Section
        title="Cards"
        action={
          <Link to="/design-lab/cards" className="text-[13px] font-medium text-text-2 hover:text-text">
            Design Lab
          </Link>
        }
      >
        <div className="mx-auto max-w-[420px]">
          <Wallet variant={variant} cards={cards} onEdit={setEditing} />
        </div>
      </Section>
      <AddCardSheet editing={editing} onEditDone={() => setEditing(null)} />
    </WalletProvider>
  );
}
