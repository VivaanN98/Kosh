import { addDays, type IsoDate } from '@/lib/dates';
import { MAX_ABS_PAISE, type Paise } from '@/lib/money';
import { fail } from '../errors';
import type {
  Account,
  AccountKind,
  Category,
  LedgerEntry,
  PaymentCard,
  Transaction,
  TransactionType,
  Uuid,
} from '../types';
import { TRANSACTION_TYPES, TRANSFER_LIKE } from '../types';

export interface LedgerLookup {
  account(id: Uuid): Account | undefined;
  category(id: Uuid): Category | undefined;
  card(id: Uuid): PaymentCard | undefined;
  transaction(id: Uuid): Transaction | undefined;
  refundsTotal(originalId: Uuid, excludeId?: Uuid): Paise;
  systemAccountId(kind: 'income' | 'expense' | 'equity'): Uuid;
  today(): IsoDate;
}

const SPENDABLE: readonly AccountKind[] = ['cash', 'bank', 'credit_card'];
const LIQUID: readonly AccountKind[] = ['cash', 'bank'];
const FIXED_TYPES: readonly TransactionType[] = ['opening_balance', 'adjustment', 'goal_transfer'];

export function hasCardLikeNumber(text: string | null | undefined): boolean {
  return text != null && /[0-9]{12,}/.test(text.replace(/[\s-]/g, ''));
}

function clean(text: string | null | undefined): string | null {
  const t = text?.trim();
  return t ? t : null;
}

function userAccount(l: LedgerLookup, id: Uuid | null | undefined): Account | undefined {
  if (!id) return undefined;
  const a = l.account(id);
  return a && !a.isSystem ? a : undefined;
}

