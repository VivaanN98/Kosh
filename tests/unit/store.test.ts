import { describe, expect, it } from 'vitest';
import { AppStore } from '@/data/store';
import { DemoRepository } from '@/data/demo/demoRepository';
import { DemoStore } from '@/data/demo/store';
import { KoshError } from '@/domain/errors';
import { totalSpending } from '@/domain/ledger/metrics';
import type { Repository } from '@/data/repository';

async function setup(wrap: (repo: DemoRepository) => Repository = (r) => r) {
  const demo = new DemoRepository(DemoStore.memory(), { today: () => '2026-10-10' });
  await demo.ensureSetup();
  await demo.createAccount({ name: 'Test Bank', kind: 'bank' }, 'acct:test-bank');
  const store = new AppStore(wrap(demo));
  await store.load();
  const bank = store.getSnapshot().accounts.find((a) => a.name === 'Test Bank')!;
  const food = store.getSnapshot().categories.find((c) => c.seedKey === 'food')!;
  return { demo, store, bank, food };
}

describe('AppStore optimistic writes', () => {
  it('shows the transaction instantly with correct derived numbers, then confirms', async () => {
    const { store, bank, food } = await setup();
    const { optimistic, done } = store.beginPost({ type: 'expense', amount: 50000, occurredOn: '2026-10-05', accountId: bank.id, categoryId: food.id }, 'tx:optimistic-1');
    const s = store.getSnapshot();
    expect(s.transactions.some((t) => t.id === optimistic.id)).toBe(true);
    expect(s.pending.has(optimistic.id)).toBe(true);
    expect(totalSpending(s.entries, s.system!, '2026-10-01', '2026-10-31')).toBe(50000);
    const saved = await done;
    const after = store.getSnapshot();
    expect(after.pending.size).toBe(0);
    expect(after.transactions.filter((t) => t.amount === 50000)).toHaveLength(1);
    expect(after.transactions[0]!.id).toBe(saved.id);
  });

  it('rejects invalid input synchronously without touching state', async () => {
    const { store, bank } = await setup();
    const before = store.getSnapshot().transactions.length;
    expect(() => store.beginPost({ type: 'expense', amount: 50000, occurredOn: '2026-10-05', accountId: bank.id, categoryId: null }, 'tx:invalid-1')).toThrow(KoshError);
    expect(store.getSnapshot().transactions.length).toBe(before);
  });

  it('a lost response is retried with the same key and never duplicates', async () => {
    let calls = 0;
    const { store, demo, bank, food } = await setup(
      (repo) =>
        new Proxy(repo, {
          get(target, prop, receiver) {
            if (prop === 'postTransaction') {
              return async (...args: Parameters<Repository['postTransaction']>) => {
                calls++;
                const result = await target.postTransaction(...args);
                if (calls === 1) throw new KoshError('NETWORK', 'connection reset after commit');
                return result;
              };
            }
            return Reflect.get(target, prop, receiver);
          },
        }),
    );
    await store.postTransaction({ type: 'expense', amount: 70000, occurredOn: '2026-10-05', accountId: bank.id, categoryId: food.id }, 'tx:lost-response-1');
    expect(calls).toBe(2);
    expect((await demo.listTransactions()).filter((t) => t.amount === 70000)).toHaveLength(1);
  });

  it('rolls back when the server rejects', async () => {
    const { store, bank, food } = await setup(
      (repo) =>
        new Proxy(repo, {
          get(target, prop, receiver) {
            if (prop === 'postTransaction') return async () => Promise.reject(new KoshError('ACCOUNT_ARCHIVED'));
            return Reflect.get(target, prop, receiver);
          },
        }),
    );
    const before = store.getSnapshot();
    await expect(store.postTransaction({ type: 'expense', amount: 9900, occurredOn: '2026-10-05', accountId: bank.id, categoryId: food.id }, 'tx:rejected-1')).rejects.toMatchObject({ code: 'ACCOUNT_ARCHIVED' });
    const after = store.getSnapshot();
    expect(after.transactions).toHaveLength(before.transactions.length);
    expect(after.entries).toHaveLength(before.entries.length);
    expect(after.pending.size).toBe(0);
  });

  it('delete + restore (undo) round-trips through the store', async () => {
    const { store, bank, food } = await setup();
    const t = await store.postTransaction({ type: 'expense', amount: 12000, occurredOn: '2026-10-05', accountId: bank.id, categoryId: food.id }, 'tx:undo-1');
    await store.deleteTransaction(t.id);
    let s = store.getSnapshot();
    expect(totalSpending(s.entries, s.system!, '2026-10-01', '2026-10-31')).toBe(0);
    await store.restoreTransaction(t.id);
    s = store.getSnapshot();
    expect(totalSpending(s.entries, s.system!, '2026-10-01', '2026-10-31')).toBe(12000);
  });

  it('scheduled jobs materialise automatic and reminder rules once and close statements', async () => {
    const { store, demo, bank, food } = await setup();
    const card = await demo.createAccount({ name: 'Card', kind: 'credit_card', statementDay: 15, dueDays: 20 }, 'acct:sched-card');
    await demo.postTransaction({ type: 'expense', amount: 300000, occurredOn: '2026-08-20', accountId: card.id, categoryId: food.id }, 'tx:sched-card-buy');
    const rent = await demo.createRecurringRule({ name: 'Rent', type: 'expense', amount: 1000000, accountId: bank.id, categoryId: food.id, frequency: 'monthly', startOn: '2026-08-31', anchorDay: 31, mode: 'automatic' });
    const gym = await demo.createRecurringRule({ name: 'Gym', type: 'expense', amount: 150000, accountId: bank.id, categoryId: food.id, frequency: 'monthly', startOn: '2026-09-03', mode: 'reminder' });
    await store.load();
    await store.runScheduledJobs('2026-10-10');
    await store.runScheduledJobs('2026-10-10');
    const s = store.getSnapshot();
    const rentOcc = s.occurrences.filter((o) => o.ruleId === rent.id).map((o) => [o.dueOn, o.status]);
    expect(rentOcc).toEqual([['2026-08-31', 'posted'], ['2026-09-30', 'posted']]);
    expect(s.occurrences.filter((o) => o.ruleId === gym.id).map((o) => o.status)).toEqual(['pending', 'pending']);
    expect(s.transactions.filter((t) => t.amount === 1000000)).toHaveLength(2);
    expect(s.transactions.filter((t) => t.amount === 150000)).toHaveLength(0);
    const statements = s.statements.filter((x) => x.accountId === card.id).map((x) => [x.periodEnd, x.statementBalance]);
    expect(statements).toContainEqual(['2026-09-15', 300000]);
  });
});
