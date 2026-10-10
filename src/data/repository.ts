/**
 * The data contract. The UI talks only to this interface and never knows which backend it uses.
 * Implementations: `demo/` (IndexedDB) and `supabase/` (Postgres RPC + RLS).
 * Both pass the same ledger vectors (tests/vectors).
 */
import type { IsoDate } from '@/lib/dates';
import type { Paise } from '@/lib/money';
import type {
  Account,
  Budget,
  CardArtwork,
  CardNetwork,
  CardStatement,
  CardType,
  Category,
  CategoryKind,
  CreditCardSettings,
  Frequency,
  GoalContribution,
  GoalMode,
  LedgerEntry,
  PaymentCard,
  Profile,
  RecurringMode,
  RecurringOccurrence,
  RecurringRule,
  RecurringStatus,
  RecurringType,
  SavingsGoal,
  Subscription,
  Transaction,
  TransactionInput,
  Uuid,
} from '@/domain/types';

export type BackendMode = 'demo' | 'supabase';

export interface CreateAccountInput {
  name: string;
  kind: 'cash' | 'bank' | 'credit_card' | 'goal';
  institution?: string | null;
  color?: string | null;
  icon?: string | null;
  /** Signed ledger balance: positive for money you have; for a credit card pass −debt. */
  openingBalance?: Paise;
  openingOn?: IsoDate;
  /** Credit cards only: creates settings when provided. */
  statementDay?: number;
  dueDays?: number;
  creditLimit?: Paise | null;
}

export interface AccountPatch {
  name?: string;
  institution?: string | null;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
}

export interface ReconcileInput {
  accountId: Uuid;
  /** Signed ledger balance the bank/statement shows (card debt as negative). */
  actualBalance: Paise;
  asOf: IsoDate;
}

export interface TransactionQuery {
  from?: IsoDate;
  to?: IsoDate;
  accountId?: Uuid;
  categoryId?: Uuid;
  types?: Transaction['type'][];
  includeDeleted?: boolean;
}

export interface LedgerQuery {
  from?: IsoDate;
  to?: IsoDate;
  accountId?: Uuid;
}

export interface CategoryInput {
  name: string;
  kind: CategoryKind;
  parentId?: Uuid | null;
  icon?: string | null;
  color?: string | null;
}

export interface BudgetInput {
  categoryId: Uuid | null;
  amount: Paise;
  warnAtPct?: number;
}

export interface GoalInput {
  name: string;
  target: Paise;
  deadline?: IsoDate | null;
  mode: GoalMode;
  /** earmark: optional cash/bank account. account: optional existing goal account (else created). */
  accountId?: Uuid | null;
  color?: string | null;
  icon?: string | null;
}

export interface GoalPatch {
  name?: string;
  target?: Paise;
  deadline?: IsoDate | null;
  color?: string | null;
  icon?: string | null;
  archived?: boolean;
}

export interface ContributionInput {
  goalId: Uuid;
  amount: Paise;
  contributedOn?: IsoDate;
  accountId?: Uuid | null;
  note?: string | null;
}

export interface ContributionPatch {
  amount?: Paise;
  contributedOn?: IsoDate;
  accountId?: Uuid | null;
  note?: string | null;
}

export interface RecurringRuleInput {
  name: string;
  type: RecurringType;
  amount: Paise;
  accountId: Uuid;
  toAccountId?: Uuid | null;
  categoryId?: Uuid | null;
  merchant?: string | null;
  note?: string | null;
  paymentCardId?: Uuid | null;
  frequency: Frequency;
  interval?: number;
  startOn: IsoDate;
  endOn?: IsoDate | null;
  anchorDay?: number | null;
  mode: RecurringMode;
}

export interface SubscriptionInput {
  name: string;
  amount: Paise;
  accountId: Uuid;
  categoryId: Uuid;
  paymentCardId?: Uuid | null;
  frequency: Frequency;
  interval?: number;
  startOn: IsoDate;
  endOn?: IsoDate | null;
  anchorDay?: number | null;
  mode: RecurringMode;
  website?: string | null;
  merchant?: string | null;
  note?: string | null;
}

export interface PaymentCardInput {
  accountId: Uuid;
  issuer: string;
  network: CardNetwork;
  cardType: CardType;
  displayName?: string | null;
  last4?: string | null;
  artwork: CardArtwork;
  source: 'manual' | 'scan';
}

export type PaymentCardPatch = Partial<Omit<PaymentCardInput, 'source'>> & { sortOrder?: number; archived?: boolean };

export interface CreditCardSettingsInput {
  accountId: Uuid;
  creditLimit?: Paise | null;
  statementDay: number;
  dueDays?: number;
  minDueBps?: number;
  minDueFloor?: Paise;
}

export interface Repository {
  readonly mode: BackendMode;

