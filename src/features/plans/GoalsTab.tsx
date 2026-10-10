import { useMemo, useState } from 'react';
import { Archive, Check, Pencil, Plus, Target, Trash2, Undo2 } from 'lucide-react';
import { EmptyState, Progress, SelectField, TextField } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Sheet } from '@/components/ui/Sheet';
import { Segmented } from '@/components/ui/Segmented';
import { AmountField } from '@/components/ui/AmountField';
import { useToast } from '@/components/ui/Toast';
import { useDerived, useSnapshot, useStore } from '@/data/hooks';
import { goalProgress } from '@/domain/ledger/metrics';
import { diffDays, formatDate, formatRelativeDay } from '@/lib/dates';
import { formatINR, parseRupees, ratioBps, toDecimalString, type Paise } from '@/lib/money';
import { idempotencyKey } from '@/lib/ids';
import { toKoshError } from '@/domain/errors';
import type { GoalContribution, GoalMode, SavingsGoal } from '@/domain/types';

const GOAL_COLORS = ['#2fa47a', '#6c78d8', '#3e9cbf', '#d8913f', '#c3659a', '#9a8f7c'];

export function requiredPerMonth(remaining: Paise, today: string, deadline: string | null): Paise | null {
  if (!deadline || remaining <= 0) return null;
  const days = diffDays(deadline, today);
  if (days <= 0) return remaining;
  return Math.ceil((remaining * 30) / days);
}

export default function GoalsTab() {
  const snap = useSnapshot();
  const d = useDerived();
  const [creating, setCreating] = useState(false);
  const [openGoal, setOpenGoal] = useState<string | null>(null);
  const goals = snap.goals.filter((g) => !g.archivedAt);
  const archived = snap.goals.filter((g) => g.archivedAt);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-[14px] text-text-2">
          {d.earmarked > 0 ? (
            <>
              <Money amount={d.earmarked} className="font-medium text-text" /> earmarked · savings never count as spending
            </>
          ) : (
            'Savings never count as spending.'
          )}
        </p>
        <Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)} data-testid="new-goal">
          Goal
        </Button>
      </div>
      {goals.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Target size={24} />} title="Save with intent" body="Earmark money inside an account, or keep it in its own pot." />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} onOpen={() => setOpenGoal(g.id)} />
          ))}
        </div>
      )}
      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="tap flex cursor-pointer items-center px-1 text-[13px] font-medium uppercase tracking-[0.1em] text-text-3">Archived ({archived.length})</summary>
          <div className="mt-2 grid gap-3 opacity-80 sm:grid-cols-2">
            {archived.map((g) => (
              <GoalCard key={g.id} goal={g} onOpen={() => setOpenGoal(g.id)} />
            ))}
          </div>
        </details>
      )}
      {creating && <GoalFormSheet onClose={() => setCreating(false)} />}
      {openGoal && <GoalSheet goalId={openGoal} onClose={() => setOpenGoal(null)} />}
    </div>
  );
}

