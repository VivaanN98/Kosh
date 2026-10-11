import { beforeAll, describe, expect, it } from 'vitest';
import { DemoRepository } from '@/data/demo/demoRepository';
import { DemoStore } from '@/data/demo/store';
import { seedSampleData } from '@/data/demo/sampleData';
import {
  balancesByAccount,
  categoryTotals,
  netPosition,
  rollUpToParents,
  totalIncome,
  totalSpending,
  type SystemIds,
} from '@/domain/ledger/metrics';
import { cashFlow, cumulativeDailySpending, monthlySeries, monthSummary } from '@/domain/reports';
import { monthEnd, monthStart, shiftMonth } from '@/lib/dates';
import type { Account, Category, LedgerEntry, Transaction } from '@/domain/types';

const TODAY = '2026-10-10';
let entries: LedgerEntry[];
let sys: SystemIds;
let accounts: Account[];
let categories: Category[];
let transactions: Transaction[];

beforeAll(async () => {
  const repo = new DemoRepository(DemoStore.memory(), { today: () => TODAY });
  await seedSampleData(repo, TODAY);
  [entries, sys, accounts, categories, transactions] = await Promise.all([
    repo.listLedgerEntries(),
    repo.getSystemAccounts(),
    repo.listAccounts(),
    repo.listCategories(),
    repo.listTransactions(),
  ]);
});

describe('reports reconcile with the ledger', () => {
  it('the ledger is balanced and net worth equals the sum of user account balances', () => {
    expect(entries.reduce((s, e) => s + e.amount, 0)).toBe(0);
    const balances = balancesByAccount(entries);
    const position = netPosition(accounts, balances);
    const sum = accounts.reduce((s, a) => s + (balances.get(a.id) ?? 0), 0);
    expect(position.netWorth).toBe(sum);
    expect(position.assets - position.liabilities).toBe(position.netWorth);
  });

  it('category totals (leaf and rolled up) sum to total spending for every month', () => {
    for (let i = 0; i < 4; i++) {
      const m = shiftMonth('2026-10', -i);
      const from = monthStart(m);
      const to = monthEnd(m);
      const leaf = categoryTotals(entries, sys, 'expense', from, to);
      const total = totalSpending(entries, sys, from, to);
      expect([...leaf.values()].reduce((s, v) => s + v, 0)).toBe(total);
      expect([...rollUpToParents(leaf, categories).values()].reduce((s, v) => s + v, 0)).toBe(total);
    }
  });

  it('monthly series sum to the range totals and savings rate is consistent', () => {
    const series = monthlySeries(entries, sys, '2026-07', '2026-10');
    expect(series.reduce((s, r) => s + r.spending, 0)).toBe(totalSpending(entries, sys, '2026-07-01', '2026-10-31'));
    expect(series.reduce((s, r) => s + r.income, 0)).toBe(totalIncome(entries, sys, '2026-07-01', '2026-10-31'));
    for (const r of series) {
      expect(r.net).toBe(r.income - r.spending);
      if (r.income > 0) expect(r.savingsRateBps).toBe(Math.round((r.net * 10000) / r.income));
    }
  });

  it('spending equals expenses minus refunds; transfers, card payments and goal moves are excluded', () => {
    const live = transactions.filter((t) => !t.deletedAt);
    const expected =
      live.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0) -
      live.filter((t) => t.type === 'refund').reduce((s, t) => s + t.amount, 0);
    expect(totalSpending(entries, sys)).toBe(expected);
    expect(live.some((t) => t.type === 'card_payment')).toBe(true);
    expect(live.some((t) => t.type === 'goal_transfer')).toBe(true);
    expect(live.some((t) => t.type === 'transfer')).toBe(true);
  });

  it('cash flow excludes internal moves and equity postings', () => {
    const flow = cashFlow(entries, accounts, '2026-07', '2026-10', sys.equity);
    const liquid = new Set(accounts.filter((a) => a.kind === 'cash' || a.kind === 'bank').map((a) => a.id));
    let inflow = 0;
    let outflow = 0;
    const byId = new Map(transactions.map((t) => [t.id, t]));
    for (const e of entries) {
      const t = byId.get(e.transactionId)!;
      if (!liquid.has(e.accountId) || e.occurredOn < '2026-07-01') continue;
      if (t.type === 'opening_balance' || t.type === 'adjustment') continue;
      if (t.type === 'transfer' && t.toAccountId && liquid.has(t.toAccountId) && liquid.has(t.accountId)) continue;
      if (e.amount > 0) inflow += e.amount;
      else outflow -= e.amount;
    }
    expect(flow.reduce((s, r) => s + r.inflow, 0)).toBe(inflow);
    expect(flow.reduce((s, r) => s + r.outflow, 0)).toBe(outflow);
  });

  it('cumulative daily spending ends at the month total', () => {
    const series = cumulativeDailySpending(entries, sys, '2026-09');
    expect(series.at(-1)).toBe(monthSummary(entries, sys, '2026-09').spending);
    expect(series).toHaveLength(30);
  });
});
