import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsAnchored,
  dayOfWeek,
  daysInMonth,
  diffDays,
  formatRelativeDay,
  monthEnd,
  monthsBetween,
  shiftMonth,
  todayIST,
} from './dates';

describe('dates', () => {
  it('resolves today in Asia/Kolkata regardless of device zone', () => {
    expect(todayIST(new Date('2026-01-31T20:00:00Z'))).toBe('2026-02-01');
    expect(todayIST(new Date('2026-01-31T18:29:59Z'))).toBe('2026-01-31');
  });

  it('handles leap years and month lengths', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(monthEnd('2026-04')).toBe('2026-04-30');
  });

  it('clamps anchored months without drifting', () => {
    expect(addMonthsAnchored('2026-01-31', 1, 31)).toBe('2026-02-28');
    expect(addMonthsAnchored('2026-01-31', 2, 31)).toBe('2026-03-31');
    expect(addMonthsAnchored('2024-01-31', 1, 31)).toBe('2024-02-29');
    expect(addMonthsAnchored('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonthsAnchored('2024-02-29', 12, 29)).toBe('2025-02-28');
    expect(addMonthsAnchored('2024-02-29', 48, 29)).toBe('2028-02-29');
  });

  it('does day arithmetic', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(diffDays('2026-03-01', '2026-02-01')).toBe(28);
    expect(dayOfWeek('2026-10-10')).toBe(6);
  });

  it('iterates months', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(monthsBetween('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('formats relative days', () => {
    expect(formatRelativeDay('2026-10-10', '2026-10-10')).toBe('Today');
    expect(formatRelativeDay('2026-10-09', '2026-10-10')).toBe('Yesterday');
    expect(formatRelativeDay('2026-10-06', '2026-10-10')).toBe('Tuesday');
    expect(formatRelativeDay('2026-03-02', '2026-10-10')).toBe('2 Mar');
    expect(formatRelativeDay('2025-03-02', '2026-10-10')).toBe('2 Mar 2025');
  });
});
