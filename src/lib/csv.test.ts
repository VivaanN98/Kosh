import { describe, expect, it } from 'vitest';
import { CSV_COLUMNS, transactionsToCsv } from './csv';
import type { Transaction } from '@/domain/types';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 't1', type: 'expense', amount: 123450, occurredOn: '2026-10-01', accountId: 'a1', toAccountId: null, categoryId: 'c2',
  merchant: 'Café, "Bean"', note: '=HYPERLINK("x")', paymentCardId: 'k1', refundOf: null, idempotencyKey: 'key-123456',
  deletedAt: null, version: 1, createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z', ...over,
});

const snap = {
  accounts: [{ id: 'a1', name: 'SBI Savings' }, { id: 'a2', name: 'Wallet' }],
  categories: [{ id: 'c1', name: 'Food & Dining', parentId: null }, { id: 'c2', name: 'Coffee & Snacks', parentId: 'c1' }],
  cards: [{ id: 'k1', displayName: 'SBI Global International', issuer: 'SBI' }],
} as never;

describe('CSV export', () => {
  it('has exactly the documented columns', () => {
    const csv = transactionsToCsv(snap, []);
    expect(csv.split('\r\n')[0]).toBe(
      'transaction_id,date,type,amount_inr,direction,account,to_account,category,category_group,merchant,note,payment_card,refund_of,created_at',
    );
    expect(CSV_COLUMNS).toHaveLength(14);
  });

  it('writes plain decimal rupees, escapes quotes/commas and neutralises formulas', () => {
    const csv = transactionsToCsv(snap, [tx({}), tx({ id: 't2', type: 'transfer', amount: 50000, toAccountId: 'a2', categoryId: null, merchant: null, note: null, paymentCardId: null })]);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe(
      't1,2026-10-01,expense,1234.50,out,SBI Savings,,Coffee & Snacks,Food & Dining,"Café, ""Bean""","\'=HYPERLINK(""x"")",SBI Global International,,2026-10-01T10:00:00Z',
    );
    expect(lines[2]).toContain('t2,2026-10-01,transfer,500.00,move,SBI Savings,Wallet');
  });

  it('skips deleted transactions', () => {
    const csv = transactionsToCsv(snap, [tx({ deletedAt: '2026-10-02T00:00:00Z' })]);
    expect(csv.trim().split('\r\n')).toHaveLength(1);
  });
});
