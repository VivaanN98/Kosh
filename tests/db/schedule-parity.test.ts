import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { isScheduled, type ScheduleRule } from '@/domain/recurring';
import { dbConfigured } from './helpers';

function psql(sql: string): string {
  return execFileSync('docker', ['exec', '-i', 'supabase_db_kosh', 'psql', '-U', 'postgres', '-At'], {
    encoding: 'utf8',
    input: sql,
    maxBuffer: 32 * 1024 * 1024,
  });
}

const RULES: (ScheduleRule & { id: number })[] = [
  { id: 1, frequency: 'monthly', interval: 1, startOn: '2024-01-31', endOn: null, anchorDay: 31 },
  { id: 2, frequency: 'monthly', interval: 2, startOn: '2024-01-30', endOn: null, anchorDay: 30 },
  { id: 3, frequency: 'monthly', interval: 1, startOn: '2024-03-15', endOn: '2025-06-15', anchorDay: 15 },
  { id: 4, frequency: 'weekly', interval: 3, startOn: '2024-01-03', endOn: null, anchorDay: null },
  { id: 5, frequency: 'daily', interval: 4, startOn: '2024-02-27', endOn: null, anchorDay: null },
  { id: 6, frequency: 'yearly', interval: 1, startOn: '2024-02-29', endOn: null, anchorDay: 29 },
  { id: 7, frequency: 'yearly', interval: 2, startOn: '2024-12-31', endOn: null, anchorDay: 31 },
  { id: 8, frequency: 'monthly', interval: 1, startOn: '2024-01-15', endOn: null, anchorDay: 31 },
];

describe.skipIf(!dbConfigured)('schedule parity: SQL is_scheduled ⇔ TS isScheduled', () => {
  it('agrees on every day for every rule', () => {
    const values = RULES.map(
      (r) =>
        `(${r.id}, '${r.frequency}', ${r.interval}, date '${r.startOn}', ${r.endOn ? `date '${r.endOn}'` : 'null::date'}, ${r.anchorDay ?? 'null'}::smallint)`,
    ).join(',');
    const sql = `
      with r(id, frequency, interval_count, start_on, end_on, anchor_day) as (values ${values}),
      d as (select generate_series(date '2024-01-01', date '2026-12-31', interval '1 day')::date as day),
      rr as (
        select r.id, x as rule from r,
        lateral (select (null::public.recurring_rules)) as base(x0),
        lateral (select jsonb_populate_record(null::public.recurring_rules, jsonb_build_object(
          'frequency', r.frequency, 'interval_count', r.interval_count, 'start_on', r.start_on,
          'end_on', r.end_on, 'anchor_day', r.anchor_day))) as p(x)
      )
      select rr.id || ':' || d.day from rr cross join d
      where private.is_scheduled(rr.rule, d.day)
      order by 1;`;
    const sqlDates = new Set(psql(sql).trim().split(/\r?\n/).filter(Boolean));
    let checked = 0;
    for (const r of RULES) {
      for (let t = Date.UTC(2024, 0, 1); t <= Date.UTC(2026, 11, 31); t += 86_400_000) {
        const day = new Date(t).toISOString().slice(0, 10);
        expect(sqlDates.has(`${r.id}:${day}`), `rule ${r.id} @ ${day}`).toBe(isScheduled(r, day));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(8000);
    expect(sqlDates.size).toBeGreaterThan(100);
  });
});
