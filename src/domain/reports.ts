import {
  diffDays,
  monthEnd,
  monthKey,
  monthStart,
  monthsBetween,
  parseIso,
  type IsoDate,
  type MonthKey,
} from '@/lib/dates';
import { ratioBps, type Paise } from '@/lib/money';
import type { Account, LedgerEntry, Uuid } from './types';
import { totalIncome, totalSpending, type SystemIds } from './ledger/metrics';

interface MonthSummary {
  month: MonthKey;
  income: Paise;
  spending: Paise;
  net: Paise;
  savingsRateBps: number | null;
}

export function monthSummary(entries: readonly LedgerEntry[], sys: SystemIds, month: MonthKey): MonthSummary {
  const from = monthStart(month);
  const to = monthEnd(month);
  const income = totalIncome(entries, sys, from, to);
  const spending = totalSpending(entries, sys, from, to);
  const net = income - spending;
  return { month, income, spending, net, savingsRateBps: income > 0 ? ratioBps(net, income) : null };
}

export function monthlySeries(entries: readonly LedgerEntry[], sys: SystemIds, from: MonthKey, to: MonthKey): MonthSummary[] {
  return monthsBetween(from, to).map((m) => monthSummary(entries, sys, m));
}

interface CashFlowMonth {
  month: MonthKey;
  inflow: Paise;
  outflow: Paise;
  net: Paise;
}

export function cashFlow(
  entries: readonly LedgerEntry[],
  accounts: readonly Account[],
  from: MonthKey,
  to: MonthKey,
  equityAccountId?: Uuid,
): CashFlowMonth[] {
  const liquid = new Set(accounts.filter((a) => a.kind === 'cash' || a.kind === 'bank').map((a) => a.id));
  const byTx = new Map<Uuid, LedgerEntry[]>();
  for (const e of entries) {
    const list = byTx.get(e.transactionId);
    if (list) list.push(e);
    else byTx.set(e.transactionId, [e]);
  }
  const months = new Map(monthsBetween(from, to).map((m) => [m, { month: m, inflow: 0, outflow: 0, net: 0 }]));
  for (const list of byTx.values()) {
    const liquidSide = list.filter((e) => liquid.has(e.accountId));
    if (liquidSide.length === 0 || liquidSide.length === list.length) continue;
    if (equityAccountId && list.some((e) => e.accountId === equityAccountId)) continue;
    for (const e of liquidSide) {
      const row = months.get(monthKey(e.occurredOn));
      if (!row) continue;
      if (e.amount > 0) row.inflow += e.amount;
      else row.outflow += -e.amount;
    }
  }
  return [...months.values()].map((r) => ({ ...r, net: r.inflow - r.outflow }));
}

export function cumulativeDailySpending(
  entries: readonly LedgerEntry[],
  sys: SystemIds,
  month: MonthKey,
  through?: IsoDate,
): Paise[] {
  const start = monthStart(month);
  const end = through && through < monthEnd(month) ? through : monthEnd(month);
  const days = diffDays(end, start) + 1;
  const daily = new Array<number>(Math.max(0, days)).fill(0);
  for (const e of entries) {
    if (e.accountId !== sys.expense || e.occurredOn < start || e.occurredOn > end) continue;
    daily[parseIso(e.occurredOn).d - 1]! += e.amount;
  }
  let running = 0;
  return daily.map((d) => (running += d));
}
