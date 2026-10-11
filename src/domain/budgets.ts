import { monthEnd, monthStart, shiftMonth, type MonthKey } from '@/lib/dates';
import { ratioBps, sub, type Paise } from '@/lib/money';
import type { Budget, Category, LedgerEntry, Uuid } from './types';
import { categoryTotals, totalSpending, type SystemIds } from './ledger/metrics';

type BudgetState = 'ok' | 'warning' | 'over';

export interface BudgetStatus {
  budget: Budget;
  spent: Paise;
  remaining: Paise;
  usedBps: number;
  state: BudgetState;
  previousSpent: Paise;
}

function categoryWithChildren(categoryId: Uuid, categories: readonly Category[]): Set<Uuid> {
  const ids = new Set<Uuid>([categoryId]);
  for (const c of categories) if (c.parentId === categoryId) ids.add(c.id);
  return ids;
}

export function spentForBudget(
  budget: Pick<Budget, 'categoryId'>,
  entries: readonly LedgerEntry[],
  sys: SystemIds,
  categories: readonly Category[],
  month: MonthKey,
): Paise {
  const from = monthStart(month);
  const to = monthEnd(month);
  if (budget.categoryId === null) return totalSpending(entries, sys, from, to);
  const ids = categoryWithChildren(budget.categoryId, categories);
  let total = 0;
  for (const [id, amount] of categoryTotals(entries, sys, 'expense', from, to)) if (ids.has(id)) total += amount;
  return total;
}

function budgetState(spent: Paise, amount: Paise, warnAtPct: number): BudgetState {
  if (spent > amount) return 'over';
  if (ratioBps(spent, amount) >= warnAtPct * 100) return 'warning';
  return 'ok';
}

export function budgetStatus(
  budget: Budget,
  entries: readonly LedgerEntry[],
  sys: SystemIds,
  categories: readonly Category[],
  month: MonthKey,
): BudgetStatus {
  const spent = spentForBudget(budget, entries, sys, categories, month);
  return {
    budget,
    spent,
    remaining: sub(budget.amount, spent),
    usedBps: ratioBps(spent, budget.amount),
    state: budgetState(spent, budget.amount, budget.warnAtPct),
    previousSpent: spentForBudget(budget, entries, sys, categories, shiftMonth(month, -1)),
  };
}

export function categoryBudgetsTotal(budgets: readonly Budget[]): Paise {
  return budgets.filter((b) => b.categoryId !== null).reduce((s, b) => s + b.amount, 0);
}
