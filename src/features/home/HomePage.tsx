import { AnimatePresence, m } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowUpRight, BellRing, Check, ChevronRight, Inbox, SkipForward } from 'lucide-react';
import { Page, Section, EmptyState, Progress } from '@/components/ui/bits';
import { BigMoney, Money } from '@/components/ui/Money';
import { Button } from '@/components/ui/Button';
import { IconTile } from '@/components/ui/CategoryIcon';
import { useToast } from '@/components/ui/Toast';
import { useDerived, useSnapshot, useStore } from '@/data/hooks';
import { useAddSheet } from '@/features/add/AddSheetContext';
import { TransactionRow } from '@/features/activity/TransactionRow';
import { TransactionDetailSheet } from '@/features/activity/TransactionDetailSheet';
import { budgetStatus } from '@/domain/budgets';
import { categoryTotals, rollUpToParents } from '@/domain/ledger/metrics';
import { cumulativeDailySpending } from '@/domain/reports';
import { formatDate, formatMonth, formatRelativeDay, monthEnd, monthStart, shiftMonth } from '@/lib/dates';
import { formatINR, formatINRCompact, ratioBps } from '@/lib/money';
import { springs } from '@/motion/springs';
import { toKoshError } from '@/domain/errors';
import type { Transaction } from '@/domain/types';

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomePage() {
  const snap = useSnapshot();
  const d = useDerived();
  const add = useAddSheet();
  const [selected, setSelected] = useState<Transaction | null>(null);
  const recent = useMemo(() => snap.transactions.filter((t) => !t.deletedAt).slice(0, 6), [snap.transactions]);
  const debt = d.liabilities;
  const name = snap.profile?.displayName?.split(' ')[0];

  return (
    <Page>
      <div className="relative">
        <div className="aurora pointer-events-none absolute -inset-x-8 -top-24 h-[340px] md:-top-32" aria-hidden="true" />
        <header className="relative mb-6 pt-1">
          <p className="eyebrow mb-2">{formatDate(d.today, 'EEEE, d MMMM')}</p>
          <h1 className="serif text-[34px] leading-[1.05] md:text-[40px]">
            {greeting()}
            {name ? <span className="italic text-text-2">, {name}</span> : null}
          </h1>
        </header>

        <section aria-label="Net worth" className="relative mb-8">
          <p className="mb-1 text-[13px] text-text-2">Net worth</p>
          <BigMoney amount={d.netWorth} size="2xl" hidePaise />
          <div className="scroll-clean -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
            <Stat label="Available cash" value={d.availableCash} tone="mint" testId="stat-available" />
            {d.earmarked > 0 && <Stat label="Free after goals" value={d.freeCash} />}
            {debt > 0 && <Stat label="Card debt" value={debt} tone="negative" />}
          </div>
        </section>
      </div>

      <div className="grid gap-5 md:grid-cols-[1.25fr_1fr]">
        <MonthCard />
        <TopCategories />
      </div>

      <Reminders />

      <Section
        className="mt-8"
        title="Recent activity"
        action={
          <Link to="/activity" className="tap -mr-2 inline-flex items-center gap-1 rounded-[12px] px-2 text-[14px] font-medium text-text-2 hover:text-text">
            See all <ChevronRight size={16} aria-hidden="true" />
          </Link>
        }
      >
        {recent.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<Inbox size={24} />}
              title="A clean slate"
              body="Add your first expense — it takes a few seconds."
              action={
                <Button variant="primary" onClick={() => add.open()}>
                  Add expense
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="card p-1.5" data-testid="recent-list">
            <AnimatePresence initial={false}>
              {recent.map((t) => (
                <TransactionRow key={t.id} t={t} d={d} onOpen={setSelected} showDate pending={snap.pending.has(t.id)} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </Section>
      <TransactionDetailSheet tx={selected} onClose={() => setSelected(null)} />
    </Page>
  );
}

function Stat({ label, value, tone, testId }: { label: string; value: number; tone?: 'mint' | 'negative'; testId?: string }) {
  return (
    <div className="glass inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5" data-testid={testId}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone === 'mint' ? 'bg-mint' : tone === 'negative' ? 'bg-negative' : 'bg-[var(--peri)]'}`} aria-hidden="true" />
      <span className="text-[12.5px] text-text-2">{label}</span>
      <Money amount={value} className="text-[14px] font-medium" />
    </div>
  );
}

/** Chart 1 of 2: cumulative spending this month vs last month, plus the overall budget. */
function MonthCard() {
  const snap = useSnapshot();
  const d = useDerived();
  const sys = snap.system!;
  const thisMonth = useMemo(() => cumulativeDailySpending(snap.entries, sys, d.month, d.today), [snap.entries, sys, d.month, d.today]);
  const lastMonth = useMemo(() => cumulativeDailySpending(snap.entries, sys, shiftMonth(d.month, -1)), [snap.entries, sys, d.month]);
  const overall = snap.budgets.find((b) => b.categoryId === null);
  const status = overall ? budgetStatus(overall, snap.entries, sys, snap.categories, d.month) : null;
  const sameDayLast = lastMonth[Math.min(thisMonth.length, lastMonth.length) - 1] ?? 0;
  const deltaBps = sameDayLast > 0 ? ratioBps(d.monthSpending - sameDayLast, sameDayLast) : null;

  return (
    <section className="card relative overflow-hidden p-5" aria-label="This month's spending">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-text-2">Spent in {formatMonth(d.month, 'MMMM')}</p>
          <BigMoney amount={d.monthSpending} size="xl" hidePaise />
        </div>
        {deltaBps !== null && (
          <span
            className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ${deltaBps > 0 ? 'bg-negative-soft text-negative' : 'bg-mint-soft text-positive'}`}
            title="Compared with the same point last month"
          >
            <ArrowUpRight size={13} className={deltaBps > 0 ? '' : 'rotate-90'} aria-hidden="true" />
            {Math.abs(Math.round(deltaBps / 100))}% vs last month
          </span>
        )}
      </div>
      <Sparkline current={thisMonth} previous={lastMonth} budget={overall?.amount ?? null} />
      {status && (
        <div className="mt-3">
          <div className="mb-1.5 flex justify-between text-[12.5px]">
            <span className="text-text-2">Monthly budget</span>
            <span className={`num ${status.state === 'over' ? 'text-negative' : 'text-text-2'}`}>
              {status.remaining >= 0 ? `${formatINR(status.remaining, { decimals: 'never' })} left` : `${formatINR(-status.remaining, { decimals: 'never' })} over`}
            </span>
          </div>
          <Progress value={status.usedBps / 10000} tone={status.state === 'over' ? 'negative' : status.state === 'warning' ? 'warning' : 'mint'} label="Monthly budget used" />
        </div>
      )}
    </section>
  );
}

