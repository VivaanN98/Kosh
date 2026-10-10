import type { IsoDate } from '@/lib/dates';
import type { Paise } from '@/lib/money';

export type Uuid = string;

/** User-facing account kinds. */
export const USER_ACCOUNT_KINDS = ['cash', 'bank', 'credit_card', 'goal'] as const;
export type UserAccountKind = (typeof USER_ACCOUNT_KINDS)[number];
/** Hidden nominal accounts, one of each per user. */
export const SYSTEM_ACCOUNT_KINDS = ['income', 'expense', 'equity'] as const;
export type SystemAccountKind = (typeof SYSTEM_ACCOUNT_KINDS)[number];
export type AccountKind = UserAccountKind | SystemAccountKind;

export const ASSET_KINDS: readonly AccountKind[] = ['cash', 'bank', 'goal'];
export const LIQUID_KINDS: readonly AccountKind[] = ['cash', 'bank'];

export interface Account {
  id: Uuid;
  name: string;
  kind: AccountKind;
  isSystem: boolean;
  institution: string | null;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  archivedAt: string | null;
  reconciledAt: string | null;
  reconciledBalance: Paise | null;
  seedKey: string | null;
  createdAt: string;
}

export const TRANSACTION_TYPES = [
  'expense',
  'income',
  'transfer',
  'card_payment',
  'refund',
  'opening_balance',
  'adjustment',
  'goal_transfer',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** Types that move money between two of the user's accounts and never count as income/expense. */
export const TRANSFER_LIKE: readonly TransactionType[] = ['transfer', 'card_payment', 'goal_transfer'];

export interface Transaction {
  id: Uuid;
  type: TransactionType;
  /** Positive for every type except opening_balance/adjustment, which carry a signed ledger delta. */
  amount: Paise;
  occurredOn: IsoDate;
  accountId: Uuid;
  toAccountId: Uuid | null;
  categoryId: Uuid | null;
  merchant: string | null;
  note: string | null;
  paymentCardId: Uuid | null;
  refundOf: Uuid | null;
  idempotencyKey: string;
  deletedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** What a caller supplies to post or edit a transaction. */
export interface TransactionInput {
  type: TransactionType;
  amount: Paise;
  occurredOn: IsoDate;
  accountId: Uuid;
  toAccountId?: Uuid | null;
  categoryId?: Uuid | null;
  merchant?: string | null;
  note?: string | null;
  paymentCardId?: Uuid | null;
  refundOf?: Uuid | null;
}

export interface LedgerEntry {
  id: string;
  transactionId: Uuid;
  accountId: Uuid;
  categoryId: Uuid | null;
  /** Debit-positive signed amount. */
  amount: Paise;
  occurredOn: IsoDate;
}

export type CategoryKind = 'expense' | 'income';

export interface Category {
  id: Uuid;
  parentId: Uuid | null;
  kind: CategoryKind;
  name: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  archivedAt: string | null;
  seedKey: string | null;
}

export interface Budget {
  id: Uuid;
  /** null = overall monthly budget. */
  categoryId: Uuid | null;
  amount: Paise;
  warnAtPct: number;
  createdAt: string;
}

export type GoalMode = 'earmark' | 'account';

export interface SavingsGoal {
  id: Uuid;
  name: string;
  target: Paise;
  deadline: IsoDate | null;
  mode: GoalMode;
  /** account mode: the dedicated goal account. earmark mode: optional account holding the money. */
  accountId: Uuid | null;
  color: string | null;
  icon: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface GoalContribution {
  id: Uuid;
  goalId: Uuid;
  amount: Paise;
  contributedOn: IsoDate;
  /** earmark: account the money sits in (optional). account mode: source of the transfer. */
  accountId: Uuid | null;
  transactionId: Uuid | null;
  note: string | null;
  createdAt: string;
}

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type RecurringMode = 'reminder' | 'automatic';
export type RecurringStatus = 'active' | 'paused' | 'cancelled';
export const RECURRING_TYPES = ['expense', 'income', 'transfer', 'card_payment'] as const;
export type RecurringType = (typeof RECURRING_TYPES)[number];

export interface RecurringRule {
  id: Uuid;
  name: string;
  type: RecurringType;
  amount: Paise;
  accountId: Uuid;
  toAccountId: Uuid | null;
  categoryId: Uuid | null;
  merchant: string | null;
  note: string | null;
  paymentCardId: Uuid | null;
  frequency: Frequency;
  interval: number;
  startOn: IsoDate;
  endOn: IsoDate | null;
  /** Day of month for monthly/yearly schedules (1-31, clamped to month length). */
  anchorDay: number | null;
  mode: RecurringMode;
  status: RecurringStatus;
  /** Set when a paused rule resumes; dates before it are never back-filled. */
  activeFrom: IsoDate | null;
  createdAt: string;
}

export type OccurrenceStatus = 'pending' | 'posted' | 'skipped';

export interface RecurringOccurrence {
  id: Uuid;
  ruleId: Uuid;
  dueOn: IsoDate;
  status: OccurrenceStatus;
  transactionId: Uuid | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface Subscription {
  id: Uuid;
  name: string;
  recurringRuleId: Uuid;
  website: string | null;
  createdAt: string;
}

export const CARD_NETWORKS = ['visa', 'mastercard', 'rupay', 'amex', 'diners', 'discover', 'jcb', 'unionpay', 'other'] as const;
export type CardNetwork = (typeof CARD_NETWORKS)[number];
export const CARD_TYPES = ['debit', 'credit', 'prepaid'] as const;
export type CardType = (typeof CARD_TYPES)[number];
export type CardSource = 'seed' | 'manual' | 'scan';

/**
 * Sanitized, template-based card artwork. Contains only visual parameters; never card text,
 * numbers or photos. Validated by `domain/cards/artwork.ts` and a database check.
 */
export interface CardArtwork {
  version: 1;
  template: 'gradient' | 'solid' | 'metal' | 'mesh';
  colors: [string, string, string?];
  textTone: 'light' | 'dark';
  chip: 'left' | 'right' | 'none';
  chipStyle: 'gold' | 'silver';
  networkPosition: 'bottom-right' | 'top-right' | 'bottom-left';
  issuerPosition: 'top-left' | 'top-right';
  contactless: boolean;
  pattern: 'none' | 'waves' | 'grid' | 'arcs' | 'dots';
  finish: 'gloss' | 'matte';
}

export interface PaymentCard {
  id: Uuid;
  accountId: Uuid;
  issuer: string;
  network: CardNetwork;
  cardType: CardType;
  displayName: string | null;
  last4: string | null;
  artwork: CardArtwork;
  source: CardSource;
  sortOrder: number;
  seedKey: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface CreditCardSettings {
  accountId: Uuid;
  creditLimit: Paise | null;
  /** Statement closes on this day of month (clamped). */
  statementDay: number;
  /** Payment due this many days after the statement date. */
  dueDays: number;
  /** Minimum due as basis points of the statement balance, with a floor. */
  minDueBps: number;
  minDueFloor: Paise;
}

export interface CardStatement {
  id: Uuid;
  accountId: Uuid;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  dueOn: IsoDate;
  /** Debt as of periodEnd (negative = credit balance). */
  statementBalance: Paise;
  minimumDue: Paise;
  createdAt: string;
}

export interface Profile {
  id: Uuid;
  displayName: string | null;
  currency: 'INR';
  timezone: string;
}
