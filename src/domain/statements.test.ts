import { describe, expect, it } from 'vitest';
import { isStatementDate, lastStatementDate, minimumDue, nextStatementDate, statementPeriod, statementStatus } from './statements';

describe('card statements', () => {
  it('computes statement dates with clamping', () => {
    expect(lastStatementDate('2025-03-10', 15)).toBe('2025-02-15');
    expect(lastStatementDate('2025-03-15', 15)).toBe('2025-03-15');
    expect(lastStatementDate('2025-03-10', 31)).toBe('2025-02-28');
    expect(nextStatementDate('2025-02-28', 31)).toBe('2025-03-31');
    expect(nextStatementDate('2025-01-31', 31)).toBe('2025-02-28');
    expect(isStatementDate('2024-02-29', 30)).toBe(true);
    expect(statementPeriod('2025-05-15', 15, null)).toEqual({ periodStart: '2025-04-16', periodEnd: '2025-05-15' });
  });

  it('computes minimum due with a floor and never above the balance', () => {
    const s = { minDueBps: 500, minDueFloor: 20000 };
    expect(minimumDue(600000, s)).toBe(30000);
    expect(minimumDue(200000, s)).toBe(20000);
    expect(minimumDue(15000, s)).toBe(15000);
    expect(minimumDue(-500, s)).toBe(0);
  });

  it('tracks what remains due after payments', () => {
    const st = {
      id: 'x', accountId: 'a', periodStart: '2025-04-16', periodEnd: '2025-05-15', dueOn: '2025-06-04',
      statementBalance: 600000, minimumDue: 30000, createdAt: '',
    };
    expect(statementStatus(st, 100000)).toMatchObject({ remaining: 500000, minimumRemaining: 0, isPaid: false });
    expect(statementStatus(st, 700000)).toMatchObject({ remaining: 0, isPaid: true });
  });
});
