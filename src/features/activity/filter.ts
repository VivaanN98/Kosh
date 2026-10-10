import { parseRupees } from '@/lib/money';
import type { Derived } from '@/data/hooks';
import type { Transaction } from '@/domain/types';

export type TypeFilter = 'all' | 'expense' | 'income' | 'transfer';

export function typeMatches(t: Transaction, f: TypeFilter): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'expense':
      return t.type === 'expense' || t.type === 'refund';
    case 'income':
      return t.type === 'income';
    case 'transfer':
      return t.type === 'transfer' || t.type === 'card_payment' || t.type === 'goal_transfer';
  }
}

/** Case-insensitive match on merchant, note, category (and its parent), account names, or exact amount. */
export function matchesQuery(t: Transaction, raw: string, d: Pick<Derived, 'accountById' | 'categoryById'>): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const amount = parseRupees(q);
  if (amount !== null && Math.abs(t.amount) === amount) return true;
  const cat = t.categoryId ? d.categoryById.get(t.categoryId) : undefined;
  const parent = cat?.parentId ? d.categoryById.get(cat.parentId) : undefined;
  const haystack = [
    t.merchant,
    t.note,
    cat?.name,
    parent?.name,
    d.accountById.get(t.accountId)?.name,
    t.toAccountId ? d.accountById.get(t.toAccountId)?.name : null,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return q.split(/\s+/).every((word) => haystack.includes(word));
}
