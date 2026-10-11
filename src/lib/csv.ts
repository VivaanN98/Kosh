import { toDecimalString } from './money';
import type { Snapshot } from '@/data/store';
import type { Transaction } from '@/domain/types';

export const CSV_COLUMNS = [
  'transaction_id',
  'date',
  'type',
  'amount_inr',
  'direction',
  'account',
  'to_account',
  'category',
  'category_group',
  'merchant',
  'note',
  'payment_card',
  'refund_of',
  'created_at',
] as const;

function cell(value: string | null | undefined, isText = true): string {
  let v = value ?? '';
  if (isText && /^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function direction(t: Transaction): 'out' | 'in' | 'move' {
  if (t.type === 'expense') return 'out';
  if (t.type === 'income' || t.type === 'refund') return 'in';
  if (t.type === 'opening_balance' || t.type === 'adjustment') return t.amount >= 0 ? 'in' : 'out';
  return 'move';
}

export function transactionsToCsv(snap: Pick<Snapshot, 'accounts' | 'categories' | 'cards'>, transactions: readonly Transaction[]): string {
  const accounts = new Map(snap.accounts.map((a) => [a.id, a.name]));
  const categories = new Map(snap.categories.map((c) => [c.id, c]));
  const cards = new Map(snap.cards.map((c) => [c.id, c.displayName ?? c.issuer]));
  const lines = [CSV_COLUMNS.join(',')];
  for (const t of transactions) {
    if (t.deletedAt) continue;
    const cat = t.categoryId ? categories.get(t.categoryId) : undefined;
    const group = cat?.parentId ? categories.get(cat.parentId)?.name : cat?.name;
    lines.push(
      [
        cell(t.id, false),
        cell(t.occurredOn, false),
        cell(t.type, false),
        cell(toDecimalString(t.amount), false),
        cell(direction(t), false),
        cell(accounts.get(t.accountId)),
        cell(t.toAccountId ? accounts.get(t.toAccountId) : ''),
        cell(cat?.name),
        cell(group),
        cell(t.merchant),
        cell(t.note),
        cell(t.paymentCardId ? cards.get(t.paymentCardId) : ''),
        cell(t.refundOf ?? '', false),
        cell(t.createdAt, false),
      ].join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

export function downloadTransactionsCsv(snap: Pick<Snapshot, 'accounts' | 'categories' | 'cards'>, transactions: readonly Transaction[], name = 'kosh-transactions') {
  const blob = new Blob(['﻿', transactionsToCsv(snap, transactions)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
