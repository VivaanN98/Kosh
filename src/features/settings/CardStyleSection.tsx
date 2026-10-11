import { useMemo, useState } from 'react';
import { Section } from '@/components/ui/bits';
import { Segmented } from '@/components/ui/Segmented';
import { useSnapshot } from '@/data/hooks';
import type { PaymentCard } from '@/domain/types';
import { AddCardSheet } from '@/features/cards/AddCardSheet';
import { Wallet } from '@/features/cards/Wallet';
import { DEFAULT_VARIANT, useCardVariant, VARIANTS, WalletProvider } from '@/features/cards/WalletContext';

export default function CardStyleSection() {
  const snap = useSnapshot();
  const cards = useMemo(() => snap.cards.filter((c) => !c.archivedAt), [snap.cards]);
  const [variant, setVariant] = useCardVariant();
  const [editing, setEditing] = useState<PaymentCard | null>(null);
  const info = VARIANTS.find((v) => v.id === variant)!;
  return (
    <WalletProvider>
      <Section title="Card style">
        <div id="card-style" className="card scroll-mt-6 p-4" data-testid="card-style">
          <Segmented
            label="Card style"
            size="sm"
            value={variant}
            onChange={setVariant}
            className="w-full"
            options={VARIANTS.map((v) => ({ value: v.id, label: v.id === 'carousel' ? 'Carousel' : v.label.replace(' Wallet', ''), testId: `variant-${v.id}` }))}
          />
          <p className="mt-3 text-[13px] text-text-2">
            {info.blurb}
            {variant === DEFAULT_VARIANT ? ' (default)' : ''}
          </p>
          <div className="mx-auto mt-4 max-w-[380px]" data-testid={`preview-${variant}`}>
            <Wallet variant={variant} cards={cards} onEdit={setEditing} />
          </div>
        </div>
      </Section>
      <AddCardSheet editing={editing} onEditDone={() => setEditing(null)} />
    </WalletProvider>
  );
}
