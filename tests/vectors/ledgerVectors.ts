import type { ErrorCode } from '@/domain/errors';

const R = (rupees: number) => rupees * 100;

export type Step =
  | { op: 'account'; ref: string; kind: 'cash' | 'bank' | 'credit_card' | 'goal'; opening?: number; openingOn?: string; statementDay?: number; dueDays?: number }
  | { op: 'expense' | 'income' | 'refund'; ref?: string; key?: string; amount: number; on: string; account: string; category?: string; refundOf?: string; merchant?: string; note?: string }
  | { op: 'transfer' | 'card_payment'; ref?: string; key?: string; amount: number; on: string; from: string; to: string }
  | { op: 'edit'; ref: string; amount?: number; on?: string; account?: string; category?: string }
  | { op: 'delete' | 'restore'; ref: string }
  | { op: 'archive'; account: string }
  | { op: 'reconcile'; ref?: string; account: string; actual: number; asOf: string }
  | { op: 'goal'; ref: string; mode: 'earmark' | 'account'; target: number; account?: string }
  | { op: 'contribute'; ref?: string; key?: string; goal: string; amount: number; on: string; from?: string }
  | { op: 'editContribution'; ref: string; amount: number }
  | { op: 'deleteContribution'; ref: string }
  | { op: 'withdraw'; goal: string; amount: number; on: string; to: string }
  | { op: 'cardSettings'; account: string; statementDay: number; dueDays?: number }
  | { op: 'closeStatement'; ref: string; account: string; periodEnd: string }
  | { op: 'rule'; ref: string; type: 'expense' | 'income' | 'transfer' | 'card_payment'; amount: number; account: string; to?: string; category?: string; frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'; interval?: number; startOn: string; endOn?: string; anchorDay?: number; mode: 'reminder' | 'automatic' }
  | { op: 'subscription'; ref: string; rule: string; amount: number; account: string; category: string; startOn: string; mode: 'reminder' | 'automatic' }
  | { op: 'ruleStatus'; rule: string; status: 'active' | 'paused' | 'cancelled' }
  | { op: 'materialize'; ref?: string; rule: string; due: string }
  | { op: 'confirm' | 'skip'; ref: string }
  | { op: 'budget'; category: string | null; amount: number; warnAtPct?: number }
  | { op: 'fails'; step: Step; code: ErrorCode }
  | ({ op: 'check' } & Check);

export interface Check {
  label?: string;
  balances?: Record<string, number>;
  debt?: Record<string, number>;
  netWorth?: number;
  availableCash?: number;
  spending?: { from: string; to: string; amount: number };
  income?: { from: string; to: string; amount: number };
  categorySpending?: { category: string; from: string; to: string; amount: number };
  statement?: { ref: string; balance: number; minimumDue: number; periodStart?: string; dueOn?: string };
  occurrence?: { ref: string; status: 'pending' | 'posted' | 'skipped' };
  transactionCount?: number;
  occurrenceCount?: { rule: string; count: number };
  goalProgress?: Record<string, number>;
  earmarked?: number;
  budget?: { category: string | null; month: string; spent: number; state?: 'ok' | 'warning' | 'over' };
  sameId?: [string, string];
}

export interface Vector {
  name: string;
  steps: Step[];
}

export const LEDGER_VECTORS: Vector[] = [
  {
    name: '₹500 cash expense reduces cash by ₹500 and counts as spending',
    steps: [
      { op: 'account', ref: 'cash', kind: 'cash', opening: R(2000), openingOn: '2025-01-01' },
      { op: 'expense', amount: R(500), on: '2025-01-05', account: 'cash', category: 'food.groceries' },
      { op: 'check', balances: { cash: R(1500) }, spending: { from: '2025-01-01', to: '2025-01-31', amount: R(500) }, netWorth: R(1500), availableCash: R(1500) },
    ],
  },
  {
    name: '₹5,000 income raises bank balance and income',
    steps: [
      { op: 'account', ref: 'bank', kind: 'bank', opening: R(10000), openingOn: '2025-01-01' },
      { op: 'income', amount: R(5000), on: '2025-01-10', account: 'bank', category: 'income.salary' },
      { op: 'check', balances: { bank: R(15000) }, income: { from: '2025-01-01', to: '2025-01-31', amount: R(5000) }, spending: { from: '2025-01-01', to: '2025-01-31', amount: 0 } },
    ],
  },
  {
    name: '₹2,000 transfer leaves combined assets, income and expenses unchanged',
    steps: [
      { op: 'account', ref: 'bank', kind: 'bank', opening: R(10000), openingOn: '2025-01-01' },
      { op: 'account', ref: 'cash', kind: 'cash', opening: R(1000), openingOn: '2025-01-01' },
      { op: 'check', netWorth: R(11000) },
      { op: 'transfer', amount: R(2000), on: '2025-01-03', from: 'bank', to: 'cash' },
      {
        op: 'check', balances: { bank: R(8000), cash: R(3000) }, netWorth: R(11000), availableCash: R(11000),
        spending: { from: '2025-01-01', to: '2025-01-31', amount: 0 }, income: { from: '2025-01-01', to: '2025-01-31', amount: 0 },
      },
    ],
  },
  {
    name: 'Editing ₹500 to ₹700 changes totals by exactly ₹200',
    steps: [
      { op: 'account', ref: 'cash', kind: 'cash', opening: R(5000), openingOn: '2025-02-01' },
      { op: 'expense', ref: 'e', amount: R(500), on: '2025-02-02', account: 'cash', category: 'food.restaurants' },
      { op: 'check', balances: { cash: R(4500) }, spending: { from: '2025-02-01', to: '2025-02-28', amount: R(500) } },
      { op: 'edit', ref: 'e', amount: R(700) },
      { op: 'check', balances: { cash: R(4300) }, spending: { from: '2025-02-01', to: '2025-02-28', amount: R(700) }, transactionCount: 1 },
      { op: 'edit', ref: 'e', on: '2025-03-01' },
      { op: 'check', label: 'moving the date moves the spending month', spending: { from: '2025-02-01', to: '2025-02-28', amount: 0 } },
    ],
  },
  {
    name: 'Deleting reverses postings atomically; restore re-posts them',
    steps: [
      { op: 'account', ref: 'bank', kind: 'bank', opening: R(3000), openingOn: '2025-02-01' },
      { op: 'expense', ref: 'e', amount: R(1200), on: '2025-02-02', account: 'bank', category: 'shopping.clothing' },
      { op: 'delete', ref: 'e' },
      { op: 'check', balances: { bank: R(3000) }, spending: { from: '2025-02-01', to: '2025-02-28', amount: 0 }, transactionCount: 0 },
      { op: 'restore', ref: 'e' },
      { op: 'check', balances: { bank: R(1800) }, spending: { from: '2025-02-01', to: '2025-02-28', amount: R(1200) }, transactionCount: 1 },
    ],
  },
  {
    name: '₹10,000 card purchase raises expenses and debt; repayment clears debt with no extra expense',
    steps: [
      { op: 'account', ref: 'bank', kind: 'bank', opening: R(50000), openingOn: '2025-03-01' },
      { op: 'account', ref: 'card', kind: 'credit_card' },
      { op: 'expense', amount: R(10000), on: '2025-03-05', account: 'card', category: 'shopping.electronics' },
      { op: 'check', debt: { card: R(10000) }, spending: { from: '2025-03-01', to: '2025-03-31', amount: R(10000) }, netWorth: R(40000), availableCash: R(50000) },
      { op: 'card_payment', amount: R(10000), on: '2025-03-20', from: 'bank', to: 'card' },
      { op: 'check', debt: { card: 0 }, balances: { bank: R(40000) }, spending: { from: '2025-03-01', to: '2025-03-31', amount: R(10000) }, netWorth: R(40000), availableCash: R(40000) },
    ],
  },
  {
    name: 'Partial repayments reduce debt step by step',
    steps: [
      { op: 'account', ref: 'bank', kind: 'bank', opening: R(20000), openingOn: '2025-03-01' },
      { op: 'account', ref: 'card', kind: 'credit_card', opening: -R(8000), openingOn: '2025-03-01' },
      { op: 'check', debt: { card: R(8000) }, netWorth: R(12000), spending: { from: '2025-03-01', to: '2025-03-31', amount: 0 } },
      { op: 'card_payment', amount: R(3000), on: '2025-03-10', from: 'bank', to: 'card' },
      { op: 'check', debt: { card: R(5000) }, balances: { bank: R(17000) } },
      { op: 'card_payment', amount: R(5000), on: '2025-03-15', from: 'bank', to: 'card' },
      { op: 'check', debt: { card: 0 }, balances: { bank: R(12000) }, netWorth: R(12000), spending: { from: '2025-03-01', to: '2025-03-31', amount: 0 } },
    ],
  },
  {
    name: 'Refunds reduce the expense and the card liability',
    steps: [
      { op: 'account', ref: 'card', kind: 'credit_card' },
      { op: 'expense', ref: 'buy', amount: R(4000), on: '2025-04-02', account: 'card', category: 'shopping.clothing' },
      { op: 'refund', ref: 'r1', amount: R(1500), on: '2025-04-06', account: 'card', refundOf: 'buy' },
      {
        op: 'check', debt: { card: R(2500) }, spending: { from: '2025-04-01', to: '2025-04-30', amount: R(2500) },
        categorySpending: { category: 'shopping.clothing', from: '2025-04-01', to: '2025-04-30', amount: R(2500) },
      },
      { op: 'fails', code: 'REFUND_EXCEEDS_ORIGINAL', step: { op: 'refund', amount: R(3000), on: '2025-04-07', account: 'card', refundOf: 'buy' } },
      { op: 'fails', code: 'HAS_REFUNDS', step: { op: 'delete', ref: 'buy' } },
      { op: 'fails', code: 'REFUND_EXCEEDS_ORIGINAL', step: { op: 'edit', ref: 'buy', amount: R(1000) } },
      { op: 'delete', ref: 'r1' },
      { op: 'check', debt: { card: R(4000) }, spending: { from: '2025-04-01', to: '2025-04-30', amount: R(4000) } },
    ],
  },
  {
    name: 'Refund to a cash account restores cash',
    steps: [
      { op: 'account', ref: 'cash', kind: 'cash', opening: R(1000), openingOn: '2025-04-01' },
      { op: 'expense', ref: 'buy', amount: R(600), on: '2025-04-02', account: 'cash', category: 'food.delivery' },
      { op: 'refund', amount: R(600), on: '2025-04-03', account: 'cash', refundOf: 'buy' },
      { op: 'check', balances: { cash: R(1000) }, spending: { from: '2025-04-01', to: '2025-04-30', amount: 0 } },
    ],
  },
  {
    name: 'Fees and interest are expenses on the card',
    steps: [
      { op: 'account', ref: 'card', kind: 'credit_card' },
      { op: 'expense', amount: R(499), on: '2025-05-01', account: 'card', category: 'fees.card' },
      { op: 'expense', amount: R(1250), on: '2025-05-02', account: 'card', category: 'fees.interest' },
      {
        op: 'check', debt: { card: R(1749) }, spending: { from: '2025-05-01', to: '2025-05-31', amount: R(1749) },
        categorySpending: { category: 'fees.interest', from: '2025-05-01', to: '2025-05-31', amount: R(1250) },
      },
    ],
  },
  {
    name: 'Statement balance and current debt are distinct',
    steps: [
      { op: 'account', ref: 'bank', kind: 'bank', opening: R(100000), openingOn: '2025-05-01' },
      { op: 'account', ref: 'card', kind: 'credit_card' },
      { op: 'cardSettings', account: 'card', statementDay: 15, dueDays: 20 },
      { op: 'expense', amount: R(6000), on: '2025-05-10', account: 'card', category: 'travel.flights' },
      { op: 'closeStatement', ref: 'st', account: 'card', periodEnd: '2025-05-15' },
      { op: 'expense', amount: R(2000), on: '2025-05-20', account: 'card', category: 'food.restaurants' },
      { op: 'check', statement: { ref: 'st', balance: R(6000), minimumDue: R(300), periodStart: '2025-04-16', dueOn: '2025-06-04' }, debt: { card: R(8000) } },
      { op: 'card_payment', amount: R(6000), on: '2025-05-25', from: 'bank', to: 'card' },
      { op: 'check', statement: { ref: 'st', balance: R(6000), minimumDue: R(300) }, debt: { card: R(2000) } },
      { op: 'closeStatement', ref: 'st2', account: 'card', periodEnd: '2025-06-15' },
      { op: 'check', statement: { ref: 'st2', balance: R(2000), minimumDue: R(200), periodStart: '2025-05-16' } },
      { op: 'fails', code: 'NOT_DUE', step: { op: 'closeStatement', ref: 'bad', account: 'card', periodEnd: '2025-06-14' } },
    ],
  },
  {
    name: 'A retried write with the same idempotency key creates nothing new',
    steps: [
      { op: 'account', ref: 'cash', kind: 'cash', opening: R(1000), openingOn: '2025-06-01' },
      { op: 'expense', ref: 'a', key: 'retry-key-0001', amount: R(250), on: '2025-06-02', account: 'cash', category: 'food.cafe' },
      { op: 'expense', ref: 'b', key: 'retry-key-0001', amount: R(250), on: '2025-06-02', account: 'cash', category: 'food.cafe' },
      { op: 'check', sameId: ['a', 'b'], balances: { cash: R(750) }, transactionCount: 1 },
    ],
  },
  {
    name: 'Budgets: category and overall reconcile; transfers and card payments excluded',
    steps: [
      { op: 'account', ref: 'bank', kind: 'bank', opening: R(50000), openingOn: '2025-07-01' },
      { op: 'account', ref: 'card', kind: 'credit_card' },
      { op: 'account', ref: 'cash', kind: 'cash' },
      { op: 'budget', category: null, amount: R(10000) },
      { op: 'budget', category: 'food', amount: R(3000), warnAtPct: 80 },
      { op: 'expense', amount: R(1500), on: '2025-07-02', account: 'bank', category: 'food.groceries' },
      { op: 'expense', amount: R(1000), on: '2025-07-03', account: 'card', category: 'food.restaurants' },
      { op: 'expense', amount: R(2000), on: '2025-07-04', account: 'card', category: 'transport.fuel' },
      { op: 'transfer', amount: R(5000), on: '2025-07-05', from: 'bank', to: 'cash' },
      { op: 'card_payment', amount: R(3000), on: '2025-07-06', from: 'bank', to: 'card' },
      { op: 'check', budget: { category: 'food', month: '2025-07', spent: R(2500), state: 'warning' } },
      { op: 'check', budget: { category: null, month: '2025-07', spent: R(4500), state: 'ok' } },
      { op: 'expense', amount: R(600), on: '2025-07-07', account: 'cash', category: 'food.cafe' },
      { op: 'check', budget: { category: 'food', month: '2025-07', spent: R(3100), state: 'over' } },
    ],
  },
  {
    name: 'Goal contributions are never expenses (earmark and account modes)',
    steps: [
      { op: 'account', ref: 'bank', kind: 'bank', opening: R(30000), openingOn: '2025-08-01' },
      { op: 'goal', ref: 'trip', mode: 'earmark', target: R(20000), account: 'bank' },
      { op: 'contribute', ref: 'c1', goal: 'trip', amount: R(5000), on: '2025-08-02', from: 'bank' },
      {
        op: 'check', goalProgress: { trip: R(5000) }, earmarked: R(5000), balances: { bank: R(30000) }, netWorth: R(30000),
        spending: { from: '2025-08-01', to: '2025-08-31', amount: 0 },
      },
      { op: 'editContribution', ref: 'c1', amount: R(7000) },
      { op: 'check', goalProgress: { trip: R(7000) }, earmarked: R(7000) },
      { op: 'goal', ref: 'fund', mode: 'account', target: R(100000) },
      { op: 'contribute', ref: 'c2', goal: 'fund', amount: R(10000), on: '2025-08-03', from: 'bank' },
      {
        op: 'check', goalProgress: { fund: R(10000) }, balances: { bank: R(20000), 'goal:fund': R(10000) }, netWorth: R(30000),
        availableCash: R(20000), spending: { from: '2025-08-01', to: '2025-08-31', amount: 0 }, income: { from: '2025-08-01', to: '2025-08-31', amount: 0 },
      },
      { op: 'editContribution', ref: 'c2', amount: R(12000) },
      { op: 'check', goalProgress: { fund: R(12000) }, balances: { bank: R(18000) } },
      { op: 'withdraw', goal: 'fund', amount: R(2000), on: '2025-08-04', to: 'bank' },
      { op: 'check', goalProgress: { fund: R(10000) }, balances: { bank: R(20000) }, netWorth: R(30000) },
      { op: 'deleteContribution', ref: 'c2' },
      { op: 'check', goalProgress: { fund: 0 }, balances: { bank: R(32000) } },
      { op: 'deleteContribution', ref: 'c1' },
      { op: 'check', goalProgress: { trip: 0 }, earmarked: 0, spending: { from: '2025-08-01', to: '2025-08-31', amount: 0 } },
    ],
  },
  {
    name: 'Reconciliation posts an adjustment that is neither income nor expense',
    steps: [
      { op: 'account', ref: 'bank', kind: 'bank', opening: R(10000), openingOn: '2025-09-01' },
      { op: 'expense', amount: R(1000), on: '2025-09-02', account: 'bank', category: 'other' },
      { op: 'reconcile', account: 'bank', actual: R(8750), asOf: '2025-09-05' },
      { op: 'check', balances: { bank: R(8750) }, spending: { from: '2025-09-01', to: '2025-09-30', amount: R(1000) }, income: { from: '2025-09-01', to: '2025-09-30', amount: 0 } },
      { op: 'reconcile', account: 'bank', actual: R(8750), asOf: '2025-09-06' },
      { op: 'check', label: 'matching balance posts nothing', balances: { bank: R(8750) } },
    ],
  },
  {
    name: 'Recurring jobs cannot duplicate; automatic mode posts once',
    steps: [
      { op: 'account', ref: 'bank', kind: 'bank', opening: R(50000), openingOn: '2025-01-01' },
      { op: 'rule', ref: 'rent', type: 'expense', amount: R(15000), account: 'bank', category: 'bills.rent', frequency: 'monthly', startOn: '2025-01-05', mode: 'automatic' },
      { op: 'materialize', ref: 'o1', rule: 'rent', due: '2025-01-05' },
      { op: 'materialize', ref: 'o1b', rule: 'rent', due: '2025-01-05' },
      { op: 'check', sameId: ['o1', 'o1b'], occurrence: { ref: 'o1', status: 'posted' }, occurrenceCount: { rule: 'rent', count: 1 }, transactionCount: 1, balances: { bank: R(35000) } },
      { op: 'fails', code: 'NOT_DUE', step: { op: 'materialize', rule: 'rent', due: '2025-01-06' } },
    ],
  },
  {
    name: 'Reminder mode waits for confirmation; skip records nothing',
    steps: [
      { op: 'account', ref: 'bank', kind: 'bank', opening: R(10000), openingOn: '2025-01-01' },
      { op: 'rule', ref: 'gym', type: 'expense', amount: R(1500), account: 'bank', category: 'health.fitness', frequency: 'monthly', startOn: '2025-02-01', mode: 'reminder' },
      { op: 'materialize', ref: 'feb', rule: 'gym', due: '2025-02-01' },
      { op: 'check', occurrence: { ref: 'feb', status: 'pending' }, transactionCount: 0, balances: { bank: R(10000) } },
      { op: 'confirm', ref: 'feb' },
      { op: 'check', occurrence: { ref: 'feb', status: 'posted' }, transactionCount: 1, balances: { bank: R(8500) } },
      { op: 'confirm', ref: 'feb' },
      { op: 'check', label: 'confirming twice posts once', transactionCount: 1 },
      { op: 'materialize', ref: 'mar', rule: 'gym', due: '2025-03-01' },
      { op: 'skip', ref: 'mar' },
      { op: 'check', occurrence: { ref: 'mar', status: 'skipped' }, transactionCount: 1 },
      { op: 'fails', code: 'OCCURRENCE_RESOLVED', step: { op: 'confirm', ref: 'mar' } },
    ],
  },
  {
    name: 'End-of-month schedules clamp (31st → 28th/29th/30th) without drifting',
    steps: [
      { op: 'account', ref: 'bank', kind: 'bank', opening: R(100000), openingOn: '2023-12-01' },
      { op: 'rule', ref: 'eom', type: 'expense', amount: R(100), account: 'bank', category: 'other', frequency: 'monthly', startOn: '2024-01-31', anchorDay: 31, mode: 'automatic' },
      { op: 'materialize', rule: 'eom', due: '2024-01-31' },
      { op: 'materialize', rule: 'eom', due: '2024-02-29' },
      { op: 'materialize', rule: 'eom', due: '2024-03-31' },
      { op: 'materialize', rule: 'eom', due: '2024-04-30' },
      { op: 'fails', code: 'NOT_DUE', step: { op: 'materialize', rule: 'eom', due: '2024-02-28' } },
      { op: 'fails', code: 'NOT_DUE', step: { op: 'materialize', rule: 'eom', due: '2024-03-29' } },
      { op: 'rule', ref: 'eom25', type: 'expense', amount: R(100), account: 'bank', category: 'other', frequency: 'monthly', startOn: '2025-01-31', anchorDay: 31, mode: 'automatic' },
      { op: 'materialize', rule: 'eom25', due: '2025-02-28' },
      { op: 'rule', ref: 'leap', type: 'expense', amount: R(100), account: 'bank', category: 'other', frequency: 'yearly', startOn: '2024-02-29', mode: 'automatic' },
      { op: 'materialize', rule: 'leap', due: '2025-02-28' },
      { op: 'fails', code: 'NOT_DUE', step: { op: 'materialize', rule: 'leap', due: '2025-03-01' } },
      { op: 'check', occurrenceCount: { rule: 'eom', count: 4 }, transactionCount: 6, balances: { bank: R(99400) } },
    ],
  },
  {
    name: 'Paused rules do not post; resuming never back-fills; cancelled cannot resume',
    steps: [
      { op: 'account', ref: 'bank', kind: 'bank', opening: R(10000), openingOn: '2024-01-01' },
      { op: 'rule', ref: 'r', type: 'expense', amount: R(100), account: 'bank', category: 'other', frequency: 'monthly', startOn: '2024-01-10', mode: 'automatic' },
      { op: 'ruleStatus', rule: 'r', status: 'paused' },
      { op: 'fails', code: 'RULE_INACTIVE', step: { op: 'materialize', rule: 'r', due: '2024-01-10' } },
      { op: 'ruleStatus', rule: 'r', status: 'active' },
      { op: 'fails', code: 'NOT_DUE', step: { op: 'materialize', rule: 'r', due: '2024-02-10' } },
      { op: 'ruleStatus', rule: 'r', status: 'cancelled' },
      { op: 'fails', code: 'RULE_INACTIVE', step: { op: 'ruleStatus', rule: 'r', status: 'active' } },
      { op: 'check', transactionCount: 0 },
    ],
  },
  {
    name: 'Subscriptions charge only through their recurring rule (no double charging)',
    steps: [
      { op: 'account', ref: 'card', kind: 'credit_card' },
      { op: 'subscription', ref: 'netflix', rule: 'netflixRule', amount: R(649), account: 'card', category: 'entertainment.streaming', startOn: '2025-03-12', mode: 'automatic' },
      { op: 'materialize', rule: 'netflixRule', due: '2025-03-12' },
      { op: 'materialize', rule: 'netflixRule', due: '2025-03-12' },
      { op: 'materialize', rule: 'netflixRule', due: '2025-04-12' },
      { op: 'check', transactionCount: 2, debt: { card: R(1298) }, spending: { from: '2025-03-01', to: '2025-04-30', amount: R(1298) } },
    ],
  },
  {
    name: 'Validation rules reject invalid postings identically',
    steps: [
      { op: 'account', ref: 'bank', kind: 'bank', opening: R(1000), openingOn: '2025-01-01' },
      { op: 'account', ref: 'cash', kind: 'cash' },
      { op: 'account', ref: 'card', kind: 'credit_card' },
      { op: 'fails', code: 'USE_CARD_PAYMENT', step: { op: 'transfer', amount: R(100), on: '2025-01-02', from: 'bank', to: 'card' } },
      { op: 'fails', code: 'SAME_ACCOUNT', step: { op: 'transfer', amount: R(100), on: '2025-01-02', from: 'bank', to: 'bank' } },
      { op: 'fails', code: 'INVALID_ACCOUNT_KIND', step: { op: 'card_payment', amount: R(100), on: '2025-01-02', from: 'card', to: 'bank' } },
      { op: 'fails', code: 'CATEGORY_KIND_MISMATCH', step: { op: 'expense', amount: R(100), on: '2025-01-02', account: 'bank', category: 'income.salary' } },
      { op: 'fails', code: 'CATEGORY_REQUIRED', step: { op: 'expense', amount: R(100), on: '2025-01-02', account: 'bank' } },
      { op: 'fails', code: 'INVALID_AMOUNT', step: { op: 'expense', amount: 0, on: '2025-01-02', account: 'bank', category: 'other' } },
      { op: 'fails', code: 'INVALID_AMOUNT', step: { op: 'expense', amount: -500, on: '2025-01-02', account: 'bank', category: 'other' } },
      { op: 'fails', code: 'INVALID_DATE', step: { op: 'expense', amount: R(1), on: '1999-12-31', account: 'bank', category: 'other' } },
      { op: 'fails', code: 'SENSITIVE_DATA', step: { op: 'expense', amount: R(1), on: '2025-01-02', account: 'bank', category: 'other', note: 'card 4111 1111 1111 1111' } },
      { op: 'archive', account: 'cash' },
      { op: 'fails', code: 'ACCOUNT_ARCHIVED', step: { op: 'expense', amount: R(1), on: '2025-01-02', account: 'cash', category: 'other' } },
      { op: 'check', transactionCount: 0, balances: { bank: R(1000) } },
    ],
  },
];
