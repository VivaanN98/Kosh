/**
 * Insights: every number is derived from ledger entries via domain/reports + domain/ledger/metrics.
 * Recharts is only loaded with this route. Charts use the validated categorical palette in fixed
 * order (--chart-1, --chart-2…), one y-axis each, a hover tooltip, and a table view.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { m } from 'motion/react';
import { ChevronLeft, CircleCheck, TriangleAlert } from 'lucide-react';
import { Page, PageHeader, Section } from '@/components/ui/bits';
import { Segmented } from '@/components/ui/Segmented';
import { Money } from '@/components/ui/Money';
import { IconTile } from '@/components/ui/CategoryIcon';
import { useDerived, useSnapshot } from '@/data/hooks';
import { categoryTotals, rollUpToParents, totalIncome, totalSpending } from '@/domain/ledger/metrics';
import { cashFlow, cumulativeDailySpending, monthlySeries } from '@/domain/reports';
import { formatMonth, monthEnd, monthStart, shiftMonth, type MonthKey } from '@/lib/dates';
import { formatINR, formatINRCompact, ratioBps } from '@/lib/money';
import { springs } from '@/motion/springs';
import type { Uuid } from '@/domain/types';

type Range = '1' | '3' | '6' | '12';

const AXIS = { fontSize: 11, fill: 'var(--text-3)' };

export default function InsightsPage() {
  const snap = useSnapshot();
  const { month } = useDerived();
  const [range, setRange] = useState<Range>('6');
  const months = Number(range);
  const from: MonthKey = shiftMonth(month, -(months - 1));
  const sys = snap.system!;
  const fromDate = monthStart(from);
  const toDate = monthEnd(month);

  const series = monthlySeries(snap.entries, sys, from, month);
  const flow = cashFlow(snap.entries, snap.accounts, from, month, sys.equity);
  const spending = totalSpending(snap.entries, sys, fromDate, toDate);
  const income = totalIncome(snap.entries, sys, fromDate, toDate);
  const net = income - spending;
  const rate = income > 0 ? ratioBps(net, income) : null;

  return (
    <Page>
      <PageHeader eyebrow="Derived from your ledger" title="Insights" />
      <div className="mb-6">
        <Segmented
          label="Period"
          value={range}
          onChange={setRange}
          options={[
            { value: '1', label: 'This month' },
            { value: '3', label: '3M' },
            { value: '6', label: '6M' },
            { value: '12', label: '12M' },
          ]}
        />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Income" value={<Money amount={income} className="text-[22px] font-medium" />} />
        <Tile label="Spending" value={<Money amount={spending} className="text-[22px] font-medium" />} />
        <Tile label="Net saved" value={<Money amount={net} tone={net < 0 ? 'negative' : 'positive'} className="text-[22px] font-medium" />} />
        <Tile label="Savings rate" value={<span className="display-num text-[22px]">{rate === null ? '—' : `${(rate / 100).toFixed(0)}%`}</span>} />
      </div>

      <CategoryBreakdown from={fromDate} to={toDate} total={spending} />

      {months > 1 && (
        <ChartCard
          title="Monthly comparison"
          caption="Spending and income per month"
          table={{ head: ['Month', 'Spending', 'Income', 'Net'], rows: series.map((r) => [formatMonth(r.month, 'MMM yyyy'), formatINR(r.spending), formatINR(r.income), formatINR(r.net)]) }}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={series.map((r) => ({ name: formatMonth(r.month, 'MMM'), Spending: r.spending, Income: r.income }))} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => formatINRCompact(v)} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
              <Bar dataKey="Spending" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="Income" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <ChartCard
        title="Cash flow"
        caption="Money in and out of cash and bank accounts. Moves between your own accounts are excluded; card bills count when paid."
        table={{ head: ['Month', 'In', 'Out', 'Net'], rows: flow.map((r) => [formatMonth(r.month, 'MMM yyyy'), formatINR(r.inflow), formatINR(r.outflow), formatINR(r.net)]) }}
      >
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={flow.map((r) => ({ name: formatMonth(r.month, 'MMM'), In: r.inflow, Out: r.outflow, Net: r.net }))} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => formatINRCompact(v)} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
            <Bar dataKey="In" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="Out" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {months > 1 && (
        <ChartCard
          title="Savings rate"
          caption="Share of income not spent, per month"
          table={{ head: ['Month', 'Savings rate'], rows: series.map((r) => [formatMonth(r.month, 'MMM yyyy'), r.savingsRateBps === null ? '—' : `${(r.savingsRateBps / 100).toFixed(1)}%`]) }}
        >
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={series.map((r) => ({ name: formatMonth(r.month, 'MMM'), Rate: r.savingsRateBps === null ? null : r.savingsRateBps / 100 }))} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip content={<ChartTooltip percent />} />
              <Line type="linear" dataKey="Rate" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: 'var(--surface)' }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <SpendingTrend />
    </Page>
  );
}

/** Legend labels wear text tokens, never the series colour; the swatch carries identity. */
const legendText = (value: string) => <span style={{ color: 'var(--text-2)' }}>{value}</span>;

