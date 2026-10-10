/**
 * Recurring schedules. `isScheduled` mirrors private.is_scheduled in SQL; the server rejects any
 * date this module would not produce, and a unique (rule_id, due_on) constraint makes
 * materialisation idempotent.
 */
import {
  addDays,
  addMonthsAnchored,
  daysInMonth,
  diffDays,
  parseIso,
  toIso,
  type IsoDate,
} from '@/lib/dates';
import type { Frequency, RecurringRule } from './types';

export type ScheduleRule = Pick<RecurringRule, 'frequency' | 'interval' | 'startOn' | 'endOn' | 'anchorDay'> & {
  activeFrom?: IsoDate | null;
};

function anchorOf(rule: ScheduleRule): number {
  return rule.anchorDay ?? parseIso(rule.startOn).d;
}

export function isScheduled(rule: ScheduleRule, date: IsoDate): boolean {
  if (date < rule.startOn || (rule.endOn && date > rule.endOn)) return false;
  const interval = Math.max(1, rule.interval);
  const s = parseIso(rule.startOn);
  const d = parseIso(date);
  switch (rule.frequency) {
    case 'daily':
      return diffDays(date, rule.startOn) % interval === 0;
    case 'weekly':
      return diffDays(date, rule.startOn) % (7 * interval) === 0;
    case 'monthly': {
      const months = d.y * 12 + d.m - (s.y * 12 + s.m);
      return months % interval === 0 && d.d === Math.min(anchorOf(rule), daysInMonth(d.y, d.m));
    }
    case 'yearly':
      return (
        d.m === s.m && (d.y - s.y) % interval === 0 && d.d === Math.min(anchorOf(rule), daysInMonth(d.y, d.m))
      );
  }
}

/** The k-th scheduled date candidate (k ≥ 0); may precede startOn for monthly/yearly anchors. */
function nth(rule: ScheduleRule, k: number): IsoDate {
  const interval = Math.max(1, rule.interval);
  switch (rule.frequency) {
    case 'daily':
      return addDays(rule.startOn, k * interval);
    case 'weekly':
      return addDays(rule.startOn, k * 7 * interval);
    case 'monthly':
      return addMonthsAnchored(toIso({ ...parseIso(rule.startOn), d: 1 }), k * interval, anchorOf(rule));
    case 'yearly':
      return addMonthsAnchored(toIso({ ...parseIso(rule.startOn), d: 1 }), k * 12 * interval, anchorOf(rule));
  }
}

/** Scheduled dates in [from, to], honouring startOn, endOn and activeFrom. */
export function occurrencesBetween(rule: ScheduleRule, from: IsoDate, to: IsoDate, limit = 1000): IsoDate[] {
  const out: IsoDate[] = [];
  const lower = [rule.startOn, from, rule.activeFrom ?? rule.startOn].sort().at(-1)!;
  const upper = rule.endOn && rule.endOn < to ? rule.endOn : to;
  if (lower > upper) return out;
  for (let k = 0; out.length < limit; k++) {
    const date = nth(rule, k);
    if (date > upper) break;
    if (date >= lower && isScheduled(rule, date)) out.push(date);
  }
  return out;
}

export function nextOccurrence(rule: ScheduleRule, after: IsoDate): IsoDate | null {
  const horizon = addDays(after, 366 * Math.max(1, rule.interval) + 1);
  return occurrencesBetween(rule, addDays(after, 1), horizon, 1)[0] ?? null;
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

export function describeSchedule(rule: ScheduleRule): string {
  const n = Math.max(1, rule.interval);
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[rule.frequency];
  const every = n === 1 ? FREQUENCY_LABEL[rule.frequency] : `Every ${n} ${unit}s`;
  if (rule.frequency === 'monthly') {
    const day = anchorOf(rule);
    return `${every} on the ${day >= 29 ? `${ordinal(day)} (or last day)` : ordinal(day)}`;
  }
  return every;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Monthly-equivalent cost in paise (for subscription totals), integer-rounded. */
export function monthlyEquivalent(amount: number, frequency: Frequency, interval: number): number {
  const n = Math.max(1, interval);
  switch (frequency) {
    case 'daily':
      return Math.round((amount * 365) / 12 / n);
    case 'weekly':
      return Math.round((amount * 52) / 12 / n);
    case 'monthly':
      return Math.round(amount / n);
    case 'yearly':
      return Math.round(amount / 12 / n);
  }
}
