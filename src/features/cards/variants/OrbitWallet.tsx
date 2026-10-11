import { m, type PanInfo } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CardFace } from '@/components/cards/CardFace';
import { springs } from '@/motion/springs';
import { project } from '@/motion/gesture';
import { useElementWidth } from '@/lib/useElementWidth';
import { useDerived } from '@/data/hooks';
import type { PaymentCard } from '@/domain/types';
import { useWallet } from '../WalletContext';
import { cardLabel, WalletFrame, type PreviewState } from '../WalletFrame';

export function OrbitWallet({ cards, state, onEdit }: { cards: PaymentCard[]; state: PreviewState; onEdit: (c: PaymentCard) => void }) {
  const wallet = useWallet();
  const d = useDerived();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const n = cards.length;
  const current = Math.max(0, cards.findIndex((c) => c.id === wallet.selectedId));
  const cardW = Math.min(width * 0.82, 320);
  const cardH = cardW / 1.586;
  const go = (i: number, expand = false) => {
    const next = cards[(i + n) % n];
    if (next) wallet.select(next.id, expand);
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const end = info.offset.x + project(info.velocity.x, 0.99);
    if (end < -50) go(current + 1);
    else if (end > 50) go(current - 1);
  };

  return (
    <WalletFrame cards={cards} state={state} onEdit={onEdit}>
      <div
        ref={ref}
        className="relative w-full outline-none"
        style={{ height: cardH + 56 }}
        tabIndex={0}
        role="listbox"
        aria-label="Cards — use left and right arrows to browse, Enter to open"
        aria-activedescendant={cards[current] ? `orbit-${cards[current].id}` : undefined}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            go(current + 1);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            go(current - 1);
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (cards[current]) wallet.select(cards[current].id, !wallet.expanded);
          } else if (e.key === 'Escape') {
            wallet.setExpanded(false);
          }
        }}
        data-testid="orbit-deck"
      >
        <m.div className="absolute inset-0" drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.18} onDragEnd={onDragEnd} style={{ touchAction: 'pan-y' }}>
          {cards.map((c, i) => {
            let k = i - current;
            if (k > n / 2) k -= n;
            if (k < -n / 2) k += n;
            const a = Math.abs(k);
            const focused = k === 0;
            return (
              <m.button
                key={c.id}
                id={`orbit-${c.id}`}
                type="button"
                role="option"
                aria-selected={focused}
                aria-label={cardLabel(c, d.accountById.get(c.accountId)?.name)}
                tabIndex={-1}
                className={`absolute left-1/2 top-4 rounded-[18px] ${wallet.justAdded === c.id ? 'ring-2 ring-[var(--mint)]' : ''}`}
                style={{ width: cardW, marginLeft: -cardW / 2, zIndex: 50 - a, transformOrigin: '50% 120%', pointerEvents: a > 2 ? 'none' : 'auto' }}
                initial={wallet.justAdded === c.id ? { opacity: 0, scale: 0.8, y: 40 } : false}
                animate={{
                  x: k * Math.min(46, width * 0.11),
                  y: a * 10,
                  rotate: k * 6,
                  scale: 1 - a * 0.07,
                  opacity: a > 2 ? 0 : 1 - a * 0.12,
                }}
                transition={springs.card}
                onClick={() => (focused ? wallet.select(c.id, !wallet.expanded) : go(i))}
                data-testid={`orbit-card-${c.id}`}
              >
                <CardFace card={c} style={focused ? undefined : { filter: 'saturate(0.85)' }} />
              </m.button>
            );
          })}
        </m.div>
      </div>
      {n > 1 && (
        <div className="mt-1 flex items-center justify-center gap-3">
          <button type="button" aria-label="Previous card" onClick={() => go(current - 1)} className="tap inline-flex items-center justify-center rounded-full text-text-2 hover:bg-surface-2">
            <ChevronLeft size={20} />
          </button>
          <div className="flex gap-1.5" aria-hidden="true">
            {cards.map((c, i) => (
              <span key={c.id} className={`h-1.5 rounded-full transition-[background-color] ${i === current ? 'w-4 bg-text' : 'w-1.5 bg-line-strong'}`} />
            ))}
          </div>
          <button type="button" aria-label="Next card" onClick={() => go(current + 1)} className="tap inline-flex items-center justify-center rounded-full text-text-2 hover:bg-surface-2">
            <ChevronRight size={20} />
          </button>
        </div>
      )}
    </WalletFrame>
  );
}
