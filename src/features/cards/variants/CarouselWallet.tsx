/**
 * Variant C — Vertical Carousel. Native vertical scrolling with snap-to-centre; the centred card is
 * in focus and the neighbours peek above and below, scaled and dimmed by scroll position
 * (transform/opacity only, driven by motion values — no re-render per frame).
 */
import { m, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'motion/react';
import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { CardFace } from '@/components/cards/CardFace';
import { useElementWidth } from '@/lib/useElementWidth';
import { useReducedMotion } from '@/motion/useMotion';
import { useDerived } from '@/data/hooks';
import type { PaymentCard } from '@/domain/types';
import { useWallet } from '../WalletContext';
import { cardLabel, WalletFrame, type PreviewState } from '../WalletFrame';

const GAP = 14;

export function CarouselWallet({ cards, state, onEdit }: { cards: PaymentCard[]; state: PreviewState; onEdit: (c: PaymentCard) => void }) {
  const wallet = useWallet();
  const d = useDerived();
  const reduced = useReducedMotion();
  const [measure, width] = useElementWidth<HTMLDivElement>();
  const scroller = useRef<HTMLDivElement>(null);
  const cardW = Math.min(width * 0.86, 320);
  const cardH = cardW / 1.586;
  const step = cardH + GAP;
  const viewport = cardH * 1.75;
  const pad = (viewport - cardH) / 2;
  const { scrollY } = useScroll({ container: scroller });
  const n = cards.length;
  const current = Math.max(0, cards.findIndex((c) => c.id === wallet.selectedId));
  const lastSettled = useRef(current);
  /** Target of a scroll we started ourselves; user-driven selection is ignored until we arrive. */
  const programmatic = useRef<number | null>(null);
  const mounted = useRef(false);

  // Keep the selected card centred (selection may change from another variant or a new card).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = current * step;
    lastSettled.current = current;
    if (Math.abs(el.scrollTop - target) > 2) {
      programmatic.current = target;
      el.scrollTo({ top: target, behavior: reduced || !mounted.current ? 'auto' : 'smooth' });
    }
    mounted.current = true;
  }, [current, step, reduced]);

  // When the user's scroll settles on a new card, select it (without expanding).
  useMotionValueEvent(scrollY, 'change', (y) => {
    if (programmatic.current !== null) {
      if (Math.abs(y - programmatic.current) < 2) programmatic.current = null;
      return;
    }
    const idx = Math.round(y / step);
    if (idx !== lastSettled.current && Math.abs(y - idx * step) < 4 && cards[idx]) {
      lastSettled.current = idx;
      wallet.select(cards[idx].id, false);
    }
  });

  const go = (i: number) => {
    const next = cards[Math.max(0, Math.min(n - 1, i))];
    if (next) wallet.select(next.id, false);
  };

  return (
    <WalletFrame cards={cards} state={state} onEdit={onEdit}>
      <div ref={measure} className="relative w-full">
        <div
          ref={scroller}
          className="scroll-clean relative w-full snap-y snap-mandatory overflow-y-auto overscroll-contain outline-none"
          style={{ height: viewport, maskImage: 'linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent)' }}
          tabIndex={0}
          role="listbox"
          aria-label="Cards — use up and down arrows to browse, Enter to open"
          aria-activedescendant={cards[current] ? `carousel-${cards[current].id}` : undefined}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              go(current + 1);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              go(current - 1);
            } else if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (cards[current]) wallet.select(cards[current].id, !wallet.expanded);
            } else if (e.key === 'Escape') {
              wallet.setExpanded(false);
            }
          }}
          data-testid="carousel-scroller"
        >
          <div style={{ height: pad }} aria-hidden="true" />
          {cards.map((c, i) => (
            <CarouselItem
              key={c.id}
              card={c}
              index={i}
              step={step}
              scrollY={scrollY}
              width={cardW}
              gap={i === n - 1 ? 0 : GAP}
              focused={i === current}
              justAdded={wallet.justAdded === c.id}
              label={cardLabel(c, d.accountById.get(c.accountId)?.name)}
              onClick={() => (i === current ? wallet.select(c.id, !wallet.expanded) : go(i))}
            />
          ))}
          <div style={{ height: pad }} aria-hidden="true" />
        </div>
      </div>
      {n > 1 && (
        <div className="mt-1 flex items-center justify-center gap-3">
          <button type="button" aria-label="Previous card" disabled={current === 0} onClick={() => go(current - 1)} className="tap inline-flex items-center justify-center rounded-full text-text-2 hover:bg-surface-2 disabled:opacity-30">
            <ChevronUp size={20} />
          </button>
          <span className="num min-w-[44px] text-center text-[12px] text-text-3" aria-live="polite">
            {current + 1} / {n}
          </span>
          <button type="button" aria-label="Next card" disabled={current === n - 1} onClick={() => go(current + 1)} className="tap inline-flex items-center justify-center rounded-full text-text-2 hover:bg-surface-2 disabled:opacity-30">
            <ChevronDown size={20} />
          </button>
        </div>
      )}
    </WalletFrame>
  );
}

function CarouselItem({
  card,
  index,
  step,
  scrollY,
  width,
  gap,
  focused,
  justAdded,
  label,
  onClick,
}: {
  card: PaymentCard;
  index: number;
  step: number;
  scrollY: MotionValue<number>;
  width: number;
  gap: number;
  focused: boolean;
  justAdded: boolean;
  label: string;
  onClick: () => void;
}) {
  const center = index * step;
  const scale = useTransform(scrollY, [center - step, center, center + step], [0.86, 1, 0.86]);
  const opacity = useTransform(scrollY, [center - step * 1.5, center, center + step * 1.5], [0.35, 1, 0.35]);
  return (
    <div className="flex snap-center justify-center" style={{ marginBottom: gap }}>
      <m.button
        id={`carousel-${card.id}`}
        type="button"
        role="option"
        aria-selected={focused}
        aria-label={label}
        tabIndex={-1}
        onClick={onClick}
        className={`block rounded-[18px] ${justAdded ? 'ring-2 ring-[var(--mint)]' : ''}`}
        style={{ width, scale, opacity }}
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        data-testid={`carousel-card-${card.id}`}
      >
        <CardFace card={card} />
      </m.button>
    </div>
  );
}
