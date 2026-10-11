import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { balancesByAccount, netPosition, totalSpending } from '@/domain/ledger/metrics';
import { monthEnd, monthKey, monthStart, todayIST } from '@/lib/dates';
import { toDecimalString } from '@/lib/money';
import { createTestUser, dbConfigured, deleteTestUser, type TestUser } from './helpers';

describe.skipIf(!dbConfigured)('assistant query functions', () => {
  let alice: TestUser;
  let bob: TestUser;
  const today = todayIST();
  const month = monthKey(today);

  beforeAll(async () => {
    alice = await createTestUser();
    bob = await createTestUser();
    await alice.repo.ensureSetup();
    const cats = await alice.repo.listCategories();
    const cat = (k: string) => cats.find((c) => c.seedKey === k)!.id;
    const bank = await alice.repo.createAccount({ name: 'Main Bank', kind: 'bank', openingBalance: 5_000_000, openingOn: monthStart(month) }, 'acct:assist-bank');
    const card = await alice.repo.createAccount({ name: 'Rewards Card', kind: 'credit_card' }, 'acct:assist-card');
    await alice.repo.postTransaction({ type: 'expense', amount: 120_000, occurredOn: monthStart(month), accountId: bank.id, categoryId: cat('food.groceries'), merchant: 'FreshBasket' }, 'tx:assist-1');
    await alice.repo.postTransaction({ type: 'expense', amount: 80_000, occurredOn: monthStart(month), accountId: card.id, categoryId: cat('food.restaurants'), merchant: 'Saffron Table' }, 'tx:assist-2');
    await alice.repo.postTransaction({ type: 'income', amount: 9_000_000, occurredOn: monthStart(month), accountId: bank.id, categoryId: cat('income.salary') }, 'tx:assist-3');
    await alice.repo.upsertBudget({ categoryId: cat('food'), amount: 150_000, warnAtPct: 80 });
    const goal = await alice.repo.createGoal({ name: 'Trip', target: 1_000_000, mode: 'earmark' });
    await alice.repo.addGoalContribution({ goalId: goal.id, amount: 250_000, accountId: bank.id }, 'gc:assist-1');
  });

  afterAll(async () => {
    await deleteTestUser(alice);
    await deleteTestUser(bob);
  });

  it('overview matches the ledger metrics', async () => {
    const { data, error } = await alice.client.rpc('assistant_overview');
    expect(error).toBeNull();
    const [accounts, entries] = await Promise.all([alice.repo.listAccounts(), alice.repo.listLedgerEntries()]);
    const pos = netPosition(accounts, balancesByAccount(entries));
    expect(data.net_worth_inr).toBe(toDecimalString(pos.netWorth));
    expect(data.available_cash_inr).toBe(toDecimalString(pos.availableCash));
    expect(data.card_debt_inr).toBe('800.00');
  });

  it('spending by category and parent category reconciles with total spending', async () => {
    const sys = await alice.repo.getSystemAccounts();
    const entries = await alice.repo.listLedgerEntries();
    const expected = toDecimalString(totalSpending(entries, sys, monthStart(month), monthEnd(month)));
    const { data } = await alice.client.rpc('assistant_spending', { p_from: monthStart(month), p_to: monthEnd(month), p_group_by: 'parent_category' });
    expect(data.total_inr).toBe(expected);
    expect(data.groups).toEqual([{ label: 'Food & Dining', amount_inr: '2000.00', entries: 2 }]);
  });

  it('budgets include subcategories and report state', async () => {
    const { data } = await alice.client.rpc('assistant_budgets', { p_month: monthStart(month) });
    expect(data.budgets).toEqual([expect.objectContaining({ name: 'Food & Dining', spent_inr: '2000.00', remaining_inr: '-500.00', state: 'over' })]);
  });

  it('goals, transactions and upcoming items work', async () => {
    const goals = await alice.client.rpc('assistant_goals');
    expect(goals.data.goals[0]).toMatchObject({ name: 'Trip', saved_inr: '2500.00', progress_percent: 25 });
    const tx = await alice.client.rpc('assistant_find_transactions', { p_text: 'fresh' });
    expect(tx.data.transactions).toHaveLength(1);
    expect(tx.data.transactions[0]).toMatchObject({ merchant: 'FreshBasket', amount_inr: '1200.00', category: 'Groceries' });
    const up = await alice.client.rpc('assistant_upcoming', { p_days: 30 });
    expect(up.error).toBeNull();
  });

  it('another user sees none of it', async () => {
    const tx = await bob.client.rpc('assistant_find_transactions', {});
    expect(tx.data.transactions).toEqual([]);
    const ov = await bob.client.rpc('assistant_overview');
    expect(ov.data.this_month_spending_inr).toBe('0.00');
  });

  it('never exposes card details', async () => {
    const results = await Promise.all([
      alice.client.rpc('assistant_overview'),
      alice.client.rpc('assistant_find_transactions', {}),
    ]);
    const text = JSON.stringify(results.map((r) => r.data));
    expect(text).not.toMatch(/last4|payment_card|network|issuer/);
  });
});
