import type { IsoDate } from '@/lib/dates';
import type { Paise } from '@/lib/money';
import type { LedgerEntry, Transaction, Uuid } from '@/domain/types';

/**
 * Payments and credits that reduced a card's debt after a statement date (card payments,
 * refunds, cashback) — what has been paid against that statement so far.
 */
export function paidSince(entries: readonly LedgerEntry[], transactions: readonly Transaction[], cardAccountId: Uuid, statementDate: IsoDate): Paise {
  const types = new Map(transactions.map((t) => [t.id, t.type]));
  let total = 0;
  for (const e of entries) {
    if (e.accountId !== cardAccountId || e.occurredOn <= statementDate || e.amount <= 0) continue;
    const type = types.get(e.transactionId);
    if (type === 'card_payment' || type === 'refund' || type === 'income' || type === 'transfer' || type === 'adjustment') total += e.amount;
  }
  return total;
}
