import { CreditCard } from 'lucide-react';
import { Section } from '@/components/ui/bits';
import { useDerived, useSnapshot } from '@/data/hooks';
import { NETWORK_LABEL } from '@/domain/cards/artwork';

/** Temporary list of payment cards; replaced by the chosen wallet variant in Phase 7. */
export function CardsSection() {
  const snap = useSnapshot();
  const d = useDerived();
  const cards = snap.cards.filter((c) => !c.archivedAt);
  if (cards.length === 0) return null;
  return (
    <Section title="Cards">
      <ul className="card divide-y divide-[var(--line)] p-1.5">
        {cards.map((c) => (
          <li key={c.id} className="flex min-h-[56px] items-center gap-3 px-2">
            <CreditCard size={20} className="text-text-2" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{c.displayName ?? c.issuer}</span>
              <span className="block text-[12.5px] text-text-3">
                {NETWORK_LABEL[c.network]} {c.cardType} · {d.accountById.get(c.accountId)?.name}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
