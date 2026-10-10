/**
 * Client store: an in-memory mirror of the user's ledger with optimistic updates.
 *
 * - Optimistic writes are validated and posted locally with the SAME engine the Demo adapter uses
 *   (buildPostings/validateTransaction), so the UI updates in <100ms with correct numbers.
 * - The server write reuses one idempotency key across retries; on failure the change rolls back.
 * - After writes, the authoritative ledger is re-fetched in the background and replaces the mirror.
 */
import { addDays, todayIST, type IsoDate } from '@/lib/dates';
import { idempotencyKey, uuid } from '@/lib/ids';
import { KoshError, toKoshError } from '@/domain/errors';
import { buildPostings, validateTransaction, type LedgerLookup } from '@/domain/ledger/engine';
import { occurrencesBetween } from '@/domain/recurring';
import { lastStatementDate, previousStatementDate } from '@/domain/statements';
import type {
  Account,
  Budget,
  CardStatement,
  Category,
  CreditCardSettings,
  GoalContribution,
  LedgerEntry,
  PaymentCard,
  Profile,
  RecurringOccurrence,
  RecurringRule,
  SavingsGoal,
  Subscription,
  Transaction,
  TransactionInput,
  Uuid,
} from '@/domain/types';
import type { Repository } from './repository';

export interface Snapshot {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  version: number;
  profile: Profile | null;
  accounts: Account[];
  system: Record<'income' | 'expense' | 'equity', Uuid> | null;
  categories: Category[];
  transactions: Transaction[];
  entries: LedgerEntry[];
  budgets: Budget[];
  goals: SavingsGoal[];
  contributions: GoalContribution[];
  rules: RecurringRule[];
  occurrences: RecurringOccurrence[];
  subscriptions: Subscription[];
  cards: PaymentCard[];
  ccSettings: CreditCardSettings[];
  statements: CardStatement[];
  /** Ids of transactions whose server write is still in flight. */
  pending: ReadonlySet<Uuid>;
}

const EMPTY: Snapshot = {
  status: 'loading', error: null, version: 0, profile: null, accounts: [], system: null, categories: [], transactions: [],
  entries: [], budgets: [], goals: [], contributions: [], rules: [], occurrences: [], subscriptions: [], cards: [],
  ccSettings: [], statements: [], pending: new Set(),
};

type Slice = Exclude<keyof Snapshot, 'status' | 'error' | 'version' | 'pending'>;

const sortTx = (a: Transaction, b: Transaction) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt);

/** Retry transient failures with the same idempotency key (a retry can never duplicate). */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const e = toKoshError(err);
      if (e.code !== 'NETWORK' && e.code !== 'UNKNOWN') throw e;
      await new Promise((r) => setTimeout(r, 300 * 2 ** i));
    }
  }
  throw toKoshError(last);
}

export class AppStore {
  private snap: Snapshot = EMPTY;
  private listeners = new Set<() => void>();
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private inflight = 0;

  constructor(readonly repo: Repository) {}

  // --- subscription (useSyncExternalStore) ---------------------------------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snap;

