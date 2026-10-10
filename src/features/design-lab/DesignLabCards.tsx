/**
 * /design-lab/cards — compare the three wallet variants with live data. All three share the same
 * card components, data, services and selection state; nothing is duplicated per variant.
 */
import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Page, PageHeader } from '@/components/ui/bits';
import { Segmented } from '@/components/ui/Segmented';
import { Button } from '@/components/ui/Button';
import { useSnapshot } from '@/data/hooks';
import { useMediaQuery } from '@/lib/useMediaQuery';
import type { PaymentCard } from '@/domain/types';
import { AddCardSheet } from '@/features/cards/AddCardSheet';
import { Wallet } from '@/features/cards/Wallet';
import { readVariant, saveVariant, VARIANTS, WalletProvider, type CardVariant } from '@/features/cards/WalletContext';
import type { PreviewState } from '@/features/cards/WalletFrame';

export default function DesignLabCards() {
  return (
    <WalletProvider>
      <Lab />
    </WalletProvider>
  );
}

function Lab() {
  const snap = useSnapshot();
  const wide = useMediaQuery('(min-width: 1180px)');
  const [variant, setVariant] = useState<CardVariant>(readVariant);
  const [preview, setPreview] = useState<PreviewState>('live');
  const [editing, setEditing] = useState<PaymentCard | null>(null);
  const cards = useMemo(() => snap.cards.filter((c) => !c.archivedAt), [snap.cards]);

  const choose = (v: CardVariant) => {
    setVariant(v);
    saveVariant(v);
  };

  return (
    <Page className="md:max-w-[1240px]">
      <PageHeader eyebrow="Design Lab" title="Cards" />
      <p className="-mt-3 mb-6 max-w-[62ch] text-[14px] text-text-2">
        Three ways to hold your cards. Same cards, same data, same selection — switch freely and try each one. Your pick is remembered on this device.
      </p>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {!wide && (
          <Segmented
            label="Variant"
            size="sm"
            value={variant}
            onChange={choose}
            options={VARIANTS.map((v) => ({ value: v.id, label: v.id === 'carousel' ? 'Carousel' : v.label.replace(' Wallet', ''), testId: `variant-${v.id}` }))}
          />
        )}
        <Segmented
          label="Preview state"
          size="sm"
          value={preview}
          onChange={setPreview}
          options={[
            { value: 'live', label: 'Live' },
            { value: 'loading', label: 'Loading' },
            { value: 'empty', label: 'Empty' },
          ]}
        />
      </div>

      {wide ? (
        <div className="grid grid-cols-3 gap-6" data-testid="lab-compare">
          {VARIANTS.map((v) => (
            <section key={v.id} aria-labelledby={`lab-${v.id}`} className={`rounded-[28px] border p-5 ${variant === v.id ? 'border-[var(--peri)] bg-surface' : 'border-line bg-bg-elevated'}`} data-testid={`lab-panel-${v.id}`}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 id={`lab-${v.id}`} className="serif text-[24px] leading-tight">
                    {v.label}
                  </h2>
                  <p className="mt-1 text-[12.5px] text-text-3">{v.blurb}</p>
                </div>
                <Button size="sm" variant={variant === v.id ? 'accent' : 'secondary'} icon={variant === v.id ? <Check size={14} /> : undefined} onClick={() => choose(v.id)} aria-pressed={variant === v.id}>
                  {variant === v.id ? 'Chosen' : 'Choose'}
                </Button>
              </div>
              <div className="mx-auto max-w-[360px]">
                <Wallet variant={v.id} cards={cards} state={preview} onEdit={setEditing} />
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section aria-label={VARIANTS.find((v) => v.id === variant)?.label} className="mx-auto max-w-[420px]" data-testid={`lab-panel-${variant}`}>
          <p className="mb-4 text-[13px] text-text-3">{VARIANTS.find((v) => v.id === variant)?.blurb}</p>
          <Wallet variant={variant} cards={cards} state={preview} onEdit={setEditing} />
        </section>
      )}
      <AddCardSheet editing={editing} onEditDone={() => setEditing(null)} />
    </Page>
  );
}
