import { useState } from 'react';
import { BellRing, Check, Pause, Play, Plus, Repeat, SkipForward, Sparkles, Trash2, XCircle } from 'lucide-react';
import { EmptyState, Section } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { IconTile } from '@/components/ui/CategoryIcon';
import { useToast } from '@/components/ui/Toast';
import { useDerived, useSnapshot, useStore } from '@/data/hooks';
import { describeSchedule, monthlyEquivalent, nextOccurrence } from '@/domain/recurring';
import { addDays, formatRelativeDay } from '@/lib/dates';
import { toKoshError } from '@/domain/errors';
import { formatINR } from '@/lib/money';
import type { RecurringRule, Subscription } from '@/domain/types';
import { RuleFormSheet } from './RuleFormSheet';
import { SubscriptionRow } from './SubscriptionRow';

export default function RecurringTab() {
  const snap = useSnapshot();
  const [form, setForm] = useState<{ rule?: RecurringRule; sub?: boolean } | null>(null);
  const byId = new Map(snap.rules.map((r) => [r.id, r]));
  const subRuleIds = new Set(snap.subscriptions.map((s) => s.recurringRuleId));
  const subs = snap.subscriptions
    .map((s) => ({ s, r: byId.get(s.recurringRuleId) }))
    .filter((x): x is { s: Subscription; r: RecurringRule } => !!x.r && x.r.status !== 'cancelled');
  const monthly = subs.filter((x) => x.r.status === 'active').reduce((sum, { r }) => sum + monthlyEquivalent(r.amount, r.frequency, r.interval), 0);
  const rules = snap.rules.filter((r) => !subRuleIds.has(r.id));
  const active = rules.filter((r) => r.status !== 'cancelled');
  const cancelled = rules.filter((r) => r.status === 'cancelled');
  return (
    <div>
      <PendingList />
      <div className="mb-6 flex justify-end">
        <Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => setForm({})} data-testid="new-rule">
          New recurring
        </Button>
      </div>
      <Section
        title="Subscriptions"
        action={subs.length > 0 ? <span className="num text-[13px] text-text-3">{formatINR(monthly, { decimals: 'never' })} / month</span> : undefined}
      >
        {subs.length === 0 ? (
          <div className="card">
            <EmptyState icon={<Sparkles size={24} />} title="No subscriptions" body="Streaming, cloud storage, memberships. Tap New recurring and choose Subscription." />
          </div>
        ) : (
          <ul className="card divide-y divide-[var(--line)] p-1.5">
            {subs.map(({ s, r }) => (
              <SubscriptionRow key={s.id} sub={s} rule={r} onEdit={() => setForm({ rule: r, sub: true })} />
            ))}
          </ul>
        )}
      </Section>
      <Section title="Bills, income & transfers">
        {active.length === 0 ? (
          <div className="card">
            <EmptyState icon={<Repeat size={24} />} title="Nothing else repeats" body="Rent, salary, SIPs, EMIs: set them once and confirm or auto-record each time." />
          </div>
        ) : (
          <ul className="card divide-y divide-[var(--line)] p-1.5">
            {active.map((r) => (
              <RuleRow key={r.id} rule={r} onEdit={() => setForm({ rule: r })} />
            ))}
          </ul>
        )}
      </Section>
      {cancelled.length > 0 && (
        <details>
          <summary className="tap flex cursor-pointer items-center px-1 text-[13px] font-medium uppercase tracking-[0.1em] text-text-3">Cancelled ({cancelled.length})</summary>
          <ul className="card mt-2 divide-y divide-[var(--line)] p-1.5 opacity-75">
            {cancelled.map((r) => (
              <RuleRow key={r.id} rule={r} onEdit={() => undefined} />
            ))}
          </ul>
        </details>
      )}
      {form && <RuleFormSheet rule={form.rule} asSubscription={form.sub} onClose={() => setForm(null)} />}
    </div>
  );
}

