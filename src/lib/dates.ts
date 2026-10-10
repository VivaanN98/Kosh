/**
 * Dates: calendar dates are ISO strings "YYYY-MM-DD" interpreted in Asia/Kolkata.
 *
 * Ledger dates are calendar dates, not instants, so all arithmetic here is pure integer
 * y/m/d math. The only place a time zone matters is "what is today", which is resolved in
 * Asia/Kolkata regardless of the device's zone.
 */
import { TZDate } from '@date-fns/tz';
import { format as dfFormat } from 'date-fns';

export const APP_TIME_ZONE = 'Asia/Kolkata';

export type IsoDate = string; // YYYY-MM-DD
export type MonthKey = string; // YYYY-MM

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface Ymd {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

export function parseIso(date: IsoDate): Ymd {
  const match = ISO_RE.exec(date);
  if (!match) throw new RangeError(`Invalid ISO date: ${date}`);
  const ymd = { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
  if (ymd.m < 1 || ymd.m > 12 || ymd.d < 1 || ymd.d > daysInMonth(ymd.y, ymd.m)) {
    throw new RangeError(`Invalid ISO date: ${date}`);
  }
  return ymd;
}

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  try {
    parseIso(value);
    return true;
  } catch {
    return false;
  }
}

export function toIso({ y, m, d }: Ymd): IsoDate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Today's calendar date in Asia/Kolkata. */
export function todayIST(now: Date = new Date()): IsoDate {
  const z = new TZDate(now.getTime(), APP_TIME_ZONE);
  return toIso({ y: z.getFullYear(), m: z.getMonth() + 1, d: z.getDate() });
}

/** Days since 1970-01-01 for a calendar date (proleptic Gregorian, no time zone involved). */
export function toDayNumber(date: IsoDate): number {
  const { y, m, d } = parseIso(date);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function fromDayNumber(n: number): IsoDate {
  const dt = new Date(n * 86_400_000);
  return toIso({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromDayNumber(toDayNumber(date) + days);
}

export function diffDays(later: IsoDate, earlier: IsoDate): number {
  return toDayNumber(later) - toDayNumber(earlier);
}

/** Day-of-week, 0 = Sunday. */
export function dayOfWeek(date: IsoDate): number {
  return (((toDayNumber(date) + 4) % 7) + 7) % 7;
}

/**
 * Add months keeping an anchor day, clamped to the month's length.
 * Anchor 31 from Jan 31 gives Feb 28/29, then Mar 31 (no drift).
 */
export function addMonthsAnchored(date: IsoDate, months: number, anchorDay?: number): IsoDate {
  const { y, m, d } = parseIso(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const day = Math.min(anchorDay ?? d, daysInMonth(ny, nm));
  return toIso({ y: ny, m: nm, d: day });
}

export function monthKey(date: IsoDate): MonthKey {
  return date.slice(0, 7);
}

export function monthStart(key: MonthKey): IsoDate {
  return `${key}-01`;
}

export function monthEnd(key: MonthKey): IsoDate {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  return toIso({ y, m, d: daysInMonth(y, m) });
}

export function shiftMonth(key: MonthKey, delta: number): MonthKey {
  return monthKey(addMonthsAnchored(monthStart(key), delta, 1));
}

/** Inclusive list of month keys from `from` to `to`. */
export function monthsBetween(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let k = from; k <= to; k = shiftMonth(k, 1)) out.push(k);
  return out;
}

export function compareIso(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function inRange(date: IsoDate, from: IsoDate, to: IsoDate): boolean {
  return date >= from && date <= to;
}

/** A local Date at midnight for display formatting only (never for arithmetic). */
function displayDate(date: IsoDate): Date {
  const { y, m, d } = parseIso(date);
  return new Date(y, m - 1, d);
}

export function formatDate(date: IsoDate, pattern = 'd MMM yyyy'): string {
  return dfFormat(displayDate(date), pattern);
}

export function formatMonth(key: MonthKey, pattern = 'MMMM yyyy'): string {
  return dfFormat(displayDate(monthStart(key)), pattern);
}

/** "Today", "Yesterday", weekday within a week, else "12 Mar" (with year if not current). */
export function formatRelativeDay(date: IsoDate, today: IsoDate = todayIST()): string {
  const diff = diffDays(today, date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return dfFormat(displayDate(date), 'EEEE');
  return date.slice(0, 4) === today.slice(0, 4) ? formatDate(date, 'd MMM') : formatDate(date, 'd MMM yyyy');
}
