/**
 * Executes ledger vectors against any Repository and asserts every check using the shared
 * metric functions. Used by both the Demo and Supabase test suites.
 */
import { expect } from 'vitest';
import type { Repository } from '@/data/repository';
import { KoshError } from '@/domain/errors';
import { budgetStatus } from '@/domain/budgets';
import {
  balanceOf,
  balancesByAccount,
  cardDebt,
  categoryTotals,
  earmarkedTotal,
  goalProgress,
  netPosition,
  totalIncome,
  totalSpending,
} from '@/domain/ledger/metrics';
import type { TransactionInput } from '@/domain/types';
import { uuid } from '@/lib/ids';
import type { Check, Step, Vector } from './ledgerVectors';

interface RunState {
  refs: Map<string, string>;
  /** Idempotency key used for each transaction ref (to retry or edit). */
  keys: Map<string, string>;
  createdTx: Set<string>;
  categories: Map<string, string>;
}

function ref(state: RunState, name: string): string {
  const id = state.refs.get(name);
  if (!id) throw new Error(`Unknown ref "${name}"`);
  return id;
}

function cat(state: RunState, key: string | undefined): string | null {
  if (!key) return null;
  const id = state.categories.get(key);
  if (!id) throw new Error(`Unknown category seed key "${key}"`);
  return id;
}

async function post(repo: Repository, state: RunState, step: { ref?: string; key?: string }, input: TransactionInput) {
  const key = step.key ?? `tx:${uuid()}`;
  const t = await repo.postTransaction(input, key);
  state.createdTx.add(t.id);
  if (step.ref) {
    state.refs.set(step.ref, t.id);
    state.keys.set(step.ref, key);
  }
}