function Tile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="card p-4">
      <p className="mb-1 text-[12.5px] text-text-2">{label}</p>
      {value}
    </div>
  );
}

function ChartCard({ title, caption, children, table }: { title: string; caption: string; children: ReactNode; table: { head: string[]; rows: string[][] } }) {
  return (
    <Section title={title}>
      <figure className="card p-4 md:p-5">
        <figcaption className="mb-3 text-[13px] text-text-2">{caption}</figcaption>
        {children}
        <details className="mt-3">
          <summary className="tap inline-flex cursor-pointer items-center text-[13px] font-medium text-text-2 hover:text-text">View as table</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="num w-full text-[13px]">
              <thead>
                <tr className="text-left text-text-3">
                  {table.head.map((h) => (
                    <th key={h} className="py-1.5 pr-4 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r) => (
                  <tr key={r[0]} className="border-t border-line">
                    {r.map((c, i) => (
                      <td key={i} className="py-1.5 pr-4">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </figure>
    </Section>
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: { name?: string; value?: number | null; color?: string; dataKey?: string }[];
  label?: string;
  percent?: boolean;
}

function ChartTooltip({ active, payload, label, percent }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass glass-strong rounded-[12px] px-3 py-2 text-[12.5px] shadow-2">
      <p className="mb-1 font-medium text-text">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-text-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden="true" />
          {p.name}
          <span className="num ml-auto pl-3 font-medium text-text">{p.value == null ? '—' : percent ? `${p.value.toFixed(1)}%` : formatINR(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

/** Ranked bars (one hue = magnitude). Tap a category to drill into its subcategories. */
function CategoryBreakdown({ from, to, total }: { from: string; to: string; total: number }) {
  const snap = useSnapshot();
  const d = useDerived();
  const [parent, setParent] = useState<Uuid | null>(null);
  const leaf = useMemo(() => categoryTotals(snap.entries, snap.system!, 'expense', from, to), [snap.entries, snap.system, from, to]);
  const rows = useMemo(() => {
    if (parent) {
      return [...leaf]
        .filter(([id]) => id === parent || d.categoryById.get(id)?.parentId === parent)
        .map(([id, amount]) => ({ id, amount, label: id === parent ? `${d.categoryById.get(id)?.name} (general)` : (d.categoryById.get(id)?.name ?? '—') }));
    }
    return [...rollUpToParents(leaf, snap.categories)].map(([id, amount]) => ({ id, amount, label: d.categoryById.get(id)?.name ?? '—' }));
  }, [leaf, parent, snap.categories, d.categoryById]);
  const sorted = rows.filter((r) => r.amount !== 0).sort((a, b) => b.amount - a.amount);
  const shownTotal = sorted.reduce((s, r) => s + r.amount, 0);
  const max = Math.max(1, ...sorted.map((r) => r.amount));
  const reconciles = parent ? true : shownTotal === total;

  return (
    <Section title="Where the money went">
      <div className="card p-4 md:p-5" data-testid="category-breakdown">
        {parent && (
          <button type="button" onClick={() => setParent(null)} className="tap -ml-2 mb-2 inline-flex items-center gap-1 rounded-[12px] px-2 text-[13px] font-medium text-text-2 hover:text-text">
            <ChevronLeft size={15} aria-hidden="true" /> All categories
          </button>
        )}
        {sorted.length === 0 ? (
          <p className="py-6 text-center text-[14px] text-text-3">No spending in this period.</p>
        ) : (
          <ul className="space-y-1">
            {sorted.map((r, i) => {
              const c = d.categoryById.get(r.id);
              const hasChildren = !parent && snap.categories.some((x) => x.parentId === r.id);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    disabled={!hasChildren}
                    onClick={() => setParent(r.id)}
                    className="w-full rounded-[12px] px-2 py-2 text-left enabled:hover:bg-surface-2 disabled:cursor-default"
                    title={`${r.label}: ${formatINR(r.amount)} (${((ratioBps(r.amount, shownTotal) / 100) || 0).toFixed(1)}%)`}
                  >
                    <div className="mb-1.5 flex items-center gap-2.5">
                      <IconTile name={c?.icon} color={c?.color ?? (c?.parentId ? d.categoryById.get(c.parentId)?.color : null)} size={26} iconSize={14} />
                      <span className="flex-1 truncate text-[14px]">{r.label}</span>
                      <span className="num w-12 text-right text-[12.5px] text-text-3">{(ratioBps(r.amount, shownTotal) / 100).toFixed(0)}%</span>
                      <Money amount={r.amount} className="w-24 text-right text-[14px] font-medium" />
                    </div>
                    <div className="ml-[36px] h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                      <m.div
                        className="h-full origin-left rounded-full"
                        style={{ background: 'var(--chart-1)' }}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: Math.max(0, r.amount) / max }}
                        transition={{ ...springs.gentle, delay: Math.min(i, 8) * 0.03 }}
                      />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!parent && sorted.length > 0 && (
          <p className={`mt-3 flex items-center gap-1.5 text-[12px] ${reconciles ? 'text-text-3' : 'text-negative'}`} data-testid="reconcile-check">
            {reconciles ? <CircleCheck size={13} aria-hidden="true" /> : <TriangleAlert size={13} aria-hidden="true" />}
            Categories total {formatINR(shownTotal)} {reconciles ? '= ' : '≠ '}total spending {formatINR(total)}
          </p>
        )}
      </div>
    </Section>
  );
}

/** Cumulative spending this month vs last month. */
function SpendingTrend() {
  const snap = useSnapshot();
  const d = useDerived();
  const { month, today } = d;
  const sys = snap.system!;
  const data = useMemo(() => {
    const cur = cumulativeDailySpending(snap.entries, sys, month, today);
    const prev = cumulativeDailySpending(snap.entries, sys, shiftMonth(month, -1));
    return Array.from({ length: Math.max(cur.length, prev.length) }, (_, i) => ({ day: i + 1, 'This month': cur[i] ?? null, 'Last month': prev[i] ?? null }));
  }, [snap.entries, sys, month, today]);
  return (
    <ChartCard
      title="Spending trend"
      caption={`Running total through ${formatMonth(d.month, 'MMMM')} compared with ${formatMonth(shiftMonth(d.month, -1), 'MMMM')}`}
      table={{
        head: ['Day', 'This month', 'Last month'],
        rows: data.filter((r) => r.day % 5 === 0 || r.day === 1).map((r) => [String(r.day), r['This month'] == null ? '—' : formatINR(r['This month']), r['Last month'] == null ? '—' : formatINR(r['Last month'])]),
      }}
    >
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="day" tick={AXIS} axisLine={false} tickLine={false} interval={4} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => formatINRCompact(v)} />
          <Tooltip content={<ChartTooltip />} labelFormatter={(l) => `Day ${l}`} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
          <Line type="monotone" dataKey="This month" stroke="var(--chart-1)" strokeWidth={2} dot={false} connectNulls={false} />
          <Line type="monotone" dataKey="Last month" stroke="var(--chart-2)" strokeWidth={2} strokeDasharray="4 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