export function validateTransaction(draft: Transaction, old: Transaction | null, l: LedgerLookup): Transaction {
  const t: Transaction = { ...draft, merchant: clean(draft.merchant), note: clean(draft.note) };
  const isNew = old === null;

  if (!(TRANSACTION_TYPES as readonly string[]).includes(t.type)) fail('INVALID_INPUT', 'unknown transaction type');
  if (!Number.isSafeInteger(t.amount) || Math.abs(t.amount) > MAX_ABS_PAISE) fail('INVALID_AMOUNT');
  if (t.type === 'opening_balance' || t.type === 'adjustment') {
    if (t.amount === 0) fail('INVALID_AMOUNT', 'amount cannot be zero');
  } else if (t.amount <= 0) {
    fail('INVALID_AMOUNT', 'amount must be positive');
  }
  checkDate(t.occurredOn, l.today());

  if (!isNew && old.type !== t.type && (FIXED_TYPES.includes(old.type) || FIXED_TYPES.includes(t.type))) {
    fail('INVALID_INPUT', 'this transaction type cannot be changed');
  }
  if (!isNew && old.type === 'goal_transfer' && (t.accountId !== old.accountId || t.toAccountId !== old.toAccountId)) {
    fail('INVALID_INPUT', 'edit goal contributions from the goal');
  }

  const acct = userAccount(l, t.accountId);
  if (!acct) fail('ACCOUNT_NOT_FOUND');
  if (acct.archivedAt && (isNew || old.accountId !== t.accountId)) fail('ACCOUNT_ARCHIVED');

  let toAcct: Account | undefined;
  if (TRANSFER_LIKE.includes(t.type)) {
    if (!t.toAccountId) fail('INVALID_INPUT', 'destination account required');
    if (t.toAccountId === t.accountId) fail('SAME_ACCOUNT');
    toAcct = userAccount(l, t.toAccountId);
    if (!toAcct) fail('ACCOUNT_NOT_FOUND', 'destination account not found');
    if (toAcct.archivedAt && (isNew || old.toAccountId !== t.toAccountId)) fail('ACCOUNT_ARCHIVED');
  } else if (t.toAccountId) {
    fail('INVALID_INPUT', 'only transfers have a destination account');
  }

  switch (t.type) {
    case 'expense':
    case 'income':
    case 'refund':
      if (!SPENDABLE.includes(acct.kind)) fail('INVALID_ACCOUNT_KIND');
      break;
    case 'transfer':
      if (!SPENDABLE.includes(acct.kind) || !SPENDABLE.includes(toAcct!.kind)) fail('INVALID_ACCOUNT_KIND');
      if (toAcct!.kind === 'credit_card' && LIQUID.includes(acct.kind)) fail('USE_CARD_PAYMENT');
      break;
    case 'card_payment':
      if (!LIQUID.includes(acct.kind) || toAcct!.kind !== 'credit_card') fail('INVALID_ACCOUNT_KIND');
      break;
    case 'goal_transfer': {
      const into = LIQUID.includes(acct.kind) && toAcct!.kind === 'goal';
      const outOf = acct.kind === 'goal' && LIQUID.includes(toAcct!.kind);
      if (!into && !outOf) fail('INVALID_ACCOUNT_KIND');
      break;
    }
    default:
      break;
  }

  if (t.refundOf) {
    if (t.type !== 'refund') fail('INVALID_INPUT', 'only refunds link to an original expense');
    const orig = l.transaction(t.refundOf);
    if (!orig || orig.type !== 'expense' || orig.deletedAt) fail('REFUND_TARGET_INVALID');
    t.categoryId = orig.categoryId;
    if (l.refundsTotal(orig.id, t.id) + t.amount > orig.amount) fail('REFUND_EXCEEDS_ORIGINAL');
  } else {
    t.refundOf = null;
  }

  if (!isNew && old.type === 'expense') {
    const refunded = l.refundsTotal(t.id);
    if (refunded > 0 && t.type !== 'expense') fail('HAS_REFUNDS');
    if (refunded > t.amount) fail('REFUND_EXCEEDS_ORIGINAL', 'amount is below what was already refunded');
  }

  if (t.type === 'expense' || t.type === 'income' || t.type === 'refund') {
    if (!t.categoryId) fail('CATEGORY_REQUIRED');
    const cat = l.category(t.categoryId);
    if (!cat) fail('CATEGORY_NOT_FOUND');
    const wanted = t.type === 'income' ? 'income' : 'expense';
    if (cat.kind !== wanted) fail('CATEGORY_KIND_MISMATCH');
  } else if (t.categoryId) {
    fail('INVALID_INPUT', 'this transaction type has no category');
  } else {
    t.categoryId = null;
  }

  if (t.paymentCardId) {
    const card = l.card(t.paymentCardId);
    if (!card) fail('CARD_NOT_FOUND');
    if (card.accountId !== t.accountId) fail('CARD_ACCOUNT_MISMATCH');
  } else {
    t.paymentCardId = null;
  }

  if (hasCardLikeNumber(t.merchant) || hasCardLikeNumber(t.note)) fail('SENSITIVE_DATA');
  t.toAccountId = t.toAccountId ?? null;
  return t;
}

export function checkDate(date: IsoDate, today: IsoDate): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '2000-01-01' || date > addDays(today, 366)) {
    fail('INVALID_DATE');
  }
}

type Posting = Omit<LedgerEntry, 'id'>;

export function buildPostings(t: Transaction, l: Pick<LedgerLookup, 'systemAccountId'>): Posting[] {
  if (t.deletedAt) return [];
  const p = (accountId: Uuid, amount: Paise, categoryId: Uuid | null = null): Posting => ({
    transactionId: t.id,
    accountId,
    categoryId,
    amount,
    occurredOn: t.occurredOn,
  });
  switch (t.type) {
    case 'expense':
      return [p(t.accountId, -t.amount), p(l.systemAccountId('expense'), t.amount, t.categoryId)];
    case 'refund':
      return [p(t.accountId, t.amount), p(l.systemAccountId('expense'), -t.amount, t.categoryId)];
    case 'income':
      return [p(t.accountId, t.amount), p(l.systemAccountId('income'), -t.amount, t.categoryId)];
    case 'transfer':
    case 'card_payment':
    case 'goal_transfer':
      return [p(t.accountId, -t.amount), p(t.toAccountId!, t.amount)];
    case 'opening_balance':
    case 'adjustment':
      return [p(t.accountId, t.amount), p(l.systemAccountId('equity'), -t.amount)];
  }
}
