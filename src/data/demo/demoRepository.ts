import { addDays, todayIST, type IsoDate } from '@/lib/dates';
import { uuid } from '@/lib/ids';
import { MAX_ABS_PAISE, type Paise } from '@/lib/money';
import { fail } from '@/domain/errors';
import { buildPostings, checkDate, hasCardLikeNumber, validateTransaction, type LedgerLookup } from '@/domain/ledger/engine';
import { isScheduled } from '@/domain/recurring';
import { isStatementDate, minimumDue, statementPeriod } from '@/domain/statements';
import { normalizeLast4, sanitizeArtwork } from '@/domain/cards/artwork';
import { SEED_CATEGORIES } from '@/domain/seed';
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
  RecurringStatus,
  SavingsGoal,
  Subscription,
  Transaction,
  TransactionInput,
  Uuid,
} from '@/domain/types';
import { CARD_NETWORKS, CARD_TYPES, RECURRING_TYPES } from '@/domain/types';
import type {
  AccountPatch,
  AssistantReply,
  BudgetInput,
  CategoryInput,
  ContributionInput,
  ContributionPatch,
  CreateAccountInput,
  CreditCardSettingsInput,
  GoalInput,
  GoalPatch,
  LedgerQuery,
  PaymentCardInput,
  PaymentCardPatch,
  ReconcileInput,
  RecurringRuleInput,
  Repository,
  SubscriptionInput,
  TransactionQuery,
} from '../repository';
import type { Writer } from './store';
import { DemoStore } from './store';

type AccountRow = Account & { creationKey?: string | null };
type ContributionRow = GoalContribution & { idempotencyKey: string };
type MetaRow = { id: string; value: unknown };
type SettingsRow = CreditCardSettings & { id: string };

const now = () => new Date().toISOString();
const text = (v: string | null | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

function requireKey(key: string) {
  if (typeof key !== 'string' || key.length < 8 || key.length > 200) fail('INVALID_INPUT', 'idempotency key must be 8-200 characters');
}

function requireName(name: string | undefined | null, maxLen: number): string {
  const n = name?.trim() ?? '';
  if (n.length < 1 || n.length > maxLen) fail('INVALID_INPUT', `name must be 1-${maxLen} characters`);
  if (hasCardLikeNumber(n)) fail('SENSITIVE_DATA');
  return n;
}

function requirePositive(amount: unknown): Paise {
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_ABS_PAISE) fail('INVALID_AMOUNT');
  return amount;
}

