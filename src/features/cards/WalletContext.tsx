/**
 * Shared wallet state for every card variant: which card is selected/expanded, the add-card flow,
 * and the card that was just added (so each variant can animate it in). Lives ABOVE the variants,
 * so switching variants keeps the selection.
 */
import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Uuid } from '@/domain/types';

export type CardVariant = 'stacked' | 'orbit' | 'carousel';
export const VARIANTS: { id: CardVariant; label: string; blurb: string }[] = [
  { id: 'stacked', label: 'Stacked Wallet', blurb: 'Cards stacked in a calm column; tap one to lift it open.' },
  { id: 'orbit', label: 'Orbit', blurb: 'A fanned deck with depth; the focused card comes forward.' },
  { id: 'carousel', label: 'Vertical Carousel', blurb: 'Swipe vertically; the centred card is in focus.' },
];

const VARIANT_KEY = 'kosh.cardVariant';

export function readVariant(): CardVariant {
  try {
    const v = localStorage.getItem(VARIANT_KEY);
    if (v === 'stacked' || v === 'orbit' || v === 'carousel') return v;
  } catch {
    /* default */
  }
  return DEFAULT_VARIANT;
}

const VARIANT_EVENT = 'kosh:card-variant';

/** Default card style: Stacked Wallet — calmest, every face readable, scales best with many cards. */
export const DEFAULT_VARIANT: CardVariant = 'stacked';

export function saveVariant(v: CardVariant) {
  try {
    localStorage.setItem(VARIANT_KEY, v);
  } catch {
    /* preference only */
  }
  window.dispatchEvent(new Event(VARIANT_EVENT));
}

/** The user's card style (Settings → Card style), kept in sync across screens and tabs. */
export function useCardVariant(): [CardVariant, (v: CardVariant) => void] {
  const variant = useSyncExternalStore(
    (cb) => {
      window.addEventListener(VARIANT_EVENT, cb);
      window.addEventListener('storage', cb);
      return () => {
        window.removeEventListener(VARIANT_EVENT, cb);
        window.removeEventListener('storage', cb);
      };
    },
    readVariant,
    () => DEFAULT_VARIANT,
  );
  return [variant, saveVariant];
}

interface WalletState {
  selectedId: Uuid | null;
  expanded: boolean;
  select: (id: Uuid | null, expand?: boolean) => void;
  setExpanded: (v: boolean) => void;
  addFlow: 'choose' | 'scan' | 'manual' | null;
  openAdd: (mode?: 'choose' | 'scan' | 'manual') => void;
  closeAdd: () => void;
  justAdded: Uuid | null;
  markAdded: (id: Uuid) => void;
}

const Ctx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<Uuid | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [addFlow, setAddFlow] = useState<WalletState['addFlow']>(null);
  const [justAdded, setJustAdded] = useState<Uuid | null>(null);
  const select = useCallback((id: Uuid | null, expand = true) => {
    setSelectedId(id);
    setExpanded(id !== null && expand);
  }, []);
  const markAdded = useCallback((id: Uuid) => {
    setJustAdded(id);
    setSelectedId(id);
    setExpanded(false);
    setTimeout(() => setJustAdded((cur) => (cur === id ? null : cur)), 2000);
  }, []);
  const value = useMemo(
    () => ({
      selectedId, expanded, select, setExpanded, addFlow, justAdded, markAdded,
      openAdd: (mode: 'choose' | 'scan' | 'manual' = 'choose') => setAddFlow(mode),
      closeAdd: () => setAddFlow(null),
    }),
    [selectedId, expanded, select, addFlow, justAdded, markAdded],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWallet outside WalletProvider');
  return ctx;
}
