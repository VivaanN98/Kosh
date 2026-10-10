import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KoshError } from '@/domain/errors';
import { SEED_ACCOUNTS, SEED_CARDS, SEED_CATEGORIES } from '@/domain/seed';
import { DEFAULT_ARTWORK } from '@/domain/cards/artwork';
import { adminClient, createTestUser, dbConfigured, deleteTestUser, type TestUser } from './helpers';

describe.skipIf(!dbConfigured)('Supabase security, RLS and reliability', () => {
  let alice: TestUser;
  let bob: TestUser;
  let aliceBank: string;
  let aliceTx: string;
  let otherCategory: string;

  beforeAll(async () => {
    alice = await createTestUser();
    bob = await createTestUser();
    await alice.repo.ensureSetup();
    await bob.repo.ensureSetup();
    aliceBank = (await alice.repo.createAccount({ name: 'Alice Bank', kind: 'bank', openingBalance: 100_000, openingOn: '2025-01-01' }, 'acct:alice-bank-1')).id;
    otherCategory = (await alice.repo.listCategories()).find((c) => c.seedKey === 'other')!.id;
    aliceTx = (
      await alice.repo.postTransaction({ type: 'expense', amount: 5_000, occurredOn: '2025-01-02', accountId: aliceBank, categoryId: otherCategory }, 'tx:alice-secret-1')
    ).id;
  });

  afterAll(async () => {
    await deleteTestUser(alice);
    await deleteTestUser(bob);
  });

  it('seeds categories, the two bank accounts and the two cards exactly once, matching the TS seed', async () => {
    await alice.repo.ensureSetup();
    await alice.repo.ensureSetup();
    const cats = await alice.repo.listCategories();
    const expected = SEED_CATEGORIES.flatMap((c) => [c.key, ...(c.children ?? []).map((ch) => ch.key)]);
    expect(cats.filter((c) => c.seedKey).map((c) => c.seedKey).sort()).toEqual([...expected].sort());
    for (const c of SEED_CATEGORIES) expect(cats.find((x) => x.seedKey === c.key)?.name).toBe(c.name);
    const accounts = await alice.repo.listAccounts();
    for (const a of SEED_ACCOUNTS) expect(accounts.filter((x) => x.seedKey === a.key)).toHaveLength(1);
    const cards = await alice.repo.listPaymentCards();
    for (const c of SEED_CARDS) {
      const card = cards.find((x) => x.seedKey === c.key);
      expect(card?.displayName).toBe(c.displayName);
      expect(card?.network).toBe(c.network);
      expect(card?.last4).toBeNull();
      expect(card?.accountId).toBe(accounts.find((a) => a.seedKey === c.accountKey)?.id);
    }
  });

  it('does not re-create a seeded card the user deleted', async () => {
    const card = (await bob.repo.listPaymentCards()).find((c) => c.seedKey === 'card.sbi.global')!;
    await bob.repo.deletePaymentCard(card.id);
    await bob.repo.ensureSetup();
    expect((await bob.repo.listPaymentCards()).some((c) => c.seedKey === 'card.sbi.global')).toBe(false);
  });

  it('RLS: another user cannot read accounts, transactions or ledger entries', async () => {
    for (const table of ['accounts', 'transactions', 'ledger_entries', 'payment_cards', 'categories'] as const) {
      const { data, error } = await bob.client.from(table).select('id').eq('user_id', alice.id);
      expect(error).toBeNull();
      expect(data, table).toEqual([]);
    }
    expect(await bob.repo.getTransaction(aliceTx)).toBeNull();
  });

  it('RLS: another user cannot update, delete or post against foreign rows', async () => {
    const upd = await bob.client.from('accounts').update({ name: 'pwned' }).eq('id', aliceBank).select('id');
    expect(upd.data ?? []).toEqual([]);
    await expect(bob.repo.deleteTransaction(aliceTx)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      bob.repo.updateTransaction(aliceTx, { type: 'expense', amount: 1, occurredOn: '2025-01-02', accountId: aliceBank, categoryId: otherCategory }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      bob.repo.postTransaction({ type: 'expense', amount: 100, occurredOn: '2025-01-02', accountId: aliceBank, categoryId: otherCategory }, 'tx:bob-attack-1'),
    ).rejects.toMatchObject({ code: 'ACCOUNT_NOT_FOUND' });
    const t = await alice.repo.getTransaction(aliceTx);
    expect(t?.deletedAt).toBeNull();
    expect(t?.amount).toBe(5_000);
  });

  it('the browser role cannot write ledger tables directly', async () => {
    const ins = await alice.client.from('ledger_entries').insert({
      user_id: alice.id, transaction_id: aliceTx, account_id: aliceBank, amount_paise: 999, occurred_on: '2025-01-02',
    });
    expect(ins.error).not.toBeNull();
    const tx = await alice.client.from('transactions').insert({
      user_id: alice.id, type: 'income', amount_paise: 999, occurred_on: '2025-01-02', account_id: aliceBank, idempotency_key: 'direct-insert-1',
    });
    expect(tx.error).not.toBeNull();
    const upd = await alice.client.from('transactions').update({ amount_paise: 1 }).eq('id', aliceTx);
    expect(upd.error).not.toBeNull();
    const del = await alice.client.from('ledger_entries').delete().eq('transaction_id', aliceTx);
    expect(del.error).not.toBeNull();
    const anon = adminClient(); // sanity: data still intact
    const { data } = await anon.from('ledger_entries').select('amount_paise').eq('transaction_id', aliceTx);
    expect(data).toHaveLength(2);
  });

  it('anonymous callers cannot execute ledger RPCs', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(process.env.SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { error } = await anon.rpc('post_transaction', { p_input: {}, p_idempotency_key: 'anon-attack-1' });
    expect(error).not.toBeNull();
  });

  it('concurrent retries with one idempotency key create exactly one transaction', async () => {
    const input = { type: 'expense' as const, amount: 1_234, occurredOn: '2025-01-03', accountId: aliceBank, categoryId: otherCategory };
    const results = await Promise.all(Array.from({ length: 5 }, () => alice.repo.postTransaction(input, 'tx:concurrent-retry-1')));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    const { data } = await alice.client.from('transactions').select('id').eq('idempotency_key', 'tx:concurrent-retry-1');
    expect(data).toHaveLength(1);
  });

  it('a failed write leaves nothing behind and can be retried without duplicates', async () => {
    const key = 'tx:retry-after-failure-1';
    await expect(
      alice.repo.postTransaction({ type: 'expense', amount: 700, occurredOn: '2025-01-04', accountId: aliceBank, categoryId: null }, key),
    ).rejects.toBeInstanceOf(KoshError);
    const before = await alice.client.from('transactions').select('id').eq('idempotency_key', key);
    expect(before.data).toEqual([]);
    const ok = await alice.repo.postTransaction({ type: 'expense', amount: 700, occurredOn: '2025-01-04', accountId: aliceBank, categoryId: otherCategory }, key);
    const again = await alice.repo.postTransaction({ type: 'expense', amount: 700, occurredOn: '2025-01-04', accountId: aliceBank, categoryId: otherCategory }, key);
    expect(again.id).toBe(ok.id);
  });

  it('card numbers and CVVs can never be persisted in any card or transaction text field', async () => {
    const base = { accountId: aliceBank, issuer: 'Test Bank', network: 'visa' as const, cardType: 'debit' as const, artwork: DEFAULT_ARTWORK, source: 'manual' as const };
    await expect(alice.repo.createPaymentCard({ ...base, displayName: '4111 1111 1111 1111' })).rejects.toBeInstanceOf(KoshError);
    await expect(alice.repo.createPaymentCard({ ...base, last4: '12345' })).rejects.toBeInstanceOf(KoshError);
    // Bypass the client-side checks entirely: the database itself must refuse.
    const raw = await alice.client.from('payment_cards').insert({
      user_id: alice.id, account_id: aliceBank, issuer: 'Bank 4111-1111-1111-1111', network: 'visa', card_type: 'debit', source: 'manual',
    });
    expect(raw.error).not.toBeNull();
    const rawArt = await alice.client.from('payment_cards').insert({
      user_id: alice.id, account_id: aliceBank, issuer: 'Bank', network: 'visa', card_type: 'debit', source: 'manual',
      artwork: { pan: '4111111111111111', cvv: '123' },
    });
    expect(rawArt.error).not.toBeNull();
    const rawLast4 = await alice.client.from('payment_cards').insert({
      user_id: alice.id, account_id: aliceBank, issuer: 'Bank', network: 'visa', card_type: 'debit', source: 'manual', last4: '4111111111111111',
    });
    expect(rawLast4.error).not.toBeNull();
    // There is no column that could hold a full number, CVV, expiry, PIN or photo.
    const { data } = await alice.client.from('payment_cards').select('*').limit(1);
    const columns = Object.keys(data?.[0] ?? {});
    for (const forbidden of ['number', 'pan', 'card_number', 'cvv', 'cvc', 'pin', 'expiry', 'photo', 'image']) {
      expect(columns).not.toContain(forbidden);
    }
    // Scan every stored card text column in the database for card-number-shaped data.
    const all = await adminClient().from('payment_cards').select('issuer, display_name, last4, artwork');
    for (const row of all.data ?? []) {
      expect(JSON.stringify(row).replace(/[\s-]/g, '')).not.toMatch(/\d{12,}/);
    }
  });

  it('a seeded card cannot be forged by the client', async () => {
    const forged = await alice.client.from('payment_cards').insert({
      user_id: alice.id, account_id: aliceBank, issuer: 'Fake', network: 'visa', card_type: 'debit', source: 'seed',
    });
    expect(forged.error).not.toBeNull();
  });

  it('category_totals (SQL) reconciles with the TypeScript metrics', async () => {
    const { data, error } = await alice.client.rpc('category_totals', { p_from: '2025-01-01', p_to: '2025-01-31' });
    expect(error).toBeNull();
    const sqlTotal = (data ?? []).filter((r: { kind: string }) => r.kind === 'expense').reduce((s: number, r: { total_paise: number }) => s + Number(r.total_paise), 0);
    const { totalSpending } = await import('@/domain/ledger/metrics');
    const entries = await alice.repo.listLedgerEntries();
    expect(sqlTotal).toBe(totalSpending(entries, await alice.repo.getSystemAccounts(), '2025-01-01', '2025-01-31'));
  });
});
