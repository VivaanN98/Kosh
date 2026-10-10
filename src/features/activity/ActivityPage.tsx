import { AnimatePresence } from 'motion/react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Download, Search, SearchX, X } from 'lucide-react';
import { EmptyState, Page, PageHeader, SelectField } from '@/components/ui/bits';
import { Segmented } from '@/components/ui/Segmented';
import { Money } from '@/components/ui/Money';
import { IconButton } from '@/components/ui/Button';
import { useDerived, useSnapshot } from '@/data/hooks';
import { formatMonth, formatRelativeDay, monthKey } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { Transaction } from '@/domain/types';
import { TransactionRow } from './TransactionRow';
import { TransactionDetailSheet } from './TransactionDetailSheet';
import { matchesQuery, type TypeFilter, typeMatches } from './filter';

const PAGE = 60;

export default function ActivityPage() {
  const snap = useSnapshot();
  const d = useDerived();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const deferredQuery = useDeferredValue(query);
  const type = (params.get('type') as TypeFilter) ?? 'all';
  const accountId = params.get('account') ?? '';
  const categoryId = params.get('category') ?? '';
  const month = params.get('month') ?? '';
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Transaction | null>(null);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v && v !== 'all') next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
    setLimit(PAGE);
  };

  const months = useMemo(() => [...new Set(snap.transactions.map((t) => monthKey(t.occurredOn)))].sort().reverse(), [snap.transactions]);
  const categoryIds = useMemo(() => {
    if (!categoryId) return null;
    return new Set([categoryId, ...snap.categories.filter((c) => c.parentId === categoryId).map((c) => c.id)]);
  }, [categoryId, snap.categories]);

  const filtered = useMemo(
    () =>
      snap.transactions.filter(
        (t) =>
          !t.deletedAt &&
          typeMatches(t, type) &&
          (!accountId || t.accountId === accountId || t.toAccountId === accountId) &&
          (!categoryIds || (t.categoryId !== null && categoryIds.has(t.categoryId))) &&
          (!month || monthKey(t.occurredOn) === month) &&
          matchesQuery(t, deferredQuery, d),
      ),
    [snap.transactions, type, accountId, categoryIds, month, deferredQuery, d],
  );

  const groups = useMemo(() => {
    const out: { date: string; items: Transaction[]; net: number }[] = [];
    for (const t of filtered.slice(0, limit)) {
      let g = out[out.length - 1];
      if (!g || g.date !== t.occurredOn) out.push((g = { date: t.occurredOn, items: [], net: 0 }));
      g.items.push(t);
      if (t.type === 'expense') g.net -= t.amount;
      if (t.type === 'income' || t.type === 'refund') g.net += t.amount;
    }
    return out;
  }, [filtered, limit]);

  const totals = useMemo(() => {
    let out = 0;
    let inn = 0;
    for (const t of filtered) {
      if (t.type === 'expense') out += t.amount;
      else if (t.type === 'income') inn += t.amount;
      else if (t.type === 'refund') out -= t.amount;
    }
    return { out, inn };
  }, [filtered]);

  // Render more as the user nears the end (keeps long histories smooth).
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || limit >= filtered.length) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && setLimit((l) => l + PAGE), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, filtered.length]);

  const filtersActive = type !== 'all' || accountId || categoryId || month || query;

  return (
    <Page>
      <PageHeader
        eyebrow="All transactions"
        title="Activity"
        actions={
          <IconButton label="Export CSV" onClick={() => void import('@/lib/csv').then((m) => m.downloadTransactionsCsv(snap, filtered))}>
            <Download size={19} />
          </IconButton>
        }
      />

      <div className="mb-4 space-y-3">
        <label className="relative block">
          <span className="sr-only">Search transactions</span>
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Search merchant, note, category, amount"
            className="h-12 w-full rounded-[14px] border border-line bg-surface-2 pl-11 pr-11 text-[15px] placeholder:text-text-3 outline-none focus:border-[var(--focus)]"
            data-testid="activity-search"
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="tap absolute right-0 top-1/2 inline-flex -translate-y-1/2 items-center justify-center text-text-3">
              <X size={18} />
            </button>
          )}
        </label>
        <div className="scroll-clean -mx-4 overflow-x-auto px-4">
          <Segmented
            label="Type"
            size="sm"
            value={type}
            onChange={(v) => setParam('type', v)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'expense', label: 'Spending' },
              { value: 'income', label: 'Income' },
              { value: 'transfer', label: 'Transfers' },
            ]}
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <SelectField label="Account" value={accountId} onChange={(e) => setParam('account', e.target.value)}>
            <option value="">All accounts</option>
            {snap.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.archivedAt ? ' (archived)' : ''}
              </option>
            ))}
          </SelectField>
          <SelectField label="Category" value={categoryId} onChange={(e) => setParam('category', e.target.value)}>
            <option value="">All categories</option>
            {snap.categories
              .filter((c) => !c.parentId)
              .map((p) => (
                <optgroup key={p.id} label={p.name}>
                  <option value={p.id}>{p.name} (all)</option>
                  {snap.categories
                    .filter((c) => c.parentId === p.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
              ))}
          </SelectField>
          <SelectField label="Month" value={month} onChange={(e) => setParam('month', e.target.value)}>
            <option value="">Any time</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonth(m)}
              </option>
            ))}
          </SelectField>
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[13px] text-text-2" aria-live="polite">
          <span>
            {filtered.length} transaction{filtered.length === 1 ? '' : 's'}
          </span>
          <span>
            Spent <Money amount={totals.out} className="font-medium text-text" />
          </span>
          <span>
            Earned <Money amount={totals.inn} tone="positive" className="font-medium" />
          </span>
          {filtersActive && (
            <button
              type="button"
              className="ml-auto text-[13px] font-medium text-peri"
              onClick={() => {
                setQuery('');
                setParams(new URLSearchParams(), { replace: true });
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState icon={<SearchX size={24} />} title="Nothing matches" body={filtersActive ? 'Try a different search or clear the filters.' : 'Transactions you add appear here.'} />
        </div>
      ) : (
        <div className="space-y-4" data-testid="activity-list">
          {groups.map((g) => (
            <section key={g.date} aria-label={formatRelativeDay(g.date, d.today)}>
              <div className="sticky top-0 z-10 -mx-1 mb-1 flex items-center justify-between bg-bg/90 px-2 py-2 text-[13px] backdrop-blur-sm">
                <h2 className="font-medium text-text-2">{formatRelativeDay(g.date, d.today)}</h2>
                {g.net !== 0 && <span className={`num ${g.net > 0 ? 'text-positive' : 'text-text-3'}`}>{formatINR(g.net, { sign: 'always' })}</span>}
              </div>
              <ul className="card p-1.5">
                <AnimatePresence initial={false}>
                  {g.items.map((t) => (
                    <TransactionRow key={t.id} t={t} d={d} onOpen={setSelected} pending={snap.pending.has(t.id)} contextAccountId={accountId || undefined} />
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          ))}
          <div ref={sentinel} aria-hidden="true" />
        </div>
      )}
      <TransactionDetailSheet tx={selected} onClose={() => setSelected(null)} />
    </Page>
  );
}