export function PendingList() {
  const snap = useSnapshot();
  const d = useDerived();
  const store = useStore();
  const toast = useToast();
  const pending = snap.occurrences.filter((o) => o.status === 'pending');
  if (pending.length === 0) return null;
  const rules = new Map(snap.rules.map((r) => [r.id, r]));
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast({ tone: 'success', message: msg });
    } catch (err) {
      toast({ tone: 'error', message: toKoshError(err).friendly });
    }
  };
  return (
    <Section title={`Waiting for confirmation (${pending.length})`}>
      <ul className="card divide-y divide-[var(--line)] p-1.5" data-testid="pending-list">
        {pending.map((o) => {
          const r = rules.get(o.ruleId);
          if (!r) return null;
          return (
            <li key={o.id} className="flex items-center gap-3 px-2 py-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-warning-soft text-warning" aria-hidden="true">
                <BellRing size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">{r.name}</p>
                <p className="text-[12.5px] text-text-3">
                  Due {formatRelativeDay(o.dueOn, d.today)} · <Money amount={r.amount} tone="muted" />
                </p>
              </div>
              <button
                type="button"
                aria-label={`Skip ${r.name} due ${o.dueOn}`}
                onClick={() => act(() => store.run((repo) => repo.skipOccurrence(o.id), 'occurrences'), 'Skipped')}
                className="tap inline-flex items-center justify-center rounded-[12px] text-text-2 hover:bg-surface-2"
              >
                <SkipForward size={18} />
              </button>
              <Button
                size="sm"
                variant="accent"
                className="h-11"
                icon={<Check size={14} />}
                aria-label={`Record ${r.name} due ${o.dueOn}`}
                onClick={() => act(() => store.run((repo) => repo.confirmOccurrence(o.id), 'occurrences', 'transactions', 'entries'), `${r.name} recorded`)}
                data-testid="confirm-occurrence"
              >
                Record
              </Button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function RuleRow({ rule: r, onEdit }: { rule: RecurringRule; onEdit: () => void }) {
  const d = useDerived();
  const store = useStore();
  const toast = useToast();
  const c = r.categoryId ? d.categoryById.get(r.categoryId) : undefined;
  const next = r.status === 'active' ? nextOccurrence(r, addDays(d.today, -1)) : null;
  const setStatus = async (status: RecurringRule['status']) => {
    try {
      await store.run((repo) => repo.setRecurringStatus(r.id, status), 'rules');
      if (status === 'cancelled') toast({ message: `${r.name} cancelled. Past records stay.` });
    } catch (err) {
      toast({ tone: 'error', message: toKoshError(err).friendly });
    }
  };
  const remove = async () => {
    try {
      await store.run((repo) => repo.deleteRecurringRule(r.id), 'rules', 'occurrences', 'subscriptions');
      toast({ message: `${r.name} deleted. Recorded transactions are kept.` });
    } catch (err) {
      toast({ tone: 'error', message: toKoshError(err).friendly });
    }
  };
  return (
    <li className="flex flex-wrap items-center gap-3 px-2 py-2.5" data-testid="rule-row">
      <button type="button" onClick={onEdit} disabled={r.status === 'cancelled'} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <IconTile name={c?.icon ?? (r.type === 'income' ? 'trending-up' : r.type === 'expense' ? 'receipt' : 'transfer')} color={c?.color ?? 'var(--peri)'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">
            {r.name}
            {r.status === 'paused' && <span className="ml-2 rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-text-2">Paused</span>}
          </span>
          <span className="block truncate text-[12.5px] text-text-3">
            {describeSchedule(r)} · {r.mode === 'automatic' ? 'auto' : 'reminder'}
            {next ? ` · next ${formatRelativeDay(next, d.today)}` : ''}
          </span>
        </span>
        <Money amount={r.amount} className="text-[15px] font-medium" />
      </button>
      {r.status !== 'cancelled' ? (
        <div className="flex gap-0.5">
          <button
            type="button"
            className="tap inline-flex items-center justify-center rounded-[12px] text-text-2 hover:bg-surface-2"
            aria-label={r.status === 'paused' ? `Resume ${r.name}` : `Pause ${r.name}`}
            onClick={() => setStatus(r.status === 'paused' ? 'active' : 'paused')}
          >
            {r.status === 'paused' ? <Play size={17} /> : <Pause size={17} />}
          </button>
          <button type="button" className="tap inline-flex items-center justify-center rounded-[12px] text-text-2 hover:bg-surface-2" aria-label={`Cancel ${r.name}`} onClick={() => setStatus('cancelled')}>
            <XCircle size={17} />
          </button>
        </div>
      ) : (
        <button type="button" className="tap inline-flex items-center justify-center rounded-[12px] text-text-2 hover:bg-surface-2" aria-label={`Delete ${r.name}`} onClick={remove}>
          <Trash2 size={17} />
        </button>
      )}
    </li>
  );
}
