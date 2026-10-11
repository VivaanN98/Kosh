import { AnimatePresence, m } from 'motion/react';
import { useRef } from 'react';
import { CardFace } from '@/components/cards/CardFace';
import { springs } from '@/motion/springs';
import { useElementWidth } from '@/lib/useElementWidth';
import { useDerived } from '@/data/hooks';
import type { PaymentCard } from '@/domain/types';
import { useWallet } from '../WalletContext';
import { cardLabel, WalletFrame, type PreviewState } from '../WalletFrame';

const PEEK = 58;
const TUCK = 9;

export function StackedWallet({ cards, state, onEdit }: { cards: PaymentCard[]; state: PreviewState; onEdit: (c: PaymentCard) => void }) {
  const wallet = useWallet();
  const d = useDerived();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const cardH = width / 1.586;
  const open = wallet.expanded && cards.some((c) => c.id === wallet.selectedId);
  const n = cards.length;
  const collapsedH = cardH + (n - 1) * PEEK;
  const openH = cardH + 18 + Math.max(0, n - 2) * TUCK + 44;
  const height = Math.max(collapsedH, open ? openH : 0);

  const position = (i: number, id: string) => {
    if (!open) return { y: i * PEEK, scale: 1, opacity: 1, z: i };
    if (id === wallet.selectedId) return { y: 0, scale: 1, opacity: 1, z: 50 };
    const others = cards.filter((c) => c.id !== wallet.selectedId);
    const j = others.findIndex((c) => c.id === id);
    return { y: cardH + 18 + j * TUCK, scale: 0.92 + j * 0.01, opacity: 1, z: 10 + j };
  };

  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      buttons.current[(i + 1) % n]?.focus();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      buttons.current[(i - 1 + n) % n]?.focus();
    } else if (e.key === 'Escape' && open) {
      wallet.setExpanded(false);
    }
  };

  return (
    <WalletFrame cards={cards} state={state} onEdit={onEdit}>
      <div ref={ref} className="relative w-full" style={{ height, clipPath: open ? 'inset(-40px -40px 0 -40px)' : undefined }} role="list" aria-label="Cards">
        <AnimatePresence initial={false}>
          {cards.map((c, i) => {
            const p = position(i, c.id);
            const selected = c.id === wallet.selectedId;
            return (
              <m.div
                key={c.id}
                role="listitem"
                className="absolute inset-x-0 top-0"
                style={{ zIndex: p.z, transformOrigin: '50% 0%' }}
                initial={{ opacity: 0, y: p.y + 60, scale: 0.94 }}
                animate={{ opacity: p.opacity, y: p.y, scale: p.scale }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={springs.card}
              >
                <button
                  ref={(el) => {
                    buttons.current[i] = el;
                  }}
                  type="button"
                  className={`block w-full rounded-[18px] text-left ${wallet.justAdded === c.id ? 'ring-2 ring-[var(--mint)] ring-offset-2 ring-offset-[var(--bg)]' : ''}`}
                  aria-label={cardLabel(c, d.accountById.get(c.accountId)?.name)}
                  aria-expanded={selected && open}
                  data-testid={`stacked-card-${c.id}`}
                  onClick={() => (selected && open ? wallet.setExpanded(false) : wallet.select(c.id))}
                  onKeyDown={(e) => onKey(e, i)}
                >
                  <CardFace card={c} compact={!open && i < n - 1} />
                </button>
              </m.div>
            );
          })}
        </AnimatePresence>
      </div>
    </WalletFrame>
  );
}