function GoalCard({ goal: g, onOpen }: { goal: SavingsGoal; onOpen: () => void }) {
  const snap = useSnapshot();
  const d = useDerived();
  const saved = goalProgress(g, snap.contributions, d.balances);
  const pct = ratioBps(saved, g.target) / 10000;
  const perMonth = requiredPerMonth(g.target - saved, d.today, g.deadline);
  const holder = g.accountId ? d.accountById.get(g.accountId) : undefined;
  return (
    <button type="button" onClick={onOpen} className="card w-full p-5 text-left hover:bg-surface-2" data-testid={`goal-${g.name}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[16px] font-medium">{g.name}</p>
          <p className="text-[12.5px] text-text-3">
            {g.mode === 'earmark' ? `Earmarked${holder ? ` in ${holder.name}` : ''}` : 'Own goal pot'}
            {g.deadline ? ` · by ${formatDate(g.deadline, 'd MMM yyyy')}` : ''}
          </p>
        </div>
        <Ring value={pct} color={g.color ?? 'var(--mint)'} />
      </div>
      <p className="display-num mb-2 text-[24px]">
        <Money amount={saved} /> <span className="text-[14px] text-text-3">of {formatINR(g.target, { decimals: 'never' })}</span>
      </p>
      <Progress value={pct} tone={pct >= 1 ? 'mint' : 'peri'} label={`${g.name} progress`} />
      <p className="mt-2 text-[12.5px] text-text-2">
        {pct >= 1 ? 'Reached — well done.' : perMonth ? `Save ${formatINR(perMonth, { decimals: 'never' })}/month to make it` : `${formatINR(g.target - saved, { decimals: 'never' })} to go`}
      </p>
    </button>
  );
}

function Ring({ value, color }: { value: number; color: string }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" className="shrink-0 -rotate-90">
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="4" />
      <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} />
    </svg>
  );
}

function GoalFormSheet({ goal, onClose }: { goal?: SavingsGoal; onClose: () => void }) {
  const store = useStore();
  const d = useDerived();
  const toast = useToast();
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? toDecimalString(goal.target).replace(/\.00$/, '') : '');
  const [deadline, setDeadline] = useState(goal?.deadline ?? '');
  const [mode, setMode] = useState<GoalMode>(goal?.mode ?? 'earmark');
  const [accountId, setAccountId] = useState(goal?.accountId ?? '');
  const [color, setColor] = useState(goal?.color ?? GOAL_COLORS[0]!);
  const paise = parseRupees(target);
  const valid = name.trim().length > 0 && paise !== null && paise > 0;
  const liquid = d.activeAccounts.filter((a) => a.kind === 'bank' || a.kind === 'cash');

  const save = async () => {
    try {
      if (goal) {
        await store.run((repo) => repo.updateGoal(goal.id, { name, target: paise!, deadline: deadline || null, color }), 'goals');
      } else {
        await store.run(
          (repo) => repo.createGoal({ name, target: paise!, deadline: deadline || null, mode, accountId: mode === 'earmark' ? accountId || null : null, color }),
          'goals',
          'accounts',
        );
      }
      onClose();
    } catch (err) {
      toast({ tone: 'error', message: toKoshError(err).friendly });
    }
  };

  return (
    <Sheet open onClose={onClose} title={goal ? 'Edit goal' : 'New goal'} footer={<Button variant="primary" size="lg" block disabled={!valid} onClick={save} data-testid="save-goal">{goal ? 'Save' : 'Create goal'}</Button>}>
      <div className="space-y-4 pb-2">
        <TextField label="Name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Goa in December" data-testid="goal-name" />
        <div className="grid grid-cols-2 gap-3">
          <AmountField label="Target" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="45,000" data-testid="goal-target" />
          <TextField label="By (optional)" type="date" value={deadline} min={d.today} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        {!goal && (
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-text-2">How should the money be kept?</span>
            <Segmented
              label="Goal mode"
              value={mode}
              onChange={setMode}
              className="w-full"
              options={[
                { value: 'earmark', label: 'Earmark' },
                { value: 'account', label: 'Own pot' },
              ]}
            />
            <p className="mt-2 text-[12.5px] text-text-3">
              {mode === 'earmark'
                ? 'Money stays where it is; Kosh reserves it so “free cash” is honest. Balances don’t move.'
                : 'A separate goal account. Contributions are transfers into it — never expenses.'}
            </p>
          </div>
        )}
        {!goal && mode === 'earmark' && (
          <SelectField label="Kept in (optional)" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Any account</option>
            {liquid.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
        )}
        <div role="radiogroup" aria-label="Colour" className="flex gap-2">
          {GOAL_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Colour ${c}`} onClick={() => setColor(c)} className="tap inline-flex items-center justify-center">
              <span className={`h-7 w-7 rounded-full ${color === c ? 'ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--surface)]' : ''}`} style={{ background: c }} />
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

function GoalSheet({ goalId, onClose }: { goalId: string; onClose: () => void }) {
  const snap = useSnapshot();
  const d = useDerived();
  const store = useStore();
  const toast = useToast();
  const goal = snap.goals.find((g) => g.id === goalId);
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<'add' | 'withdraw'>('add');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(d.today);
  const liquid = d.activeAccounts.filter((a) => a.kind === 'bank' || a.kind === 'cash');
  const [accountId, setAccountId] = useState(goal?.mode === 'earmark' ? (goal.accountId ?? '') : (liquid[0]?.id ?? ''));
  const [key, setKey] = useState(() => idempotencyKey('gc'));
  const [editRow, setEditRow] = useState<{ id: string; value: string } | null>(null);
  const contributions = useMemo(() => snap.contributions.filter((c) => c.goalId === goalId), [snap.contributions, goalId]);
  if (!goal) return null;
  const saved = goalProgress(goal, snap.contributions, d.balances);
  const paise = parseRupees(amount);
  const needsAccount = goal.mode === 'account';

  const submit = async () => {
    if (!paise) return;
    try {
      if (mode === 'add') {
        await store.run((repo) => repo.addGoalContribution({ goalId, amount: paise, contributedOn: date, accountId: accountId || null }, key), 'contributions', 'transactions', 'entries');
        toast({ tone: 'success', message: `${formatINR(paise)} saved towards ${goal.name}` });
      } else {
        await store.run((repo) => repo.withdrawFromGoal({ goalId, amount: paise, toAccountId: accountId, on: date }, key), 'transactions', 'entries');
        toast({ tone: 'success', message: `${formatINR(paise)} moved back` });
      }
      setAmount('');
      setKey(idempotencyKey('gc'));
    } catch (err) {
      toast({ tone: 'error', message: toKoshError(err).friendly });
    }
  };

  const removeContribution = async (c: GoalContribution) => {
    try {
      await store.run((repo) => repo.deleteGoalContribution(c.id), 'contributions', 'transactions', 'entries');
      toast({
        message: 'Contribution removed',
        action: {
          label: 'Undo',
          onClick: () =>
            store.run((repo) => repo.addGoalContribution({ goalId, amount: c.amount, contributedOn: c.contributedOn, accountId: c.accountId, note: c.note }, idempotencyKey('gc')), 'contributions', 'transactions', 'entries'),
        },
      });
    } catch (err) {
      toast({ tone: 'error', message: toKoshError(err).friendly });
    }
  };

  const saveRow = async () => {
    if (!editRow) return;
    const v = parseRupees(editRow.value);
    if (!v) return;
    try {
      await store.run((repo) => repo.updateGoalContribution(editRow.id, { amount: v }), 'contributions', 'transactions', 'entries');
      setEditRow(null);
    } catch (err) {
      toast({ tone: 'error', message: toKoshError(err).friendly });
    }
  };

  const archive = async () => {
    await store.run((repo) => repo.updateGoal(goal.id, { archived: !goal.archivedAt }), 'goals');
    onClose();
    toast({ message: goal.archivedAt ? 'Goal restored' : 'Goal archived', action: { label: 'Undo', onClick: () => store.run((repo) => repo.updateGoal(goal.id, { archived: !!goal.archivedAt }), 'goals') } });
  };

  return (
    <>
      <Sheet open={!editing} onClose={onClose} title={goal.name} testId="goal-sheet">
        <div className="pb-2">
          <p className="display-num mb-1 text-[34px]">
            <Money amount={saved} /> <span className="text-[16px] text-text-3">of {formatINR(goal.target, { decimals: 'never' })}</span>
          </p>
          <Progress value={ratioBps(saved, goal.target) / 10000} label="Progress" />
          <p className="mt-2 text-[12.5px] text-text-3">
            {goal.mode === 'earmark' ? 'Earmarked — balances unchanged, never counted as spending.' : `Kept in its own pot (${d.accountById.get(goal.accountId!)?.name}). Contributions are transfers.`}
          </p>

          {!goal.archivedAt && (
            <div className="mt-5 rounded-[18px] border border-line p-4">
              {goal.mode === 'account' && (
                <Segmented
                  label="Direction"
                  size="sm"
                  value={mode}
                  onChange={setMode}
                  className="mb-3 w-full"
                  options={[
                    { value: 'add', label: 'Add money' },
                    { value: 'withdraw', label: 'Withdraw' },
                  ]}
                />
              )}
              <div className="grid grid-cols-2 gap-3">
                <AmountField label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5,000" data-testid="contribution-amount" />
                <TextField label="Date" type="date" value={date} max={d.today} onChange={(e) => setDate(e.target.value)} />
                <SelectField label={mode === 'withdraw' ? 'To account' : needsAccount ? 'From account' : 'Kept in (optional)'} value={accountId} onChange={(e) => setAccountId(e.target.value)} className="col-span-2">
                  {!needsAccount && <option value="">Not specified</option>}
                  {liquid.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              <Button variant="primary" block className="mt-3" disabled={!paise || (needsAccount && !accountId)} onClick={submit} data-testid="add-contribution">
                {mode === 'add' ? 'Save towards goal' : 'Move money back'}
              </Button>
            </div>
          )}

          <h3 className="mb-2 mt-6 text-[13px] font-medium uppercase tracking-[0.1em] text-text-3">Contributions</h3>
          {contributions.length === 0 ? (
            <p className="py-4 text-center text-[14px] text-text-3">Nothing saved yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {contributions.map((c) => (
                <li key={c.id} className="flex min-h-[56px] items-center gap-2">
                  <div className="min-w-0 flex-1">
                    {editRow?.id === c.id ? (
                      <AmountField label="Amount" value={editRow.value} onChange={(e) => setEditRow({ id: c.id, value: e.target.value })} autoFocus />
                    ) : (
                      <>
                        <Money amount={c.amount} className="text-[15px] font-medium" />
                        <p className="text-[12px] text-text-3">
                          {formatRelativeDay(c.contributedOn, d.today)}
                          {c.accountId ? ` · ${d.accountById.get(c.accountId)?.name}` : ''}
                        </p>
                      </>
                    )}
                  </div>
                  {editRow?.id === c.id ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setEditRow(null)} aria-label="Cancel">
                        <Undo2 size={16} />
                      </Button>
                      <Button size="sm" variant="accent" onClick={saveRow} aria-label="Save contribution">
                        <Check size={16} />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" aria-label="Edit contribution" onClick={() => setEditRow({ id: c.id, value: toDecimalString(c.amount).replace(/\.00$/, '') })}>
                        <Pencil size={16} />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Remove contribution" onClick={() => removeContribution(c)} data-testid="remove-contribution">
                        <Trash2 size={16} />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex gap-2">
            <Button size="sm" icon={<Pencil size={15} />} onClick={() => setEditing(true)}>
              Edit goal
            </Button>
            <Button size="sm" variant="ghost" icon={<Archive size={15} />} onClick={archive}>
              {goal.archivedAt ? 'Unarchive' : 'Archive'}
            </Button>
          </div>
        </div>
      </Sheet>
      {editing && <GoalFormSheet goal={goal} onClose={() => setEditing(false)} />}
    </>
  );
}