  private set(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch, version: this.snap.version + 1 };
    for (const l of this.listeners) l();
  }

  // --- loading ---------------------------------------------------------------

  async load(): Promise<void> {
    try {
      await this.repo.ensureSetup();
      const r = this.repo;
      const [profile, accounts, system, categories, transactions, entries, budgets, goals, contributions, rules, occurrences, subscriptions, cards, ccSettings, statements] =
        await Promise.all([
          r.getProfile(), r.listAccounts(), r.getSystemAccounts(), r.listCategories(), r.listTransactions(), r.listLedgerEntries(),
          r.listBudgets(), r.listGoals(), r.listGoalContributions(), r.listRecurringRules(), r.listOccurrences(),
          r.listSubscriptions(), r.listPaymentCards(), r.listCreditCardSettings(), r.listCardStatements(),
        ]);
      this.set({
        status: 'ready', error: null, profile, accounts, system, categories, transactions, entries, budgets, goals,
        contributions, rules, occurrences, subscriptions, cards, ccSettings, statements,
      });
      void this.runScheduledJobs();
    } catch (err) {
      this.set({ status: 'error', error: toKoshError(err).friendly });
    }
  }

  async reload(...slices: Slice[]): Promise<void> {
    const r = this.repo;
    const loaders: Record<Slice, () => Promise<unknown>> = {
      profile: () => r.getProfile(), accounts: () => r.listAccounts(), system: () => r.getSystemAccounts(),
      categories: () => r.listCategories(), transactions: () => r.listTransactions(), entries: () => r.listLedgerEntries(),
      budgets: () => r.listBudgets(), goals: () => r.listGoals(), contributions: () => r.listGoalContributions(),
      rules: () => r.listRecurringRules(), occurrences: () => r.listOccurrences(), subscriptions: () => r.listSubscriptions(),
      cards: () => r.listPaymentCards(), ccSettings: () => r.listCreditCardSettings(), statements: () => r.listCardStatements(),
    };
    const values = await Promise.all(slices.map((s) => loaders[s]()));
    this.set(Object.fromEntries(slices.map((s, i) => [s, values[i]])) as Partial<Snapshot>);
  }

  /** Replace the optimistic mirror with the authoritative ledger once writes settle. */
  scheduleLedgerRefresh(delay = 1200) {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      if (this.inflight > 0) return this.scheduleLedgerRefresh(delay);
      void this.reload('transactions', 'entries', 'accounts', 'contributions', 'occurrences', 'statements').catch(() => undefined);
    }, delay);
  }

  // --- local ledger lookup for optimistic validation ---------------------------

  lookup(): LedgerLookup {
    const s = this.snap;
    const accounts = new Map(s.accounts.map((a) => [a.id, a]));
    const sys = s.system;
    if (sys) {
      for (const kind of ['income', 'expense', 'equity'] as const) {
        accounts.set(sys[kind], {
          id: sys[kind], name: kind, kind, isSystem: true, institution: null, color: null, icon: null, sortOrder: 0,
          archivedAt: null, reconciledAt: null, reconciledBalance: null, seedKey: null, createdAt: '',
        });
      }
    }
    const categories = new Map(s.categories.map((c) => [c.id, c]));
    const cards = new Map(s.cards.map((c) => [c.id, c]));
    const txs = new Map(s.transactions.map((t) => [t.id, t]));
    return {
      account: (id) => accounts.get(id),
      category: (id) => categories.get(id),
      card: (id) => cards.get(id),
      transaction: (id) => txs.get(id),
      refundsTotal: (orig, exclude) =>
        s.transactions.filter((t) => t.refundOf === orig && !t.deletedAt && t.id !== exclude).reduce((a, t) => a + t.amount, 0),
      systemAccountId: (kind) => {
        if (!sys) throw new KoshError('SETUP_REQUIRED');
        return sys[kind];
      },
      today: () => todayIST(),
    };
  }

  private entriesFor(t: Transaction): LedgerEntry[] {
    return buildPostings(t, this.lookup()).map((p, i) => ({ ...p, id: `local:${t.id}:${i}` }));
  }

  private replaceTx(oldId: Uuid, next: Transaction | null) {
    const transactions = this.snap.transactions.filter((t) => t.id !== oldId);
    const entries = this.snap.entries.filter((e) => e.transactionId !== oldId);
    if (next) {
      transactions.push(next);
      transactions.sort(sortTx);
      if (!next.deletedAt) entries.push(...this.entriesFor(next));
    }
    return { transactions, entries };
  }

  private track<T>(id: Uuid, p: Promise<T>): Promise<T> {
    this.inflight++;
    const pending = new Set(this.snap.pending);
    pending.add(id);
    this.set({ pending });
    return p.finally(() => {
      this.inflight--;
      const next = new Set(this.snap.pending);
      next.delete(id);
      this.set({ pending: next });
    });
  }

  // --- transactions (optimistic) -------------------------------------------------

  /**
   * Validate locally (throws synchronously on invalid input), show the transaction immediately, and
   * return a promise that settles when the server confirms. On failure the change rolls back.
   */
  beginPost(input: TransactionInput, key = idempotencyKey('tx')): { optimistic: Transaction; done: Promise<Transaction> } {
    const stamp = new Date().toISOString();
    const draft: Transaction = {
      id: uuid(), type: input.type, amount: input.amount, occurredOn: input.occurredOn, accountId: input.accountId,
      toAccountId: input.toAccountId ?? null, categoryId: input.categoryId ?? null, merchant: input.merchant ?? null,
      note: input.note ?? null, paymentCardId: input.paymentCardId ?? null, refundOf: input.refundOf ?? null,
      idempotencyKey: key, deletedAt: null, version: 1, createdAt: stamp, updatedAt: stamp,
    };
    const optimistic = validateTransaction(draft, null, this.lookup());
    this.set(this.replaceTx(optimistic.id, optimistic));
    const done = this.track(optimistic.id, withRetry(() => this.repo.postTransaction(input, key))).then(
      (saved) => {
        this.set(this.replaceTx(optimistic.id, saved));
        this.scheduleLedgerRefresh();
        return saved;
      },
      (err) => {
        // Remove only this optimistic row so concurrent optimistic writes survive the rollback.
        this.set(this.replaceTx(optimistic.id, null));
        throw toKoshError(err);
      },
    );
    return { optimistic, done };
  }

  postTransaction(input: TransactionInput, key = idempotencyKey('tx')): Promise<Transaction> {
    try {
      return this.beginPost(input, key).done;
    } catch (err) {
      return Promise.reject(toKoshError(err));
    }
  }

  beginUpdate(id: Uuid, input: TransactionInput): { optimistic: Transaction; done: Promise<Transaction> } {
    const old = this.snap.transactions.find((t) => t.id === id);
    if (!old) throw new KoshError('NOT_FOUND');
    const optimistic = {
      ...validateTransaction(
        { ...old, ...input, toAccountId: input.toAccountId ?? null, categoryId: input.categoryId ?? null, merchant: input.merchant ?? null, note: input.note ?? null, paymentCardId: input.paymentCardId ?? null, refundOf: input.refundOf ?? null },
        old,
        this.lookup(),
      ),
      version: old.version + 1,
    };
    this.set(this.replaceTx(id, optimistic));
    const done = this.track(id, withRetry(() => this.repo.updateTransaction(id, input, old.version))).then(
      (saved) => {
        this.set(this.replaceTx(id, saved));
        this.scheduleLedgerRefresh();
        return saved;
      },
      (err) => {
        this.set(this.replaceTx(id, old));
        throw toKoshError(err);
      },
    );
    return { optimistic, done };
  }

  updateTransaction(id: Uuid, input: TransactionInput): Promise<Transaction> {
    try {
      return this.beginUpdate(id, input).done;
    } catch (err) {
      return Promise.reject(toKoshError(err));
    }
  }

  async deleteTransaction(id: Uuid): Promise<void> {
    const old = this.snap.transactions.find((t) => t.id === id);
    if (!old) throw new KoshError('NOT_FOUND');
    if (this.snap.transactions.some((t) => t.refundOf === id && !t.deletedAt)) throw new KoshError('HAS_REFUNDS');
    const before = { transactions: this.snap.transactions, entries: this.snap.entries };
    this.set(this.replaceTx(id, { ...old, deletedAt: new Date().toISOString() }));
    try {
      await this.track(id, withRetry(() => this.repo.deleteTransaction(id)));
      this.scheduleLedgerRefresh();
    } catch (err) {
      this.set(before);
      throw toKoshError(err);
    }
  }

  async restoreTransaction(id: Uuid): Promise<void> {
    const old = this.snap.transactions.find((t) => t.id === id);
    if (!old) throw new KoshError('NOT_FOUND');
    const before = { transactions: this.snap.transactions, entries: this.snap.entries };
    this.set(this.replaceTx(id, { ...old, deletedAt: null }));
    try {
      const saved = await this.track(id, withRetry(() => this.repo.restoreTransaction(id)));
      this.set(this.replaceTx(id, saved));
      this.scheduleLedgerRefresh();
    } catch (err) {
      this.set(before);
      throw toKoshError(err);
    }
  }

  // --- non-optimistic writes: call the server, then refresh the affected slices ----

  async run<T>(fn: (repo: Repository) => Promise<T>, ...slices: Slice[]): Promise<T> {
    this.inflight++;
    try {
      const result = await fn(this.repo);
      if (slices.length) await this.reload(...slices);
      return result;
    } catch (err) {
      throw toKoshError(err);
    } finally {
      this.inflight--;
    }
  }

  // --- scheduled jobs: recurring occurrences + card statements ---------------------

  async runScheduledJobs(today: IsoDate = todayIST()): Promise<void> {
    let changed = false;
    const s = this.snap;
    // Recurring: materialise every due date not yet recorded. The server enforces uniqueness.
    for (const rule of s.rules) {
      if (rule.status !== 'active') continue;
      const known = s.occurrences.filter((o) => o.ruleId === rule.id).map((o) => o.dueOn).sort();
      const resumeFrom = known.length ? addDays(known[known.length - 1]!, 1) : rule.startOn;
      // Catch up at most 60 dates per run (oldest first); later runs continue from there.
      const due = occurrencesBetween(rule, resumeFrom, today, 60);
      for (const d of due) {
        try {
          await this.repo.materializeOccurrence(rule.id, d);
          changed = true;
        } catch {
          // NOT_DUE/RULE_INACTIVE races are harmless; the next run retries.
        }
      }
    }
    // Statements: close every past statement date for cards that have settings.
    for (const cs of s.ccSettings) {
      const known = new Set(s.statements.filter((x) => x.accountId === cs.accountId).map((x) => x.periodEnd));
      const firstActivity = s.entries.filter((e) => e.accountId === cs.accountId).reduce<IsoDate | null>((m, e) => (!m || e.occurredOn < m ? e.occurredOn : m), null);
      if (!firstActivity) continue;
      const dates: IsoDate[] = [];
      for (let d = lastStatementDate(today, cs.statementDay); d >= addDays(firstActivity, -1) && dates.length < 24; d = previousStatementDate(d, cs.statementDay)) {
        if (!known.has(d)) dates.push(d);
      }
      for (const d of dates.reverse()) {
        try {
          await this.repo.closeCardStatement(cs.accountId, d);
          changed = true;
        } catch {
          /* retried next run */
        }
      }
    }
    if (changed) await this.reload('occurrences', 'transactions', 'entries', 'statements');
  }
}