async function runStep(repo: Repository, state: RunState, step: Step): Promise<void> {
  switch (step.op) {
    case 'account': {
      const a = await repo.createAccount(
        {
          name: `Vector ${step.ref}`,
          kind: step.kind,
          openingBalance: step.opening ?? 0,
          openingOn: step.openingOn,
          statementDay: step.statementDay,
          dueDays: step.dueDays,
        },
        `acct:${uuid()}`,
      );
      state.refs.set(step.ref, a.id);
      return;
    }
    case 'expense':
    case 'income':
    case 'refund':
      await post(repo, state, step, {
        type: step.op,
        amount: step.amount,
        occurredOn: step.on,
        accountId: ref(state, step.account),
        categoryId: cat(state, step.category),
        refundOf: step.refundOf ? ref(state, step.refundOf) : null,
        merchant: step.merchant ?? null,
        note: step.note ?? null,
      });
      return;
    case 'transfer':
    case 'card_payment':
      await post(repo, state, step, {
        type: step.op,
        amount: step.amount,
        occurredOn: step.on,
        accountId: ref(state, step.from),
        toAccountId: ref(state, step.to),
      });
      return;
    case 'edit': {
      const id = ref(state, step.ref);
      const t = await repo.getTransaction(id);
      if (!t) throw new Error(`missing tx ${step.ref}`);
      await repo.updateTransaction(
        id,
        {
          type: t.type,
          amount: step.amount ?? t.amount,
          occurredOn: step.on ?? t.occurredOn,
          accountId: step.account ? ref(state, step.account) : t.accountId,
          toAccountId: t.toAccountId,
          categoryId: step.category ? cat(state, step.category) : t.categoryId,
          merchant: t.merchant,
          note: t.note,
          paymentCardId: t.paymentCardId,
          refundOf: t.refundOf,
        },
        t.version,
      );
      return;
    }
    case 'delete':
      await repo.deleteTransaction(ref(state, step.ref));
      return;
    case 'restore':
      await repo.restoreTransaction(ref(state, step.ref));
      return;
    case 'archive':
      await repo.setAccountArchived(ref(state, step.account), true);
      return;
    case 'reconcile': {
      const t = await repo.reconcileAccount({ accountId: ref(state, step.account), actualBalance: step.actual, asOf: step.asOf }, `rec:${uuid()}`);
      if (t && step.ref) state.refs.set(step.ref, t.id);
      return;
    }
    case 'goal': {
      const g = await repo.createGoal({
        name: `Goal ${step.ref}`,
        target: step.target,
        mode: step.mode,
        accountId: step.account ? ref(state, step.account) : null,
      });
      state.refs.set(step.ref, g.id);
      if (g.accountId && step.mode === 'account') state.refs.set(`goal:${step.ref}`, g.accountId);
      return;
    }
    case 'contribute': {
      const c = await repo.addGoalContribution(
        { goalId: ref(state, step.goal), amount: step.amount, contributedOn: step.on, accountId: step.from ? ref(state, step.from) : null },
        step.key ?? `gc:${uuid()}`,
      );
      if (c.transactionId) state.createdTx.add(c.transactionId);
      if (step.ref) state.refs.set(step.ref, c.id);
      return;
    }
    case 'editContribution':
      await repo.updateGoalContribution(ref(state, step.ref), { amount: step.amount });
      return;
    case 'deleteContribution':
      await repo.deleteGoalContribution(ref(state, step.ref));
      return;
    case 'withdraw': {
      const t = await repo.withdrawFromGoal(
        { goalId: ref(state, step.goal), amount: step.amount, toAccountId: ref(state, step.to), on: step.on },
        `gw:${uuid()}`,
      );
      state.createdTx.add(t.id);
      return;
    }
    case 'cardSettings':
      await repo.upsertCreditCardSettings({ accountId: ref(state, step.account), statementDay: step.statementDay, dueDays: step.dueDays });
      return;
    case 'closeStatement': {
      const s = await repo.closeCardStatement(ref(state, step.account), step.periodEnd);
      state.refs.set(step.ref, s.id);
      return;
    }
    case 'rule': {
      const r = await repo.createRecurringRule({
        name: `Rule ${step.ref}`,
        type: step.type,
        amount: step.amount,
        accountId: ref(state, step.account),
        toAccountId: step.to ? ref(state, step.to) : null,
        categoryId: cat(state, step.category),
        frequency: step.frequency,
        interval: step.interval ?? 1,
        startOn: step.startOn,
        endOn: step.endOn ?? null,
        anchorDay: step.anchorDay ?? null,
        mode: step.mode,
      });
      state.refs.set(step.ref, r.id);
      return;
    }
    case 'subscription': {
      const s = await repo.createSubscription({
        name: `Sub ${step.ref}`,
        amount: step.amount,
        accountId: ref(state, step.account),
        categoryId: cat(state, step.category)!,
        frequency: 'monthly',
        startOn: step.startOn,
        mode: step.mode,
      });
      state.refs.set(step.ref, s.id);
      state.refs.set(step.rule, s.recurringRuleId);
      return;
    }
    case 'ruleStatus':
      await repo.setRecurringStatus(ref(state, step.rule), step.status);
      return;
    case 'materialize': {
      const o = await repo.materializeOccurrence(ref(state, step.rule), step.due);
      if (o.transactionId) state.createdTx.add(o.transactionId);
      if (step.ref) state.refs.set(step.ref, o.id);
      return;
    }
    case 'confirm': {
      const o = await repo.confirmOccurrence(ref(state, step.ref));
      if (o.transactionId) state.createdTx.add(o.transactionId);
      return;
    }
    case 'skip':
      await repo.skipOccurrence(ref(state, step.ref));
      return;
    case 'budget':
      await repo.upsertBudget({ categoryId: step.category ? cat(state, step.category) : null, amount: step.amount, warnAtPct: step.warnAtPct });
      return;
    case 'fails': {
      let caught: unknown = null;
      try {
        await runStep(repo, state, step.step);
      } catch (err) {
        caught = err;
      }
      expect(caught, `expected ${step.code}`).toBeInstanceOf(KoshError);
      expect((caught as KoshError).code).toBe(step.code);
      return;
    }
    case 'check':
      await runCheck(repo, state, step);
      return;
  }
}