function checkColor(c: string | null | undefined): string | null {
  if (c == null) return null;
  if (!/^#[0-9a-fA-F]{6}$/.test(c)) fail('INVALID_INPUT', 'color must be #rrggbb');
  return c;
}

interface DemoOptions {
  today?: () => IsoDate;
}

export class DemoRepository implements Repository {
  readonly mode = 'demo' as const;
  private readonly today: () => IsoDate;

  constructor(
    readonly store: DemoStore,
    opts: DemoOptions = {},
  ) {
    this.today = opts.today ?? (() => todayIST());
  }

  private lookup(w: Writer): LedgerLookup {
    return {
      account: (id) => w.get<Account>('accounts', id),
      category: (id) => w.get<Category>('categories', id),
      card: (id) => w.get<PaymentCard>('cards', id),
      transaction: (id) => w.get<Transaction>('transactions', id),
      refundsTotal: (originalId, excludeId) =>
        w
          .all<Transaction>('transactions')
          .filter((t) => t.refundOf === originalId && !t.deletedAt && t.id !== excludeId)
          .reduce((s, t) => s + t.amount, 0),
      systemAccountId: (kind) => {
        const a = w.all<Account>('accounts').find((x) => x.isSystem && x.kind === kind);
        if (!a) fail('SETUP_REQUIRED');
        return a.id;
      },
      today: this.today,
    };
  }

  private userAccount(w: Writer, id: Uuid | null | undefined): Account {
    const a = id ? w.get<Account>('accounts', id) : undefined;
    if (!a || a.isSystem) fail('ACCOUNT_NOT_FOUND');
    return a;
  }

  private postEntries(w: Writer, t: Transaction) {
    w.delete('entries', `${t.id}:0`);
    w.delete('entries', `${t.id}:1`);
    const postings = buildPostings(t, this.lookup(w));
    const total = postings.reduce((s, p) => s + p.amount, 0);
    if (total !== 0) fail('UNBALANCED');
    postings.forEach((p, i) => w.put<LedgerEntry>('entries', { ...p, id: `${t.id}:${i}` }));
  }

  private insertTx(w: Writer, draft: Omit<Transaction, 'id' | 'version' | 'deletedAt' | 'createdAt' | 'updatedAt'> & { id?: Uuid }): Transaction {
    const existing = w.all<Transaction>('transactions').find((t) => t.idempotencyKey === draft.idempotencyKey);
    if (existing) return existing;
    const stamp = now();
    const base: Transaction = { ...draft, id: draft.id ?? uuid(), version: 1, deletedAt: null, createdAt: stamp, updatedAt: stamp };
    const t = validateTransaction(base, null, this.lookup(w));
    w.put('transactions', t);
    this.postEntries(w, t);
    return t;
  }

  private applyUpdate(w: Writer, old: Transaction, input: TransactionInput, oldForValidation: Transaction = old): Transaction {
    const draft: Transaction = {
      ...old,
      type: input.type,
      amount: input.amount,
      occurredOn: input.occurredOn,
      accountId: input.accountId,
      toAccountId: input.toAccountId ?? null,
      categoryId: input.categoryId ?? null,
      merchant: input.merchant ?? null,
      note: input.note ?? null,
      paymentCardId: input.paymentCardId ?? null,
      refundOf: input.refundOf ?? null,
    };
    const t = validateTransaction(draft, oldForValidation, this.lookup(w));
    const saved: Transaction = { ...t, version: old.version + 1, updatedAt: now() };
    w.put('transactions', saved);
    this.postEntries(w, saved);
    if (saved.type === 'goal_transfer') {
      for (const c of w.all<ContributionRow>('contributions')) {
        if (c.transactionId === saved.id) w.put('contributions', { ...c, amount: saved.amount, contributedOn: saved.occurredOn });
      }
    }
    return saved;
  }

  private softDelete(w: Writer, t: Transaction) {
    if (t.deletedAt) return;
    if (w.all<Transaction>('transactions').some((x) => x.refundOf === t.id && !x.deletedAt)) fail('HAS_REFUNDS');
    const saved = { ...t, deletedAt: now(), version: t.version + 1, updatedAt: now() };
    w.put('transactions', saved);
    this.postEntries(w, saved);
  }

  async ensureSetup(): Promise<void> {
    await this.store.mutate((w) => {
      const meta = w.get<MetaRow>('meta', 'seed_version');
      if (meta && (meta.value as number) >= 1) return;
      const stamp = now();
      w.put<Profile & { id: string }>('meta', { id: 'profile', displayName: null, currency: 'INR', timezone: 'Asia/Kolkata' } as never);
      const sys = (['income', 'expense', 'equity'] as const).map((kind) => ({
        id: uuid(), name: { income: 'Income', expense: 'Expenses', equity: 'Equity' }[kind], kind, isSystem: true,
        institution: null, color: null, icon: null, sortOrder: 0, archivedAt: null, reconciledAt: null,
        reconciledBalance: null, seedKey: null, createdAt: stamp,
      }));
      for (const a of sys) if (!w.all<Account>('accounts').some((x) => x.isSystem && x.kind === a.kind)) w.put('accounts', a);

      let order = 0;
      const byKey = new Map<string, Uuid>();
      for (const c of SEED_CATEGORIES) {
        order += 1;
        const id = uuid();
        byKey.set(c.key, id);
        w.put<Category>('categories', {
          id, parentId: null, kind: c.kind, name: c.name, icon: c.icon, color: c.color, sortOrder: order, archivedAt: null, seedKey: c.key,
        });
        for (const child of c.children ?? []) {
          order += 1;
          w.put<Category>('categories', {
            id: uuid(), parentId: id, kind: c.kind, name: child.name, icon: child.icon, color: null, sortOrder: order, archivedAt: null, seedKey: child.key,
          });
        }
      }
      w.put<MetaRow>('meta', { id: 'seed_version', value: 1 });
    });
  }

  async getProfile(): Promise<Profile> {
    const p = this.store.get<Profile & { id: string }>('meta', 'profile');
    return { id: 'demo-user', displayName: p?.displayName ?? null, currency: 'INR', timezone: 'Asia/Kolkata' };
  }

  async updateProfile(patch: { displayName?: string | null }): Promise<void> {
    await this.store.mutate((w) => {
      const p = w.get<Profile & { id: string }>('meta', 'profile');
      const displayName = patch.displayName === undefined ? (p?.displayName ?? null) : text(patch.displayName);
      if (displayName && displayName.length > 80) fail('INVALID_INPUT');
      w.put('meta', { id: 'profile', displayName, currency: 'INR', timezone: 'Asia/Kolkata' } as never);
    });
  }

  async listAccounts(): Promise<Account[]> {
    return this.store
      .all<AccountRow>('accounts')
      .filter((a) => !a.isSystem)
      .map(({ creationKey: _ck, ...a }) => a)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  }

  async getSystemAccounts() {
    const sys = this.store.all<Account>('accounts').filter((a) => a.isSystem);
    const id = (k: string) => {
      const a = sys.find((x) => x.kind === k);
      if (!a) fail('SETUP_REQUIRED');
      return a.id;
    };
    return { income: id('income'), expense: id('expense'), equity: id('equity') };
  }

  async createAccount(input: CreateAccountInput, key: string): Promise<Account> {
    requireKey(key);
    await this.ensureSetup();
    return this.store.mutate((w) => {
      const existing = w.all<AccountRow>('accounts').find((a) => a.creationKey === key);
      if (existing) return existing;
      if (!['cash', 'bank', 'credit_card', 'goal'].includes(input.kind)) fail('INVALID_ACCOUNT_KIND');
      const opening = input.openingBalance ?? 0;
      if (!Number.isSafeInteger(opening)) fail('INVALID_INPUT');
      const institution = text(input.institution);
      if (institution && (institution.length > 60 || hasCardLikeNumber(institution))) fail('INVALID_INPUT');
      const userAccounts = w.all<Account>('accounts').filter((a) => !a.isSystem);
      const a: AccountRow = {
        id: uuid(), name: requireName(input.name, 60), kind: input.kind, isSystem: false, institution,
        color: checkColor(input.color), icon: input.icon ?? null,
        sortOrder: userAccounts.reduce((m, x) => Math.max(m, x.sortOrder), 0) + 1,
        archivedAt: null, reconciledAt: null, reconciledBalance: null, seedKey: null, createdAt: now(), creationKey: key,
      };
      w.put('accounts', a);
      if (opening !== 0) {
        this.insertTx(w, {
          type: 'opening_balance', amount: opening, occurredOn: input.openingOn ?? this.today(), accountId: a.id,
          toAccountId: null, categoryId: null, merchant: null, note: 'Opening balance', paymentCardId: null, refundOf: null,
          idempotencyKey: `open:${a.id}`,
        });
      }
      if (a.kind === 'credit_card' && input.statementDay != null) {
        this.putSettings(w, { accountId: a.id, statementDay: input.statementDay, dueDays: input.dueDays ?? 20, creditLimit: input.creditLimit ?? null });
      }
      return a;
    }).then(({ creationKey: _ck, ...a }: AccountRow) => a);
  }

  async updateAccount(id: Uuid, patch: AccountPatch): Promise<void> {
    await this.store.mutate((w) => {
      const a = this.userAccount(w, id);
      const institution = patch.institution === undefined ? a.institution : text(patch.institution);
      if (institution && (institution.length > 60 || hasCardLikeNumber(institution))) fail('INVALID_INPUT');
      w.put<Account>('accounts', {
        ...a,
        name: patch.name === undefined ? a.name : requireName(patch.name, 60),
        institution,
        color: patch.color === undefined ? a.color : checkColor(patch.color),
        icon: patch.icon === undefined ? a.icon : patch.icon,
        sortOrder: patch.sortOrder ?? a.sortOrder,
      });
    });
  }

  async setAccountArchived(id: Uuid, archived: boolean): Promise<void> {
    await this.store.mutate((w) => {
      const a = this.userAccount(w, id);
      w.put<Account>('accounts', { ...a, archivedAt: archived ? (a.archivedAt ?? now()) : null });
    });
  }

  async reconcileAccount(input: ReconcileInput, key: string): Promise<Transaction | null> {
    requireKey(key);
    return this.store.mutate((w) => {
      const existing = w.all<Transaction>('transactions').find((t) => t.idempotencyKey === key);
      if (existing) return existing;
      const a = this.userAccount(w, input.accountId);
      if (!Number.isSafeInteger(input.actualBalance) || Math.abs(input.actualBalance) > MAX_ABS_PAISE) fail('INVALID_AMOUNT');
      checkDate(input.asOf, this.today());
      const current = w
        .all<LedgerEntry>('entries')
        .filter((e) => e.accountId === a.id && e.occurredOn <= input.asOf)
        .reduce((s, e) => s + e.amount, 0);
      w.put<Account>('accounts', { ...a, reconciledAt: now(), reconciledBalance: input.actualBalance });
      if (current === input.actualBalance) return null;
      return this.insertTx(w, {
        type: 'adjustment', amount: input.actualBalance - current, occurredOn: input.asOf, accountId: a.id,
        toAccountId: null, categoryId: null, merchant: null, note: 'Reconciliation adjustment', paymentCardId: null,
        refundOf: null, idempotencyKey: key,
      });
    });
  }

  async listTransactions(q: TransactionQuery = {}): Promise<Transaction[]> {
    return this.store
      .all<Transaction>('transactions')
      .filter(
        (t) =>
          (q.includeDeleted || !t.deletedAt) &&
          (!q.from || t.occurredOn >= q.from) &&
          (!q.to || t.occurredOn <= q.to) &&
          (!q.accountId || t.accountId === q.accountId || t.toAccountId === q.accountId) &&
          (!q.categoryId || t.categoryId === q.categoryId) &&
          (!q.types || q.types.includes(t.type)),
      )
      .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt));
  }

  async getTransaction(id: Uuid): Promise<Transaction | null> {
    return this.store.get<Transaction>('transactions', id) ?? null;
  }

  async postTransaction(input: TransactionInput, key: string): Promise<Transaction> {
    requireKey(key);
    if (['opening_balance', 'adjustment', 'goal_transfer'].includes(input.type)) {
      fail('INVALID_INPUT', 'use createAccount, reconcileAccount or goal contributions');
    }
    return this.store.mutate((w) =>
      this.insertTx(w, {
        type: input.type, amount: input.amount, occurredOn: input.occurredOn, accountId: input.accountId,
        toAccountId: input.toAccountId ?? null, categoryId: input.categoryId ?? null, merchant: input.merchant ?? null,
        note: input.note ?? null, paymentCardId: input.paymentCardId ?? null, refundOf: input.refundOf ?? null,
        idempotencyKey: key,
      }),
    );
  }

  async updateTransaction(id: Uuid, input: TransactionInput, expectedVersion?: number): Promise<Transaction> {
    return this.store.mutate((w) => {
      const old = w.get<Transaction>('transactions', id);
      if (!old || old.deletedAt) fail('NOT_FOUND');
      if (expectedVersion != null && old.version !== expectedVersion) fail('VERSION_CONFLICT');
      return this.applyUpdate(w, old, input);
    });
  }

  async deleteTransaction(id: Uuid): Promise<void> {
    await this.store.mutate((w) => {
      const t = w.get<Transaction>('transactions', id);
      if (!t) fail('NOT_FOUND');
      this.softDelete(w, t);
    });
  }

  async restoreTransaction(id: Uuid): Promise<Transaction> {
    return this.store.mutate((w) => {
      const t = w.get<Transaction>('transactions', id);
      if (!t) fail('NOT_FOUND');
      if (!t.deletedAt) return t;
      const valid = validateTransaction({ ...t, deletedAt: null }, null, this.lookup(w));
      const saved = { ...valid, deletedAt: null, version: t.version + 1, updatedAt: now() };
      w.put('transactions', saved);
      this.postEntries(w, saved);
      return saved;
    });
  }

  async listLedgerEntries(q: LedgerQuery = {}): Promise<LedgerEntry[]> {
    return this.store
      .all<LedgerEntry>('entries')
      .filter((e) => (!q.from || e.occurredOn >= q.from) && (!q.to || e.occurredOn <= q.to) && (!q.accountId || e.accountId === q.accountId));
  }

  async listCategories(): Promise<Category[]> {
    return this.store.all<Category>('categories').sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  private checkCategory(w: Writer, c: Category) {
    if (c.parentId) {
      const parent = w.get<Category>('categories', c.parentId);
      if (!parent) fail('CATEGORY_NOT_FOUND');
      if (parent.parentId) fail('INVALID_INPUT', 'subcategories cannot be nested');
      if (parent.kind !== c.kind) fail('CATEGORY_KIND_MISMATCH');
      if (parent.id === c.id) fail('INVALID_INPUT');
    }
    const clash = w
      .all<Category>('categories')
      .some((x) => x.id !== c.id && x.kind === c.kind && x.parentId === c.parentId && x.name === c.name);
    if (clash) fail('INVALID_INPUT', 'a category with that name already exists');
  }

  async createCategory(input: CategoryInput): Promise<Category> {
    return this.store.mutate((w) => {
      if (input.kind !== 'expense' && input.kind !== 'income') fail('INVALID_INPUT');
      const c: Category = {
        id: uuid(), parentId: input.parentId ?? null, kind: input.kind, name: requireName(input.name, 40),
        icon: input.icon ?? null, color: checkColor(input.color),
        sortOrder: w.all<Category>('categories').reduce((m, x) => Math.max(m, x.sortOrder), 0) + 1,
        archivedAt: null, seedKey: null,
      };
      this.checkCategory(w, c);
      return w.put('categories', c);
    });
  }

  async updateCategory(id: Uuid, patch: Partial<Omit<CategoryInput, 'kind'>> & { archived?: boolean }): Promise<void> {
    await this.store.mutate((w) => {
      const c = w.get<Category>('categories', id);
      if (!c) fail('CATEGORY_NOT_FOUND');
      const next: Category = {
        ...c,
        name: patch.name === undefined ? c.name : requireName(patch.name, 40),
        parentId: patch.parentId === undefined ? c.parentId : patch.parentId,
        icon: patch.icon === undefined ? c.icon : patch.icon,
        color: patch.color === undefined ? c.color : checkColor(patch.color),
        archivedAt: patch.archived === undefined ? c.archivedAt : patch.archived ? (c.archivedAt ?? now()) : null,
      };
      this.checkCategory(w, next);
      w.put('categories', next);
    });
  }

  async listBudgets(): Promise<Budget[]> {
    return this.store.all<Budget>('budgets');
  }

  async upsertBudget(input: BudgetInput): Promise<Budget> {
    return this.store.mutate((w) => {
      const amount = requirePositive(input.amount);
      const warnAtPct = input.warnAtPct ?? 80;
      if (!Number.isInteger(warnAtPct) || warnAtPct < 1 || warnAtPct > 100) fail('INVALID_INPUT');
      if (input.categoryId) {
        const c = w.get<Category>('categories', input.categoryId);
        if (!c) fail('CATEGORY_NOT_FOUND');
        if (c.kind !== 'expense') fail('CATEGORY_KIND_MISMATCH');
      }
      const existing = w.all<Budget>('budgets').find((b) => b.categoryId === (input.categoryId ?? null));
      return w.put<Budget>('budgets', {
        id: existing?.id ?? uuid(), categoryId: input.categoryId ?? null, amount, warnAtPct, createdAt: existing?.createdAt ?? now(),
      });
    });
  }

  async deleteBudget(id: Uuid): Promise<void> {
    await this.store.mutate((w) => w.delete('budgets', id));
  }

  async listGoals(): Promise<SavingsGoal[]> {
    return this.store.all<SavingsGoal>('goals').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async createGoal(input: GoalInput): Promise<SavingsGoal> {
    await this.ensureSetup();
    return this.store.mutate((w) => {
      if (input.mode !== 'earmark' && input.mode !== 'account') fail('INVALID_INPUT');
      const name = requireName(input.name, 60);
      const target = requirePositive(input.target);
      if (input.deadline) checkDate(input.deadline, addDays(this.today(), 365 * 60));
      let accountId = input.accountId ?? null;
      if (input.mode === 'account' && !accountId) {
        const userAccounts = w.all<Account>('accounts').filter((a) => !a.isSystem);
        accountId = w.put<Account>('accounts', {
          id: uuid(), name, kind: 'goal', isSystem: false, institution: null, color: checkColor(input.color), icon: input.icon ?? null,
          sortOrder: userAccounts.reduce((m, x) => Math.max(m, x.sortOrder), 0) + 1, archivedAt: null, reconciledAt: null,
          reconciledBalance: null, seedKey: null, createdAt: now(),
        }).id;
      }
      if (accountId) {
        const a = this.userAccount(w, accountId);
        if (input.mode === 'account' && a.kind !== 'goal') fail('INVALID_ACCOUNT_KIND');
        if (input.mode === 'earmark' && a.kind !== 'cash' && a.kind !== 'bank') fail('INVALID_ACCOUNT_KIND');
        if (input.mode === 'account' && w.all<SavingsGoal>('goals').some((g) => g.mode === 'account' && g.accountId === accountId)) {
          fail('INVALID_INPUT', 'that goal account already backs a goal');
        }
      }
      return w.put<SavingsGoal>('goals', {
        id: uuid(), name, target, deadline: input.deadline ?? null, mode: input.mode, accountId,
        color: checkColor(input.color), icon: input.icon ?? null, archivedAt: null, createdAt: now(),
      });
    });
  }

  async updateGoal(id: Uuid, patch: GoalPatch): Promise<void> {
    await this.store.mutate((w) => {
      const g = w.get<SavingsGoal>('goals', id);
      if (!g) fail('NOT_FOUND');
      w.put<SavingsGoal>('goals', {
        ...g,
        name: patch.name === undefined ? g.name : requireName(patch.name, 60),
        target: patch.target === undefined ? g.target : requirePositive(patch.target),
        deadline: patch.deadline === undefined ? g.deadline : patch.deadline,
        color: patch.color === undefined ? g.color : checkColor(patch.color),
        icon: patch.icon === undefined ? g.icon : patch.icon,
        archivedAt: patch.archived === undefined ? g.archivedAt : patch.archived ? (g.archivedAt ?? now()) : null,
      });
    });
  }

  async deleteGoal(id: Uuid): Promise<void> {
    await this.store.mutate((w) => {
      w.delete('goals', id);
      for (const c of w.all<ContributionRow>('contributions')) if (c.goalId === id) w.delete('contributions', c.id);
    });
  }

  async listGoalContributions(goalId?: Uuid): Promise<GoalContribution[]> {
    const txs = new Map(this.store.all<Transaction>('transactions').map((t) => [t.id, t]));
    return this.store
      .all<ContributionRow>('contributions')
      .filter((c) => (!goalId || c.goalId === goalId) && (!c.transactionId || !txs.get(c.transactionId)?.deletedAt))
      .map(({ idempotencyKey: _k, ...c }) => c)
      .sort((a, b) => b.contributedOn.localeCompare(a.contributedOn) || b.createdAt.localeCompare(a.createdAt));
  }

  private contributionSource(w: Writer, accountId: Uuid | null | undefined): Uuid | null {
    if (!accountId) return null;
    const a = this.userAccount(w, accountId);
    if (a.kind !== 'cash' && a.kind !== 'bank') fail('INVALID_ACCOUNT_KIND');
    return a.id;
  }

  async addGoalContribution(input: ContributionInput, key: string): Promise<GoalContribution> {
    requireKey(key);
    return this.store.mutate((w) => {
      const existing = w.all<ContributionRow>('contributions').find((c) => c.idempotencyKey === key);
      if (existing) return existing;
      const g = w.get<SavingsGoal>('goals', input.goalId);
      if (!g) fail('NOT_FOUND');
      if (g.archivedAt) fail('GOAL_ARCHIVED');
      const amount = requirePositive(input.amount);
      const on = input.contributedOn ?? this.today();
      checkDate(on, this.today());
      const src = this.contributionSource(w, input.accountId);
      const note = text(input.note);
      let transactionId: Uuid | null = null;
      if (g.mode === 'account') {
        if (!src) fail('INVALID_INPUT', 'choose the account the money comes from');
        transactionId = this.insertTx(w, {
          type: 'goal_transfer', amount, occurredOn: on, accountId: src, toAccountId: g.accountId, categoryId: null,
          merchant: null, note: note ?? `Saved towards ${g.name}`, paymentCardId: null, refundOf: null, idempotencyKey: `goal:${key}`,
        }).id;
      }
      return w.put<ContributionRow>('contributions', {
        id: uuid(), goalId: g.id, amount, contributedOn: on, accountId: src, transactionId, note, createdAt: now(), idempotencyKey: key,
      });
    }).then(({ idempotencyKey: _k, ...c }: ContributionRow) => c);
  }

  async updateGoalContribution(id: Uuid, patch: ContributionPatch): Promise<GoalContribution> {
    return this.store.mutate((w) => {
      const c = w.get<ContributionRow>('contributions', id);
      if (!c) fail('NOT_FOUND');
      const g = w.get<SavingsGoal>('goals', c.goalId)!;
      const amount = patch.amount === undefined ? c.amount : requirePositive(patch.amount);
      const on = patch.contributedOn ?? c.contributedOn;
      checkDate(on, this.today());
      const src = patch.accountId === undefined ? c.accountId : this.contributionSource(w, patch.accountId);
      const note = patch.note === undefined ? c.note : text(patch.note);
      if (g.mode === 'account') {
        if (!src) fail('INVALID_INPUT', 'choose the account the money comes from');
        const old = c.transactionId ? w.get<Transaction>('transactions', c.transactionId) : undefined;
        if (!old || old.deletedAt) fail('NOT_FOUND', 'contribution transfer was deleted');
        this.applyUpdate(
          w,
          old,
          { type: 'goal_transfer', amount, occurredOn: on, accountId: src, toAccountId: old.toAccountId, note: old.note },
          { ...old, accountId: src },
        );
      }
      return w.put<ContributionRow>('contributions', { ...c, amount, contributedOn: on, accountId: src, note });
    }).then(({ idempotencyKey: _k, ...c }: ContributionRow) => c);
  }

  async deleteGoalContribution(id: Uuid): Promise<void> {
    await this.store.mutate((w) => {
      const c = w.get<ContributionRow>('contributions', id);
      if (!c) fail('NOT_FOUND');
      if (c.transactionId) {
        const t = w.get<Transaction>('transactions', c.transactionId);
        if (t) this.softDelete(w, t);
      }
      w.delete('contributions', c.id);
    });
  }

  async withdrawFromGoal(input: { goalId: Uuid; amount: Paise; toAccountId: Uuid; on?: IsoDate }, key: string): Promise<Transaction> {
    requireKey(key);
    return this.store.mutate((w) => {
      const g = w.get<SavingsGoal>('goals', input.goalId);
      if (!g) fail('NOT_FOUND');
      if (g.mode !== 'account') fail('INVALID_INPUT', 'earmarked goals release money by removing contributions');
      return this.insertTx(w, {
        type: 'goal_transfer', amount: input.amount, occurredOn: input.on ?? this.today(), accountId: g.accountId!,
        toAccountId: input.toAccountId, categoryId: null, merchant: null, note: `Withdrawn from ${g.name}`,
        paymentCardId: null, refundOf: null, idempotencyKey: key,
      });
    });
  }

  async listRecurringRules(): Promise<RecurringRule[]> {
    return this.store.all<RecurringRule>('rules').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private checkRule(w: Writer, r: RecurringRule, old: RecurringRule | null): RecurringRule {
    if (!(RECURRING_TYPES as readonly string[]).includes(r.type)) fail('INVALID_INPUT');
    requireName(r.name, 60);
    requirePositive(r.amount);
    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(r.frequency)) fail('INVALID_INPUT');
    if (!Number.isInteger(r.interval) || r.interval < 1 || r.interval > 365) fail('INVALID_INPUT');
    if (r.anchorDay != null && (!Number.isInteger(r.anchorDay) || r.anchorDay < 1 || r.anchorDay > 31)) fail('INVALID_INPUT');
    if (r.endOn && r.endOn < r.startOn) fail('INVALID_INPUT', 'end date is before start');
    if (r.mode !== 'reminder' && r.mode !== 'automatic') fail('INVALID_INPUT');
    if ([r.name, r.merchant, r.note].some(hasCardLikeNumber)) fail('SENSITIVE_DATA');
    const a = this.userAccount(w, r.accountId);
    const transferish = r.type === 'transfer' || r.type === 'card_payment';
    if (transferish !== (r.toAccountId != null)) fail('INVALID_INPUT');
    const to = r.toAccountId ? this.userAccount(w, r.toAccountId) : undefined;
    const spendable = (k: string) => k === 'cash' || k === 'bank' || k === 'credit_card';
    const liquid = (k: string) => k === 'cash' || k === 'bank';
    if ((r.type === 'expense' || r.type === 'income') && !spendable(a.kind)) fail('INVALID_ACCOUNT_KIND');
    if (r.type === 'transfer' && (!spendable(a.kind) || !spendable(to!.kind) || (to!.kind === 'credit_card' && liquid(a.kind)))) fail('INVALID_ACCOUNT_KIND');
    if (r.type === 'card_payment' && (!liquid(a.kind) || to!.kind !== 'credit_card')) fail('INVALID_ACCOUNT_KIND');
    if (r.type === 'expense' || r.type === 'income') {
      if (!r.categoryId) fail('CATEGORY_REQUIRED');
      const c = w.get<Category>('categories', r.categoryId);
      if (!c) fail('CATEGORY_NOT_FOUND');
      if (c.kind !== r.type) fail('CATEGORY_KIND_MISMATCH');
    } else if (r.categoryId) {
      fail('INVALID_INPUT');
    }
    if (r.paymentCardId && !w.get<PaymentCard>('cards', r.paymentCardId)) fail('CARD_NOT_FOUND');
    const next = { ...r };
    if ((next.frequency === 'monthly' || next.frequency === 'yearly') && next.anchorDay == null) next.anchorDay = Number(next.startOn.slice(8, 10));
    if (old?.status === 'paused' && next.status === 'active') next.activeFrom = next.startOn > this.today() ? next.startOn : this.today();
    if (old?.status === 'cancelled' && next.status !== 'cancelled') fail('RULE_INACTIVE');
    return next;
  }

  private ruleFromInput(input: RecurringRuleInput, base?: RecurringRule): RecurringRule {
    return {
      id: base?.id ?? uuid(), name: input.name.trim(), type: input.type, amount: input.amount, accountId: input.accountId,
      toAccountId: input.toAccountId ?? null, categoryId: input.categoryId ?? null, merchant: text(input.merchant), note: text(input.note),
      paymentCardId: input.paymentCardId ?? null, frequency: input.frequency, interval: input.interval ?? 1, startOn: input.startOn,
      endOn: input.endOn ?? null, anchorDay: input.anchorDay ?? null, mode: input.mode, status: base?.status ?? 'active',
      activeFrom: base?.activeFrom ?? null, createdAt: base?.createdAt ?? now(),
    };
  }

  async createRecurringRule(input: RecurringRuleInput): Promise<RecurringRule> {
    return this.store.mutate((w) => w.put('rules', this.checkRule(w, this.ruleFromInput(input), null)));
  }

  async updateRecurringRule(id: Uuid, patch: Partial<RecurringRuleInput>): Promise<void> {
    await this.store.mutate((w) => {
      const r = w.get<RecurringRule>('rules', id);
      if (!r) fail('NOT_FOUND');
      const merged = this.ruleFromInput({ ...r, ...patch } as RecurringRuleInput, r);
      w.put('rules', this.checkRule(w, merged, r));
    });
  }

  async setRecurringStatus(id: Uuid, status: RecurringStatus): Promise<void> {
    await this.store.mutate((w) => {
      const r = w.get<RecurringRule>('rules', id);
      if (!r) fail('NOT_FOUND');
      w.put('rules', this.checkRule(w, { ...r, status }, r));
    });
  }

  async deleteRecurringRule(id: Uuid): Promise<void> {
    await this.store.mutate((w) => {
      w.delete('rules', id);
      for (const o of w.all<RecurringOccurrence>('occurrences')) if (o.ruleId === id) w.delete('occurrences', o.id);
      for (const s of w.all<Subscription>('subscriptions')) if (s.recurringRuleId === id) w.delete('subscriptions', s.id);
    });
  }

  async listOccurrences(q: { ruleId?: Uuid; status?: RecurringOccurrence['status'] } = {}): Promise<RecurringOccurrence[]> {
    return this.store
      .all<RecurringOccurrence>('occurrences')
      .filter((o) => (!q.ruleId || o.ruleId === q.ruleId) && (!q.status || o.status === q.status))
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  }

  private postOccurrence(w: Writer, r: RecurringRule, o: RecurringOccurrence, amount?: Paise, on?: IsoDate): RecurringOccurrence {
    const t = this.insertTx(w, {
      type: r.type, amount: amount ?? r.amount, occurredOn: on ?? o.dueOn, accountId: r.accountId, toAccountId: r.toAccountId,
      categoryId: r.categoryId, merchant: r.merchant ?? r.name, note: r.note, paymentCardId: r.paymentCardId, refundOf: null,
      idempotencyKey: `rec:${r.id}:${o.dueOn}`,
    });
    return w.put<RecurringOccurrence>('occurrences', { ...o, status: 'posted', transactionId: t.id, resolvedAt: now() });
  }

  async materializeOccurrence(ruleId: Uuid, dueOn: IsoDate): Promise<RecurringOccurrence> {
    const result = await this.store.mutate((w) => {
      const r = w.get<RecurringRule>('rules', ruleId);
      if (!r) fail('NOT_FOUND');
      const existing = w.all<RecurringOccurrence>('occurrences').find((o) => o.ruleId === ruleId && o.dueOn === dueOn);
      if (existing) return { occ: existing, post: false };
      if (r.status !== 'active') fail('RULE_INACTIVE');
      if (dueOn > this.today() || !isScheduled(r, dueOn) || (r.activeFrom && dueOn < r.activeFrom)) fail('NOT_DUE');
      const occ = w.put<RecurringOccurrence>('occurrences', {
        id: uuid(), ruleId, dueOn, status: 'pending', transactionId: null, createdAt: now(), resolvedAt: null,
      });
      return { occ, post: r.mode === 'automatic' };
    });
    if (!result.post) return result.occ;
    try {
      return await this.store.mutate((w) => {
        const r = w.get<RecurringRule>('rules', ruleId)!;
        const o = w.get<RecurringOccurrence>('occurrences', result.occ.id)!;
        return o.status === 'pending' ? this.postOccurrence(w, r, o) : o;
      });
    } catch {
      return result.occ;
    }
  }

  async confirmOccurrence(id: Uuid, overrides: { amount?: Paise; occurredOn?: IsoDate } = {}): Promise<RecurringOccurrence> {
    return this.store.mutate((w) => {
      const o = w.get<RecurringOccurrence>('occurrences', id);
      if (!o) fail('NOT_FOUND');
      if (o.status === 'posted') return o;
      if (o.status === 'skipped') fail('OCCURRENCE_RESOLVED');
      const r = w.get<RecurringRule>('rules', o.ruleId)!;
      return this.postOccurrence(w, r, o, overrides.amount, overrides.occurredOn);
    });
  }

  async skipOccurrence(id: Uuid): Promise<RecurringOccurrence> {
    return this.store.mutate((w) => {
      const o = w.get<RecurringOccurrence>('occurrences', id);
      if (!o) fail('NOT_FOUND');
      if (o.status === 'posted') fail('OCCURRENCE_RESOLVED');
      return w.put<RecurringOccurrence>('occurrences', { ...o, status: 'skipped', resolvedAt: now() });
    });
  }

  async listSubscriptions(): Promise<Subscription[]> {
    return this.store.all<Subscription>('subscriptions').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async createSubscription(input: SubscriptionInput): Promise<Subscription> {
    await this.ensureSetup();
    return this.store.mutate((w) => {
      const rule = this.checkRule(
        w,
        this.ruleFromInput({
          name: input.name, type: 'expense', amount: input.amount, accountId: input.accountId, categoryId: input.categoryId,
          merchant: text(input.merchant) ?? input.name.trim(), note: input.note ?? null, paymentCardId: input.paymentCardId ?? null,
          frequency: input.frequency, interval: input.interval ?? 1, startOn: input.startOn, endOn: input.endOn ?? null,
          anchorDay: input.anchorDay ?? null, mode: input.mode,
        }),
        null,
      );
      w.put('rules', rule);
      const website = text(input.website);
      if (website && website.length > 200) fail('INVALID_INPUT');
      return w.put<Subscription>('subscriptions', {
        id: uuid(), name: requireName(input.name, 60), recurringRuleId: rule.id, website, createdAt: now(),
      });
    });
  }

  async updateSubscription(id: Uuid, patch: { name?: string; website?: string | null }): Promise<void> {
    await this.store.mutate((w) => {
      const s = w.get<Subscription>('subscriptions', id);
      if (!s) fail('NOT_FOUND');
      w.put<Subscription>('subscriptions', {
        ...s,
        name: patch.name === undefined ? s.name : requireName(patch.name, 60),
        website: patch.website === undefined ? s.website : text(patch.website),
      });
    });
  }

  async deleteSubscription(id: Uuid): Promise<void> {
    const s = this.store.get<Subscription>('subscriptions', id);
    if (!s) fail('NOT_FOUND');
    await this.deleteRecurringRule(s.recurringRuleId);
  }

  async listPaymentCards(): Promise<PaymentCard[]> {
    return this.store.all<PaymentCard>('cards').sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  }

  private checkCard(w: Writer, c: PaymentCard): PaymentCard {
    const issuer = requireName(c.issuer, 60);
    if (!(CARD_NETWORKS as readonly string[]).includes(c.network)) fail('INVALID_INPUT');
    if (!(CARD_TYPES as readonly string[]).includes(c.cardType)) fail('INVALID_INPUT');
    const displayName = text(c.displayName);
    if (displayName && displayName.length > 60) fail('INVALID_INPUT');
    if (hasCardLikeNumber(displayName)) fail('SENSITIVE_DATA');
    const a = this.userAccount(w, c.accountId);
    if ((c.cardType === 'credit' && a.kind !== 'credit_card') || (c.cardType === 'debit' && a.kind !== 'bank') || (c.cardType === 'prepaid' && a.kind !== 'bank' && a.kind !== 'cash')) {
      fail('INVALID_ACCOUNT_KIND', `a ${c.cardType} card cannot link to a ${a.kind} account`);
    }
    return { ...c, issuer, displayName, last4: normalizeLast4(c.last4), artwork: sanitizeArtwork(c.artwork) };
  }

  async createPaymentCard(input: PaymentCardInput): Promise<PaymentCard> {
    return this.store.mutate((w) => {
      if (input.source !== 'manual' && input.source !== 'scan') fail('INVALID_INPUT');
      const card = this.checkCard(w, {
        id: uuid(), accountId: input.accountId, issuer: input.issuer, network: input.network, cardType: input.cardType,
        displayName: input.displayName ?? null, last4: input.last4 ?? null, artwork: input.artwork, source: input.source,
        sortOrder: w.all<PaymentCard>('cards').reduce((m, x) => Math.max(m, x.sortOrder), 0) + 1, seedKey: null,
        archivedAt: null, createdAt: now(),
      });
      return w.put('cards', card);
    });
  }

  async updatePaymentCard(id: Uuid, patch: PaymentCardPatch): Promise<void> {
    await this.store.mutate((w) => {
      const c = w.get<PaymentCard>('cards', id);
      if (!c) fail('NOT_FOUND');
      const { archived, ...rest } = patch;
      const next = this.checkCard(w, {
        ...c,
        ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
        archivedAt: archived === undefined ? c.archivedAt : archived ? (c.archivedAt ?? now()) : null,
      } as PaymentCard);
      w.put('cards', next);
    });
  }

  async deletePaymentCard(id: Uuid): Promise<void> {
    await this.store.mutate((w) => {
      w.delete('cards', id);
      for (const t of w.all<Transaction>('transactions')) if (t.paymentCardId === id) w.put('transactions', { ...t, paymentCardId: null });
      for (const r of w.all<RecurringRule>('rules')) if (r.paymentCardId === id) w.put('rules', { ...r, paymentCardId: null });
    });
  }

  async listCreditCardSettings(): Promise<CreditCardSettings[]> {
    return this.store.all<SettingsRow>('ccSettings').map(({ id: _id, ...s }) => s);
  }

  private putSettings(w: Writer, input: CreditCardSettingsInput): CreditCardSettings {
    const a = this.userAccount(w, input.accountId);
    if (a.kind !== 'credit_card') fail('INVALID_ACCOUNT_KIND');
    const s: CreditCardSettings = {
      accountId: a.id,
      creditLimit: input.creditLimit ?? null,
      statementDay: input.statementDay,
      dueDays: input.dueDays ?? 20,
      minDueBps: input.minDueBps ?? 500,
      minDueFloor: input.minDueFloor ?? 20000,
    };
    if (!Number.isInteger(s.statementDay) || s.statementDay < 1 || s.statementDay > 31) fail('INVALID_INPUT');
    if (!Number.isInteger(s.dueDays) || s.dueDays < 1 || s.dueDays > 60) fail('INVALID_INPUT');
    if (!Number.isInteger(s.minDueBps) || s.minDueBps < 0 || s.minDueBps > 10000) fail('INVALID_INPUT');
    if (!Number.isSafeInteger(s.minDueFloor) || s.minDueFloor < 0) fail('INVALID_INPUT');
    if (s.creditLimit !== null) requirePositive(s.creditLimit);
    w.put<SettingsRow>('ccSettings', { ...s, id: a.id });
    return s;
  }

  async upsertCreditCardSettings(input: CreditCardSettingsInput): Promise<CreditCardSettings> {
    return this.store.mutate((w) => this.putSettings(w, input));
  }

  async listCardStatements(accountId?: Uuid): Promise<CardStatement[]> {
    return this.store
      .all<CardStatement>('statements')
      .filter((s) => !accountId || s.accountId === accountId)
      .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  }

  async closeCardStatement(accountId: Uuid, periodEnd: IsoDate): Promise<CardStatement> {
    return this.store.mutate((w) => {
      const s = w.get<SettingsRow>('ccSettings', accountId);
      if (!s) fail('CARD_SETTINGS_REQUIRED');
      const all = w.all<CardStatement>('statements').filter((x) => x.accountId === accountId);
      const existing = all.find((x) => x.periodEnd === periodEnd);
      if (existing) return existing;
      if (periodEnd > this.today() || !isStatementDate(periodEnd, s.statementDay)) fail('NOT_DUE');
      const prevEnd = all.filter((x) => x.periodEnd < periodEnd).reduce<IsoDate | null>((m, x) => (!m || x.periodEnd > m ? x.periodEnd : m), null);
      const { periodStart } = statementPeriod(periodEnd, s.statementDay, prevEnd);
      const balance = -w
        .all<LedgerEntry>('entries')
        .filter((e) => e.accountId === accountId && e.occurredOn <= periodEnd)
        .reduce((sum, e) => sum + e.amount, 0);
      return w.put<CardStatement>('statements', {
        id: uuid(), accountId, periodStart, periodEnd, dueOn: addDays(periodEnd, s.dueDays),
        statementBalance: balance === 0 ? 0 : balance, minimumDue: minimumDue(balance, s), createdAt: now(),
      });
    });
  }

  async askAssistant(): Promise<AssistantReply> {
    return fail('UNKNOWN', 'The assistant needs a Supabase backend.');
  }
}

export async function openDemoRepository(name?: string): Promise<DemoRepository> {
  const repo = new DemoRepository(await DemoStore.open(name));
  await repo.ensureSetup();
  return repo;
}
