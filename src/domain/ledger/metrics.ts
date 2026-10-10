/**
 * Every derived number comes from ledger entries through these functions.
 * Balances are debit-positive: assets positive, card debt negative.
 */
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

/** Positive = owed to the card issuer. */
export function cardDebt(balances: Map<Uuid, Paise>, accountId: Uuid): Paise {
  const b = balanceOf(balances, accountId);
  return b === 0 ? 0 : -b;
}

export interface NetPosition {
  assets: Paise;
  liabilities: Paise;
  netWorth: Paise;
  availableCash: Paise;
}

/**
 * Net worth = cash + bank + goal assets − credit card debt.
 * Available cash = positive balances of cash and bank accounts only (no goal pots, no credit,
 * overdrawn accounts count as zero).
 */
export function netPosition(accounts: readonly Account[], balances: Map<Uuid, Paise>): NetPosition {
  let assets = 0;
  let liabilities = 0;
  let availableCash = 0;
  for (const a of accounts) {
    if (a.isSystem) continue;
    const b = balanceOf(balances, a.id);
    if (a.kind === 'credit_card') {
      // A card in credit (overpaid) is an asset; debt is a liability.
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

/** Total spending (expenses minus refunds) in a date range. Transfers never touch the expense account. */
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

/** Per-category totals (leaf categories as posted). Income totals are returned positive. */
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

/** Roll leaf totals up to their top-level category. */
export function rollUpToParents(totals: Map<Uuid, Paise>, categories: readonly Category[]): Map<Uuid, Paise> {
  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
  const out = new Map<Uuid, Paise>();
  for (const [id, amount] of totals) {
    const top = parentOf.get(id) ?? id;
    out.set(top, (out.get(top) ?? 0) + amount);
  }
  return out;
}

/** Contributions still counted towards a goal (account-mode rows whose transfer was deleted are excluded upstream). */
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

/** Money earmarked by active earmark-mode goals. Never an expense, never moves balances. */
export function earmarkedTotal(goals: readonly SavingsGoal[], contributions: readonly GoalContribution[]): Paise {
  const active = new Set(goals.filter((g) => g.mode === 'earmark' && !g.archivedAt).map((g) => g.id));
  let total = 0;
  for (const c of contributions) if (active.has(c.goalId)) total += c.amount;
  return total;
}
