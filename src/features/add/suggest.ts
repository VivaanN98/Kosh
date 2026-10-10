/**
 * Smart defaults for the Add sheet: most likely category and last-used account.
 * Pure functions so they are unit-tested and cheap.
 */
import { diffDays, type IsoDate } from '@/lib/dates';
import type { Account, Category, Transaction, Uuid } from '@/domain/types';

export type AddMode = 'expense' | 'income' | 'transfer';

/**
 * Rank categories for a transaction kind by recency-weighted frequency over the last 90 days.
 * A use today counts 1.0, decaying linearly to 0.2 at 90 days. Falls back to seed order.
 */
export function rankCategories(
  kind: 'expense' | 'income',
  categories: readonly Category[],
  transactions: readonly Transaction[],
  today: IsoDate,
): Category[] {
  const usable = categories.filter((c) => c.kind === kind && !c.archivedAt);
  const score = new Map<Uuid, number>();
  for (const t of transactions) {
    if (t.deletedAt || !t.categoryId) continue;
    if (kind === 'expense' ? t.type !== 'expense' : t.type !== 'income') continue;
    const age = diffDays(today, t.occurredOn);
    if (age < 0 || age > 90) continue;
    score.set(t.categoryId, (score.get(t.categoryId) ?? 0) + (1 - (0.8 * age) / 90));
  }
  return [...usable].sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0) || a.sortOrder - b.sortOrder);
}

export function mostLikelyCategory(
  kind: 'expense' | 'income',
  categories: readonly Category[],
  transactions: readonly Transaction[],
  today: IsoDate,
): Category | null {
  const ranked = rankCategories(kind, categories, transactions, today);
  const hasHistory = transactions.some((t) => !t.deletedAt && t.type === kind && t.categoryId);
  if (!hasHistory) {
    const fallbackKey = kind === 'expense' ? 'food' : 'income.salary';
    return ranked.find((c) => c.seedKey === fallbackKey) ?? ranked[0] ?? null;
  }
  return ranked[0] ?? null;
}

const LAST_KEY = 'kosh.lastAccount.';

export function rememberAccount(mode: AddMode, accountId: Uuid) {
  try {
    localStorage.setItem(LAST_KEY + mode, accountId);
  } catch {
    /* optional convenience */
  }
}

export function defaultAccount(mode: AddMode, accounts: readonly Account[], transactions: readonly Transaction[]): Account | null {
  const usable = accounts.filter((a) => !a.archivedAt && !a.isSystem && a.kind !== 'goal');
  let remembered: string | null = null;
  try {
    remembered = localStorage.getItem(LAST_KEY + mode);
  } catch {
    remembered = null;
  }
  const fromStorage = usable.find((a) => a.id === remembered);
  if (fromStorage) return fromStorage;
  const wantedType = mode === 'transfer' ? null : mode;
  const recent = transactions.find((t) => !t.deletedAt && (wantedType ? t.type === wantedType : t.type === 'transfer'));
  const fromHistory = recent && usable.find((a) => a.id === recent.accountId);
  if (fromHistory) return fromHistory;
  return usable.find((a) => a.kind === 'bank') ?? usable[0] ?? null;
}

/** Keypad input reducer on the amount string (max 10 integer digits, 2 decimals). */
export function pressKey(current: string, key: string): string {
  if (key === 'back') return current.slice(0, -1);
  if (key === 'clear') return '';
  if (key === '.') {
    if (current.includes('.')) return current;
    return current === '' ? '0.' : `${current}.`;
  }
  if (!/^\d$/.test(key)) return current;
  const [whole = '', frac] = current.split('.');
  if (frac !== undefined) return frac.length >= 2 ? current : `${current}${key}`;
  if (whole === '0') return key;
  if (whole.length >= 10) return current;
  return `${current}${key}`;
}
