/**
 * Credit card statement cycles. A statement is a snapshot of debt at the statement date;
 * current debt is always the live ledger balance. Mirrors public.close_card_statement.
 */
import { addDays, addMonthsAnchored, daysInMonth, parseIso, toIso, type IsoDate } from '@/lib/dates';
import { applyBps, max, min, type Paise } from '@/lib/money';
import type { CardStatement, CreditCardSettings } from './types';

export function statementDateIn(year: number, month: number, statementDay: number): IsoDate {
  return toIso({ y: year, m: month, d: Math.min(statementDay, daysInMonth(year, month)) });
}

export function isStatementDate(date: IsoDate, statementDay: number): boolean {
  const { y, m, d } = parseIso(date);
  return d === Math.min(statementDay, daysInMonth(y, m));
}

/** Most recent statement date on or before `onOrBefore`. */
export function lastStatementDate(onOrBefore: IsoDate, statementDay: number): IsoDate {
  const { y, m } = parseIso(onOrBefore);
  const thisMonth = statementDateIn(y, m, statementDay);
  if (thisMonth <= onOrBefore) return thisMonth;
  const prev = parseIso(addMonthsAnchored(toIso({ y, m, d: 1 }), -1, 1));
  return statementDateIn(prev.y, prev.m, statementDay);
}

export function previousStatementDate(statementDate: IsoDate, statementDay: number): IsoDate {
  const prev = parseIso(addMonthsAnchored(toIso({ ...parseIso(statementDate), d: 1 }), -1, 1));
  return statementDateIn(prev.y, prev.m, statementDay);
}

export function nextStatementDate(after: IsoDate, statementDay: number): IsoDate {
  const { y, m } = parseIso(after);
  const thisMonth = statementDateIn(y, m, statementDay);
  if (thisMonth > after) return thisMonth;
  const next = parseIso(addMonthsAnchored(toIso({ y, m, d: 1 }), 1, 1));
  return statementDateIn(next.y, next.m, statementDay);
}

export function minimumDue(balance: Paise, settings: Pick<CreditCardSettings, 'minDueBps' | 'minDueFloor'>): Paise {
  if (balance <= 0) return 0;
  return min(balance, max(settings.minDueFloor, applyBps(balance, settings.minDueBps)));
}

export function statementPeriod(
  periodEnd: IsoDate,
  statementDay: number,
  previousEnd: IsoDate | null,
): { periodStart: IsoDate; periodEnd: IsoDate } {
  const periodStart = previousEnd ? addDays(previousEnd, 1) : addDays(previousStatementDate(periodEnd, statementDay), 1);
  return { periodStart, periodEnd };
}

export interface StatementStatus {
  statement: CardStatement;
  /** Payments/credits posted to the card after the statement date. */
  paidSince: Paise;
  /** What is still owed against this statement (never negative). */
  remaining: Paise;
  minimumRemaining: Paise;
  isPaid: boolean;
}

export function statementStatus(statement: CardStatement, paidSince: Paise): StatementStatus {
  const remaining = max(0, statement.statementBalance - paidSince);
  return {
    statement,
    paidSince,
    remaining,
    minimumRemaining: max(0, statement.minimumDue - paidSince),
    isPaid: remaining === 0,
  };
}
