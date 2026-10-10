import { describe, expect, it } from 'vitest';
import { mostLikelyCategory, pressKey, rankCategories } from './suggest';
import type { Category, Transaction } from '@/domain/types';

const cat = (id: string, sortOrder: number, kind: 'expense' | 'income' = 'expense', seedKey: string | null = null): Category => ({
  id, parentId: null, kind, name: id, icon: null, color: null, sortOrder, archivedAt: null, seedKey,
});
const t = (categoryId: string, occurredOn: string): Transaction => ({
  id: `${categoryId}-${occurredOn}`, type: 'expense', amount: 100, occurredOn, accountId: 'a', toAccountId: null, categoryId, merchant: null,
  note: null, paymentCardId: null, refundOf: null, idempotencyKey: 'k-00000000', deletedAt: null, version: 1, createdAt: '', updatedAt: '',
});

describe('Add sheet suggestions', () => {
  it('keypad builds amounts safely', () => {
    let v = '';
    for (const k of ['0', '5', '0', '0', '.', '2', '5', '9']) v = pressKey(v, k);
    expect(v).toBe('500.25');
    expect(pressKey('', '.')).toBe('0.');
    expect(pressKey('1.5', '.')).toBe('1.5');
    expect(pressKey('12', 'back')).toBe('1');
    expect(pressKey('9999999999', '9')).toBe('9999999999');
    expect(pressKey('123', 'clear')).toBe('');
  });

  it('ranks categories by recency-weighted frequency', () => {
    const cats = [cat('food', 1, 'expense', 'food'), cat('fuel', 2), cat('rent', 3)];
    const history = [t('fuel', '2026-10-09'), t('fuel', '2026-10-01'), t('rent', '2026-10-05'), t('food', '2026-07-01')];
    expect(rankCategories('expense', cats, history, '2026-10-10').map((c) => c.id)).toEqual(['fuel', 'rent', 'food']);
    expect(mostLikelyCategory('expense', cats, history, '2026-10-10')?.id).toBe('fuel');
  });

  it('falls back to Food & Dining with no history', () => {
    const cats = [cat('other', 1), cat('food', 2, 'expense', 'food')];
    expect(mostLikelyCategory('expense', cats, [], '2026-10-10')?.id).toBe('food');
  });
});
