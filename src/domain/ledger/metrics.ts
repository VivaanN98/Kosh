import type { IsoDate } from '@/lib/dates';
import { max, type Paise } from '@/lib/money';
import type { Account, Category, GoalContribution, LedgerEntry, SavingsGoal, Uuid } from '../types';

export interface SystemIds {
  income: Uuid;
  expense: Uuid;
  equity: Uuid;
}

export function balancesByAccount(entries: readonly LedgerEntry[], asOf?: IsoDate): Map<Uuid, Paise> {
  const out = new Map<Uuid, Paise>();
  for (const e of entries) {
    if (asOf && e.occurredOn > asOf) continue;
    out.set(e.accountId, (out.get(e.accountId) ?? 0) + e.amount);
  }
  return out;
}

export function balanceOf(balances: Map<Uuid, Paise>, accountId: Uuid): Paise {
  return balances.get(accountId) ?? 0;
}

export function cardDebt(balances: Map<Uuid, Paise>, accountId: Uuid): Paise {
  const b = balanceOf(balances, accountId);
  return b === 0 ? 0 : -b;
}

interface NetPosition {
  assets: Paise;
  liabilities: Paise;
  netWorth: Paise;
  availableCash: Paise;
}

export function netPosition(accounts: readonly Account[], balances: Map<Uuid, Paise>): NetPosition {
  let assets = 0;
  let liabilities = 0;
  let availableCash = 0;
  for (const a of accounts) {
    if (a.isSystem) continue;
    const b = balanceOf(balances, a.id);
    if (a.kind === 'credit_card') {
      if (b < 0) liabilities += -b;
      else assets += b;
    } else {
      if (b >= 0) assets += b;
      else liabilities += -b;
      if ((a.kind === 'cash' || a.kind === 'bank') && b > 0) availableCash += b;
    }
  }
  return { assets, liabilities, netWorth: assets - liabilities, availableCash };
}

function inRange(e: LedgerEntry, from?: IsoDate, to?: IsoDate): boolean {
  return (!from || e.occurredOn >= from) && (!to || e.occurredOn <= to);
}

export function totalSpending(entries: readonly LedgerEntry[], sys: SystemIds, from?: IsoDate, to?: IsoDate): Paise {
  let total = 0;
  for (const e of entries) if (e.accountId === sys.expense && inRange(e, from, to)) total += e.amount;
  return total;
}

export function totalIncome(entries: readonly LedgerEntry[], sys: SystemIds, from?: IsoDate, to?: IsoDate): Paise {
  let total = 0;
  for (const e of entries) if (e.accountId === sys.income && inRange(e, from, to)) total -= e.amount;
  return total;
}

export function categoryTotals(
  entries: readonly LedgerEntry[],
  sys: SystemIds,
  kind: 'expense' | 'income',
  from?: IsoDate,
  to?: IsoDate,
): Map<Uuid, Paise> {
  const account = kind === 'expense' ? sys.expense : sys.income;
  const sign = kind === 'expense' ? 1 : -1;
  const out = new Map<Uuid, Paise>();
  for (const e of entries) {
    if (e.accountId !== account || !inRange(e, from, to) || !e.categoryId) continue;
    out.set(e.categoryId, (out.get(e.categoryId) ?? 0) + sign * e.amount);
  }
  return out;
}

export function rollUpToParents(totals: Map<Uuid, Paise>, categories: readonly Category[]): Map<Uuid, Paise> {
  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
  const out = new Map<Uuid, Paise>();
  for (const [id, amount] of totals) {
    const top = parentOf.get(id) ?? id;
    out.set(top, (out.get(top) ?? 0) + amount);
  }
  return out;
}

export function goalProgress(
  goal: SavingsGoal,
  contributions: readonly GoalContribution[],
  balances: Map<Uuid, Paise>,
): Paise {
  if (goal.mode === 'account' && goal.accountId) return max(0, balanceOf(balances, goal.accountId));
  let total = 0;
  for (const c of contributions) if (c.goalId === goal.id) total += c.amount;
  return total;
}

export function earmarkedTotal(goals: readonly SavingsGoal[], contributions: readonly GoalContribution[]): Paise {
  const active = new Set(goals.filter((g) => g.mode === 'earmark' && !g.archivedAt).map((g) => g.id));
  let total = 0;
  for (const c of contributions) if (active.has(c.goalId)) total += c.amount;
  return total;
}
