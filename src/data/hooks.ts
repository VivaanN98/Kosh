import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import { monthEnd, monthKey, monthStart, shiftMonth, todayIST } from '@/lib/dates';
import { balancesByAccount, earmarkedTotal, netPosition, totalIncome, totalSpending } from '@/domain/ledger/metrics';
import type { Account, Category, PaymentCard, Uuid } from '@/domain/types';
import type { AppStore, Snapshot } from './store';
import type { BackendMode } from './repository';

export interface BackendContextValue {
  mode: BackendMode;
  store: AppStore;
  userEmail: string | null;
  signOut: () => Promise<void>;
}

export const BackendContext = createContext<BackendContextValue | null>(null);

export function useBackend(): BackendContextValue {
  const ctx = useContext(BackendContext);
  if (!ctx) throw new Error('useBackend outside BackendProvider');
  return ctx;
}

export function useStore(): AppStore {
  return useBackend().store;
}

export function useSnapshot(): Snapshot {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export interface Derived {
  today: string;
  month: string;
  balances: Map<Uuid, number>;
  assets: number;
  liabilities: number;
  netWorth: number;
  availableCash: number;
  earmarked: number;
  freeCash: number;
  monthSpending: number;
  monthIncome: number;
  lastMonthSpending: number;
  accountById: Map<Uuid, Account>;
  categoryById: Map<Uuid, Category>;
  cardById: Map<Uuid, PaymentCard>;
  activeAccounts: Account[];
}

export function useDerived(): Derived {
  const s = useSnapshot();
  const today = todayIST();
  return useMemo(() => {
    const balances = balancesByAccount(s.entries);
    const position = netPosition(s.accounts, balances);
    const earmarked = earmarkedTotal(s.goals, s.contributions);
    const month = monthKey(today);
    const sys = s.system;
    const prev = shiftMonth(month, -1);
    return {
      today,
      month,
      balances,
      ...position,
      earmarked,
      freeCash: position.availableCash - earmarked,
      monthSpending: sys ? totalSpending(s.entries, sys, monthStart(month), monthEnd(month)) : 0,
      monthIncome: sys ? totalIncome(s.entries, sys, monthStart(month), monthEnd(month)) : 0,
      lastMonthSpending: sys ? totalSpending(s.entries, sys, monthStart(prev), monthEnd(prev)) : 0,
      accountById: new Map(s.accounts.map((a) => [a.id, a])),
      categoryById: new Map(s.categories.map((c) => [c.id, c])),
      cardById: new Map(s.cards.map((c) => [c.id, c])),
      activeAccounts: s.accounts.filter((a) => !a.archivedAt),
    };
  }, [s.entries, s.accounts, s.goals, s.contributions, s.categories, s.cards, s.system, today]);
}