function Sparkline({ current, previous, budget }: { current: number[]; previous: number[]; budget: number | null }) {
  const W = 320;
  const H = 96;
  const days = Math.max(previous.length, current.length, 28);
  const maxV = Math.max(1, ...current, ...previous, budget ?? 0);
  const pts = (arr: number[]) => arr.map((v, i) => `${((i / (days - 1)) * W).toFixed(1)},${(H - (v / maxV) * (H - 8) - 4).toFixed(1)}`).join(' ');
  const last = current.length - 1;
  const lastX = (last / (days - 1)) * W;
  const lastY = H - ((current[last] ?? 0) / maxV) * (H - 8) - 4;
  return (
    <figure className="mt-4" aria-label="Cumulative spending this month compared with last month">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[96px] w-full overflow-visible" preserveAspectRatio="none" role="img">
        <defs>
          <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--mint)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--mint)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {budget !== null && (
          <line x1="0" x2={W} y1={H - (budget / maxV) * (H - 8) - 4} y2={H - (budget / maxV) * (H - 8) - 4} stroke="var(--line-strong)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        )}
        {previous.length > 1 && <polyline points={pts(previous)} fill="none" stroke="var(--text-3)" strokeOpacity="0.55" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
        {current.length > 1 && (
          <>
            <polygon points={`0,${H} ${pts(current)} ${lastX.toFixed(1)},${H}`} fill="url(#spark-fill)" />
            <polyline points={pts(current)} fill="none" stroke="var(--mint)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </>
        )}
        {current.length > 0 && <circle cx={lastX} cy={lastY} r="3.5" fill="var(--mint)" />}
      </svg>
      <figcaption className="mt-2 flex gap-4 text-[11.5px] text-text-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded bg-mint" aria-hidden="true" /> This month
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded bg-text-3 opacity-60" aria-hidden="true" /> Last month
        </span>
        {budget !== null && <span>— — Budget {formatINRCompact(budget)}</span>}
      </figcaption>
    </figure>
  );
}

/** Chart 2 of 2: where the money went this month (top categories). */
function TopCategories() {
  const snap = useSnapshot();
  const d = useDerived();
  const rows = useMemo(() => {
    const leaf = categoryTotals(snap.entries, snap.system!, 'expense', monthStart(d.month), monthEnd(d.month));
    return [...rollUpToParents(leaf, snap.categories)]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, amount]) => ({ c: d.categoryById.get(id), amount }));
  }, [snap.entries, snap.system, snap.categories, d.month, d.categoryById]);
  const max = rows[0]?.amount ?? 1;
  return (
    <section className="card p-5" aria-label="Top categories this month">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13px] text-text-2">Where it went</p>
        <Link to="/insights" className="tap -my-2 -mr-2 inline-flex items-center rounded-[12px] px-2 text-[13px] font-medium text-text-2 hover:text-text">
          Insights <ChevronRight size={15} aria-hidden="true" />
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[14px] text-text-3">No spending yet this month.</p>
      ) : (
        <ul className="space-y-3.5">
          {rows.map(({ c, amount }, i) => (
            <li key={c?.id ?? i}>
              <div className="mb-1.5 flex items-center gap-2.5">
                <IconTile name={c?.icon} color={c?.color} size={26} iconSize={14} />
                <span className="flex-1 truncate text-[14px]">{c?.name ?? 'Other'}</span>
                <Money amount={amount} className="text-[14px] font-medium" />
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                <m.div
                  className="h-full origin-left rounded-full"
                  style={{ background: c?.color ?? 'var(--text-3)' }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: amount / max }}
                  transition={{ ...springs.gentle, delay: i * 0.04 }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Reminders() {
  const snap = useSnapshot();
  const d = useDerived();
  const store = useStore();
  const toast = useToast();
  const pending = snap.occurrences.filter((o) => o.status === 'pending');
  if (pending.length === 0) return null;
  const rules = new Map(snap.rules.map((r) => [r.id, r]));
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast({ tone: 'success', message: ok });
    } catch (err) {
      toast({ tone: 'error', message: toKoshError(err).friendly });
    }
  };
  return (
    <Section className="mt-8" title="Waiting for you">
      <ul className="card divide-y divide-[var(--line)] p-1.5">
        {pending.slice(0, 3).map((o) => {
          const r = rules.get(o.ruleId);
          if (!r) return null;
          const c = r.categoryId ? d.categoryById.get(r.categoryId) : undefined;
          return (
            <li key={o.id} className="flex items-center gap-3 px-2 py-2.5">
              <IconTile name={c?.icon ?? 'receipt'} color={c?.color ?? 'var(--warning)'} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">{r.name}</p>
                <p className="flex items-center gap-1 truncate text-[12.5px] text-text-3">
                  <BellRing size={12} className="shrink-0" aria-hidden="true" />
                  <span className="truncate">Due {formatRelativeDay(o.dueOn, d.today)}</span>
                  <span aria-hidden="true">·</span>
                  <Money amount={r.amount} tone="muted" />
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  aria-label={`Skip ${r.name} due ${o.dueOn}`}
                  title="Skip"
                  onClick={() => act(() => store.run((repo) => repo.skipOccurrence(o.id), 'occurrences'), 'Skipped')}
                  className="tap inline-flex items-center justify-center rounded-[12px] text-text-2 hover:bg-surface-2 hover:text-text"
                >
                  <SkipForward size={18} aria-hidden="true" />
                </button>
                <Button
                  size="sm"
                  variant="accent"
                  icon={<Check size={14} />}
                  aria-label={`Record ${r.name} due ${o.dueOn}`}
                  onClick={() => act(() => store.run((repo) => repo.confirmOccurrence(o.id), 'occurrences', 'transactions', 'entries'), `${r.name} recorded`)}
                  className="h-11"
                >
                  Record
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {pending.length > 3 && (
        <Link to="/plans/recurring" className="mt-2 block px-2 text-[13px] text-text-2 hover:text-text">
          {pending.length - 3} more waiting in Plans →
        </Link>
      )}
    </Section>
  );
}