async function runCheck(repo: Repository, state: RunState, check: Check): Promise<void> {
  const label = check.label ? ` (${check.label})` : '';
  const [accounts, entries, sys, goals, contributions, txs] = await Promise.all([
    repo.listAccounts(),
    repo.listLedgerEntries(),
    repo.getSystemAccounts(),
    repo.listGoals(),
    repo.listGoalContributions(),
    repo.listTransactions(),
  ]);
  const balances = balancesByAccount(entries);
  const own = new Set([...state.refs.values()]);
  const vectorAccounts = accounts.filter((a) => own.has(a.id));
  const position = netPosition(vectorAccounts, balances);

  // Invariant: the whole ledger is balanced.
  expect(entries.reduce((s, e) => s + e.amount, 0), `ledger balanced${label}`).toBe(0);

  for (const [name, amount] of Object.entries(check.balances ?? {})) {
    expect(balanceOf(balances, ref(state, name)), `balance ${name}${label}`).toBe(amount);
  }
  for (const [name, amount] of Object.entries(check.debt ?? {})) {
    expect(cardDebt(balances, ref(state, name)), `debt ${name}${label}`).toBe(amount);
  }
  if (check.netWorth !== undefined) expect(position.netWorth, `net worth${label}`).toBe(check.netWorth);
  if (check.availableCash !== undefined) expect(position.availableCash, `available cash${label}`).toBe(check.availableCash);
  if (check.spending) {
    expect(totalSpending(entries, sys, check.spending.from, check.spending.to), `spending${label}`).toBe(check.spending.amount);
  }
  if (check.income) {
    expect(totalIncome(entries, sys, check.income.from, check.income.to), `income${label}`).toBe(check.income.amount);
  }
  if (check.categorySpending) {
    const c = check.categorySpending;
    const totals = categoryTotals(entries, sys, 'expense', c.from, c.to);
    expect(totals.get(cat(state, c.category)!) ?? 0, `category ${c.category}${label}`).toBe(c.amount);
  }
  if (check.statement) {
    const s = (await repo.listCardStatements()).find((x) => x.id === ref(state, check.statement!.ref));
    expect(s, 'statement exists').toBeDefined();
    expect(s!.statementBalance, `statement balance${label}`).toBe(check.statement.balance);
    expect(s!.minimumDue, `minimum due${label}`).toBe(check.statement.minimumDue);
    if (check.statement.periodStart) expect(s!.periodStart).toBe(check.statement.periodStart);
    if (check.statement.dueOn) expect(s!.dueOn).toBe(check.statement.dueOn);
  }
  if (check.occurrence) {
    const all = await repo.listOccurrences();
    const o = all.find((x) => x.id === ref(state, check.occurrence!.ref));
    expect(o?.status, `occurrence status${label}`).toBe(check.occurrence.status);
  }
  if (check.occurrenceCount) {
    const all = await repo.listOccurrences({ ruleId: ref(state, check.occurrenceCount.rule) });
    expect(all.length, `occurrence count${label}`).toBe(check.occurrenceCount.count);
  }
  if (check.transactionCount !== undefined) {
    const live = txs.filter((t) => t.type !== 'opening_balance' && (vectorAccounts.some((a) => a.id === t.accountId)));
    expect(live.length, `transaction count${label}`).toBe(check.transactionCount);
  }
  for (const [name, amount] of Object.entries(check.goalProgress ?? {})) {
    const g = goals.find((x) => x.id === ref(state, name));
    expect(g, `goal ${name}`).toBeDefined();
    expect(goalProgress(g!, contributions, balances), `goal progress ${name}${label}`).toBe(amount);
  }
  if (check.earmarked !== undefined) expect(earmarkedTotal(goals, contributions), `earmarked${label}`).toBe(check.earmarked);
  if (check.budget) {
    const b = (await repo.listBudgets()).find((x) => x.categoryId === (check.budget!.category ? cat(state, check.budget!.category) : null));
    expect(b, 'budget exists').toBeDefined();
    const status = budgetStatus(b!, entries, sys, await repo.listCategories(), check.budget.month);
    expect(status.spent, `budget spent${label}`).toBe(check.budget.spent);
    if (check.budget.state) expect(status.state, `budget state${label}`).toBe(check.budget.state);
  }
  if (check.sameId) expect(ref(state, check.sameId[0])).toBe(ref(state, check.sameId[1]));
}

export async function runVector(repo: Repository, vector: Vector): Promise<void> {
  await repo.ensureSetup();
  const categories = await repo.listCategories();
  const state: RunState = {
    refs: new Map(),
    keys: new Map(),
    createdTx: new Set(),
    categories: new Map(categories.filter((c) => c.seedKey).map((c) => [c.seedKey!, c.id])),
  };
  for (const step of vector.steps) await runStep(repo, state, step);
}
