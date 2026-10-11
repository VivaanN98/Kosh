import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, PiggyBank, Plus, Trash2 } from 'lucide-react';
import { EmptyState, Progress, Section, SelectField } from '@/components/ui/bits';
import { Button, IconButton } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { IconTile } from '@/components/ui/CategoryIcon';
import { Sheet } from '@/components/ui/Sheet';
import { AmountField } from '@/components/ui/AmountField';
import { useToast } from '@/components/ui/Toast';
import { useDerived, useSnapshot, useStore } from '@/data/hooks';
import { budgetStatus, categoryBudgetsTotal, spentForBudget, type BudgetStatus } from '@/domain/budgets';
import { formatMonth, shiftMonth } from '@/lib/dates';
import { formatINR, parseRupees, toDecimalString } from '@/lib/money';
import { toKoshError } from '@/domain/errors';
import type { Budget } from '@/domain/types';

const stateTone = { ok: 'mint', warning: 'warning', over: 'negative' } as const;

export default function BudgetsTab() {
  const snap = useSnapshot();
  const d = useDerived();
  const [month, setMonth] = useState(d.month);
  const [editing, setEditing] = useState<Budget | 'new' | null>(null);
  const statuses = useMemo(
    () => snap.budgets.map((b) => budgetStatus(b, snap.entries, snap.system!, snap.categories, month)),
    [snap.budgets, snap.entries, snap.system, snap.categories, month],
  );
  const overall = statuses.find((s) => s.budget.categoryId === null);
  const categories = statuses.filter((s) => s.budget.categoryId !== null).sort((a, b) => b.usedBps - a.usedBps);
  const over = statuses.filter((s) => s.state === 'over');
  const catTotal = categoryBudgetsTotal(snap.budgets);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <IconButton label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
          <ChevronLeft size={20} />
        </IconButton>
        <p className="serif text-[22px]" aria-live="polite">
          {formatMonth(month)}
        </p>
        <IconButton label="Next month" onClick={() => setMonth((m) => shiftMonth(m, 1))} disabled={month >= d.month}>
          <ChevronRight size={20} />
        </IconButton>
      </div>

      {over.length > 0 && (
        <div role="alert" className="mb-5 flex items-start gap-3 rounded-[16px] bg-negative-soft px-4 py-3 text-[14px] text-negative" data-testid="overspend-alert">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            Over budget in {over.map((s) => (s.budget.categoryId ? d.categoryById.get(s.budget.categoryId)?.name : 'overall')).join(', ')}{' '}
            for {formatMonth(month, 'MMMM')}.
          </p>
        </div>
      )}

      {statuses.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<PiggyBank size={24} />}
            title="No budgets yet"
            body="Set a monthly limit overall or per category. Transfers, card payments and goal savings never count against it."
            action={
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing('new')}>
                Set a budget
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {overall ? (
            <OverallCard status={overall} onEdit={() => setEditing(overall.budget)} />
          ) : (
            <button type="button" onClick={() => setEditing('new')} className="card mb-6 w-full p-5 text-left text-[14px] text-text-2 hover:bg-surface-2">
              + Add an overall monthly budget
            </button>
          )}
          {overall && catTotal > overall.budget.amount && (
            <p className="-mt-3 mb-6 px-1 text-[12.5px] text-warning">Category budgets add up to {formatINR(catTotal, { decimals: 'never' })}, more than the overall budget.</p>
          )}
          <Section
            title="By category"
            action={
              <Button size="sm" variant="ghost" icon={<Plus size={15} />} onClick={() => setEditing('new')} data-testid="add-budget">
                Budget
              </Button>
            }
          >
            <ul className="card divide-y divide-[var(--line)] p-1.5">
              {categories.map((s) => {
                const c = d.categoryById.get(s.budget.categoryId!);
                return (
                  <li key={s.budget.id}>
                    <button type="button" onClick={() => setEditing(s.budget)} className="w-full rounded-[14px] px-2.5 py-3 text-left hover:bg-surface-2" data-testid="budget-row">
                      <div className="mb-2 flex items-center gap-3">
                        <IconTile name={c?.icon} color={c?.color} size={34} iconSize={16} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium">{c?.name ?? 'Category'}</span>
                          <span className="block text-[12.5px] text-text-3">
                            <Money amount={s.spent} tone="muted" /> of <Money amount={s.budget.amount} tone="muted" />
                          </span>
                        </span>
                        <span className={`num text-[14px] font-medium ${s.state === 'over' ? 'text-negative' : s.state === 'warning' ? 'text-warning' : 'text-text'}`}>
                          {s.remaining >= 0 ? `${formatINR(s.remaining, { decimals: 'never' })} left` : `${formatINR(-s.remaining, { decimals: 'never' })} over`}
                        </span>
                      </div>
                      <Progress value={s.usedBps / 10000} tone={stateTone[s.state]} label={`${c?.name} budget used`} />
                      <p className="mt-1.5 text-[11.5px] text-text-3">
                        Last month <Money amount={s.previousSpent} tone="muted" />
                      </p>
                    </button>
                  </li>
                );
              })}
              {categories.length === 0 && <li className="px-3 py-5 text-center text-[14px] text-text-3">No category budgets.</li>}
            </ul>
          </Section>
          {overall && <MonthlyComparison budget={overall.budget} month={month} />}
        </>
      )}
      {editing && <BudgetSheet budget={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function OverallCard({ status: s, onEdit }: { status: BudgetStatus; onEdit: () => void }) {
  return (
    <button type="button" onClick={onEdit} className="card mb-6 w-full p-5 text-left hover:bg-surface-2" data-testid="overall-budget">
      <p className="mb-1 text-[13px] text-text-2">Overall this month</p>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="display-num text-[32px]">
          <Money amount={s.spent} />
          <span className="text-[16px] text-text-3"> / {formatINR(s.budget.amount, { decimals: 'never' })}</span>
        </span>
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${s.state === 'over' ? 'bg-negative-soft text-negative' : s.state === 'warning' ? 'bg-warning-soft text-warning' : 'bg-mint-soft text-positive'}`}>
          {s.state === 'over' ? 'Over budget' : s.state === 'warning' ? `Past ${s.budget.warnAtPct}%` : 'On track'}
        </span>
      </div>
      <Progress value={s.usedBps / 10000} tone={stateTone[s.state]} label="Overall budget used" />
      <p className="mt-2 text-[13px] text-text-2">
        {s.remaining >= 0 ? (
          <>
            <Money amount={s.remaining} className="font-medium text-text" /> remaining
          </>
        ) : (
          <>
            <Money amount={-s.remaining} tone="negative" className="font-medium" /> over
          </>
        )}
        {' · '}last month <Money amount={s.previousSpent} tone="muted" />
      </p>
    </button>
  );
}

function MonthlyComparison({ budget, month }: { budget: Budget; month: string }) {
  const snap = useSnapshot();
  const rows = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5)).map((m) => ({
        m,
        spent: spentForBudget(budget, snap.entries, snap.system!, snap.categories, m),
      })),
    [budget, month, snap.entries, snap.system, snap.categories],
  );
  const max = Math.max(budget.amount, ...rows.map((r) => r.spent), 1);
  return (
    <Section title="Monthly comparison">
      <div className="card p-5">
        <div role="img" aria-label="Spending per month compared with the budget">
          <div className="relative flex h-[120px] items-end gap-3">
            <div
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[var(--line-strong)]"
              style={{ bottom: `${(budget.amount / max) * 100}%` }}
              aria-hidden="true"
            />
            {rows.map((r) => (
              <div key={r.m} className="relative h-full flex-1" title={`${formatMonth(r.m)}: ${formatINR(r.spent)}`}>
                <div
                  className="absolute inset-x-0 bottom-0 h-full origin-bottom rounded-t-[6px]"
                  style={{ transform: `scaleY(${r.spent / max})`, background: r.spent > budget.amount ? 'var(--negative)' : r.m === month ? 'var(--mint)' : 'var(--surface-3)' }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-3">
            {rows.map((r) => (
              <span key={r.m} className="flex-1 text-center text-[11px] text-text-3">
                {formatMonth(r.m, 'MMM')}
              </span>
            ))}
          </div>
        </div>
        <ul className="sr-only">
          {rows.map((r) => (
            <li key={r.m}>
              {formatMonth(r.m)}: {formatINR(r.spent)}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-text-3">Dashed line: budget {formatINR(budget.amount, { decimals: 'never' })} per month. Red bars went over.</p>
      </div>
    </Section>
  );
}

function BudgetSheet({ budget, onClose }: { budget: Budget | null; onClose: () => void }) {
  const store = useStore();
  const snap = useSnapshot();
  const toast = useToast();
  const [categoryId, setCategoryId] = useState<string>(budget ? (budget.categoryId ?? '') : '');
  const [amount, setAmount] = useState(budget ? toDecimalString(budget.amount).replace(/\.00$/, '') : '');
  const [warn, setWarn] = useState(String(budget?.warnAtPct ?? 80));
  const paise = parseRupees(amount);
  const taken = new Set(snap.budgets.filter((b) => b.id !== budget?.id).map((b) => b.categoryId ?? ''));
  const valid = paise !== null && paise > 0 && Number(warn) >= 1 && Number(warn) <= 100 && !taken.has(categoryId);

  const save = async () => {
    try {
      if (budget && (budget.categoryId ?? '') !== categoryId) await store.run((repo) => repo.deleteBudget(budget.id));
      await store.run((repo) => repo.upsertBudget({ categoryId: categoryId || null, amount: paise!, warnAtPct: Number(warn) }), 'budgets');
      onClose();
    } catch (err) {
      toast({ tone: 'error', message: toKoshError(err).friendly });
    }
  };
  const remove = async () => {
    if (!budget) return;
    onClose();
    await store.run((repo) => repo.deleteBudget(budget.id), 'budgets');
    toast({
      message: 'Budget removed',
      action: { label: 'Undo', onClick: () => store.run((repo) => repo.upsertBudget({ categoryId: budget.categoryId, amount: budget.amount, warnAtPct: budget.warnAtPct }), 'budgets') },
    });
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={budget ? 'Edit budget' : 'New budget'}
      footer={
        <div className="flex gap-2">
          {budget && (
            <Button variant="danger" size="lg" onClick={remove} icon={<Trash2 size={17} />} aria-label="Delete budget" />
          )}
          <Button variant="primary" size="lg" block onClick={save} disabled={!valid} data-testid="save-budget">
            Save budget
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        <SelectField label="Applies to" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} error={taken.has(categoryId) ? 'Already has a budget' : undefined} data-testid="budget-category">
          <option value="">Overall (all spending)</option>
          {snap.categories
            .filter((c) => c.kind === 'expense' && !c.parentId && !c.archivedAt)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </SelectField>
        <AmountField label="Monthly amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 8,000" data-testid="budget-amount" />
        <label className="block">
          <span className="mb-1.5 flex justify-between text-[13px] font-medium text-text-2">
            Warn me at <span className="num text-text">{warn}%</span>
          </span>
          <input type="range" min={50} max={100} step={5} value={warn} onChange={(e) => setWarn(e.target.value)} className="h-11 w-full accent-[var(--peri)]" />
        </label>
        <p className="text-[12px] text-text-3">Category budgets include their subcategories.</p>
      </div>
    </Sheet>
  );
}
