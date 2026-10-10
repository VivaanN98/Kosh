import { describe, expect, it } from 'vitest';
import { addDays } from '@/lib/dates';
import { describeSchedule, isScheduled, monthlyEquivalent, nextOccurrence, occurrencesBetween, type ScheduleRule } from './recurring';

const rule = (r: Partial<ScheduleRule>): ScheduleRule => ({
  frequency: 'monthly',
  interval: 1,
  startOn: '2024-01-31',
  endOn: null,
  anchorDay: null,
  ...r,
});

describe('recurring schedules', () => {
  it('clamps the 31st to shorter months without drifting', () => {
    expect(occurrencesBetween(rule({ anchorDay: 31 }), '2024-01-01', '2024-06-30')).toEqual([
      '2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30', '2024-05-31', '2024-06-30',
    ]);
    expect(occurrencesBetween(rule({ startOn: '2025-01-31', anchorDay: 31 }), '2025-02-01', '2025-03-31')).toEqual(['2025-02-28', '2025-03-31']);
  });

  it('handles leap-day yearly schedules', () => {
    const leap = rule({ frequency: 'yearly', startOn: '2024-02-29' });
    expect(occurrencesBetween(leap, '2024-01-01', '2028-12-31')).toEqual(['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
  });

  it('supports intervals, weekly and daily rules, end dates and activeFrom', () => {
    expect(occurrencesBetween(rule({ startOn: '2025-01-15', interval: 3 }), '2025-01-01', '2025-12-31')).toEqual([
      '2025-01-15', '2025-04-15', '2025-07-15', '2025-10-15',
    ]);
    expect(occurrencesBetween(rule({ frequency: 'weekly', startOn: '2025-01-06', interval: 2 }), '2025-01-01', '2025-02-10')).toEqual([
      '2025-01-06', '2025-01-20', '2025-02-03',
    ]);
    expect(occurrencesBetween(rule({ frequency: 'daily', startOn: '2025-01-01', endOn: '2025-01-03' }), '2025-01-01', '2025-01-31')).toEqual([
      '2025-01-01', '2025-01-02', '2025-01-03',
    ]);
    expect(occurrencesBetween(rule({ startOn: '2025-01-10', activeFrom: '2025-04-01' }), '2025-01-01', '2025-05-31')).toEqual([
      '2025-04-10', '2025-05-10',
    ]);
  });

  it('a start date before the anchor waits for the anchor in that month', () => {
    expect(occurrencesBetween(rule({ startOn: '2025-01-15', anchorDay: 31 }), '2025-01-01', '2025-02-28')).toEqual(['2025-01-31', '2025-02-28']);
  });

  it('generator and predicate agree on every day for many rules', () => {
    const rules: ScheduleRule[] = [
      rule({ anchorDay: 31 }),
      rule({ anchorDay: 30, interval: 2 }),
      rule({ startOn: '2024-03-15' }),
      rule({ frequency: 'weekly', startOn: '2024-01-03', interval: 3 }),
      rule({ frequency: 'daily', startOn: '2024-02-27', interval: 4 }),
      rule({ frequency: 'yearly', startOn: '2024-02-29' }),
      rule({ frequency: 'yearly', startOn: '2024-12-31', interval: 2 }),
    ];
    for (const r of rules) {
      const generated = new Set(occurrencesBetween(r, '2024-01-01', '2027-12-31'));
      for (let d = '2024-01-01'; d <= '2027-12-31'; d = addDays(d, 1)) {
        expect(generated.has(d), `${JSON.stringify(r)} @ ${d}`).toBe(isScheduled(r, d));
      }
    }
  });

  it('finds the next occurrence and describes schedules', () => {
    expect(nextOccurrence(rule({ anchorDay: 31 }), '2025-02-10')).toBe('2025-02-28');
    expect(describeSchedule(rule({ anchorDay: 31 }))).toBe('Monthly on the 31st (or last day)');
    expect(describeSchedule(rule({ startOn: '2025-01-02' }))).toBe('Monthly on the 2nd');
    expect(describeSchedule(rule({ frequency: 'weekly', interval: 2 }))).toBe('Every 2 weeks');
    expect(monthlyEquivalent(120000, 'yearly', 1)).toBe(10000);
  });
});