  /** Idempotent: creates profile, system accounts, categories, the two seeded bank accounts and cards. */
  ensureSetup(): Promise<void>;
  getProfile(): Promise<Profile>;
  updateProfile(patch: { displayName?: string | null }): Promise<void>;

  // Accounts (user accounts only; system accounts are internal)
  listAccounts(): Promise<Account[]>;
  createAccount(input: CreateAccountInput, idempotencyKey: string): Promise<Account>;
  updateAccount(id: Uuid, patch: AccountPatch): Promise<void>;
  setAccountArchived(id: Uuid, archived: boolean): Promise<void>;
  reconcileAccount(input: ReconcileInput, idempotencyKey: string): Promise<Transaction | null>;

  // Ledger
  listTransactions(query?: TransactionQuery): Promise<Transaction[]>;
  getTransaction(id: Uuid): Promise<Transaction | null>;
  postTransaction(input: TransactionInput, idempotencyKey: string): Promise<Transaction>;
  updateTransaction(id: Uuid, input: TransactionInput, expectedVersion?: number): Promise<Transaction>;
  deleteTransaction(id: Uuid): Promise<void>;
  restoreTransaction(id: Uuid): Promise<Transaction>;
  /** Entries for user AND system accounts — the raw material for every derived number. */
  listLedgerEntries(query?: LedgerQuery): Promise<LedgerEntry[]>;
  /** System account ids (income/expense/equity) so metrics can classify entries. */
  getSystemAccounts(): Promise<Record<'income' | 'expense' | 'equity', Uuid>>;

  // Categories
  listCategories(): Promise<Category[]>;
  createCategory(input: CategoryInput): Promise<Category>;
  updateCategory(id: Uuid, patch: Partial<Omit<CategoryInput, 'kind'>> & { archived?: boolean }): Promise<void>;

  // Budgets
  listBudgets(): Promise<Budget[]>;
  upsertBudget(input: BudgetInput): Promise<Budget>;
  deleteBudget(id: Uuid): Promise<void>;

  // Goals
  listGoals(): Promise<SavingsGoal[]>;
  createGoal(input: GoalInput): Promise<SavingsGoal>;
  updateGoal(id: Uuid, patch: GoalPatch): Promise<void>;
  deleteGoal(id: Uuid): Promise<void>;
  /** Excludes account-mode contributions whose transfer was deleted. */
  listGoalContributions(goalId?: Uuid): Promise<GoalContribution[]>;
  addGoalContribution(input: ContributionInput, idempotencyKey: string): Promise<GoalContribution>;
  updateGoalContribution(id: Uuid, patch: ContributionPatch): Promise<GoalContribution>;
  deleteGoalContribution(id: Uuid): Promise<void>;
  withdrawFromGoal(
    input: { goalId: Uuid; amount: Paise; toAccountId: Uuid; on?: IsoDate },
    idempotencyKey: string,
  ): Promise<Transaction>;

  // Recurring
  listRecurringRules(): Promise<RecurringRule[]>;
  createRecurringRule(input: RecurringRuleInput): Promise<RecurringRule>;
  updateRecurringRule(id: Uuid, patch: Partial<RecurringRuleInput>): Promise<void>;
  setRecurringStatus(id: Uuid, status: RecurringStatus): Promise<void>;
  deleteRecurringRule(id: Uuid): Promise<void>;
  listOccurrences(query?: { ruleId?: Uuid; status?: RecurringOccurrence['status'] }): Promise<RecurringOccurrence[]>;
  materializeOccurrence(ruleId: Uuid, dueOn: IsoDate): Promise<RecurringOccurrence>;
  confirmOccurrence(id: Uuid, overrides?: { amount?: Paise; occurredOn?: IsoDate }): Promise<RecurringOccurrence>;
  skipOccurrence(id: Uuid): Promise<RecurringOccurrence>;

  // Subscriptions
  listSubscriptions(): Promise<Subscription[]>;
  createSubscription(input: SubscriptionInput): Promise<Subscription>;
  updateSubscription(id: Uuid, patch: { name?: string; website?: string | null }): Promise<void>;
  deleteSubscription(id: Uuid): Promise<void>;

  // Cards
  listPaymentCards(): Promise<PaymentCard[]>;
  createPaymentCard(input: PaymentCardInput): Promise<PaymentCard>;
  updatePaymentCard(id: Uuid, patch: PaymentCardPatch): Promise<void>;
  deletePaymentCard(id: Uuid): Promise<void>;
  listCreditCardSettings(): Promise<CreditCardSettings[]>;
  upsertCreditCardSettings(input: CreditCardSettingsInput): Promise<CreditCardSettings>;
  listCardStatements(accountId?: Uuid): Promise<CardStatement[]>;
  closeCardStatement(accountId: Uuid, periodEnd: IsoDate): Promise<CardStatement>;
}
