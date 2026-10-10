/** Error codes shared by the TypeScript engine and the Postgres functions ("KOSH:<CODE>: msg"). */
export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'SETUP_REQUIRED',
  'INVALID_INPUT',
  'INVALID_AMOUNT',
  'INVALID_DATE',
  'ACCOUNT_NOT_FOUND',
  'ACCOUNT_ARCHIVED',
  'INVALID_ACCOUNT_KIND',
  'SAME_ACCOUNT',
  'USE_CARD_PAYMENT',
  'CATEGORY_REQUIRED',
  'CATEGORY_NOT_FOUND',
  'CATEGORY_KIND_MISMATCH',
  'REFUND_TARGET_INVALID',
  'REFUND_EXCEEDS_ORIGINAL',
  'HAS_REFUNDS',
  'CARD_NOT_FOUND',
  'CARD_ACCOUNT_MISMATCH',
  'SENSITIVE_DATA',
  'NOT_FOUND',
  'VERSION_CONFLICT',
  'GOAL_ARCHIVED',
  'RULE_INACTIVE',
  'NOT_DUE',
  'OCCURRENCE_RESOLVED',
  'CARD_SETTINGS_REQUIRED',
  'UNBALANCED',
  'NETWORK',
  'UNKNOWN',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const FRIENDLY: Partial<Record<ErrorCode, string>> = {
  UNAUTHENTICATED: 'Please sign in again.',
  INVALID_AMOUNT: 'Enter a valid amount.',
  INVALID_DATE: 'Pick a date within the supported range.',
  ACCOUNT_NOT_FOUND: 'That account no longer exists.',
  ACCOUNT_ARCHIVED: 'That account is archived. Unarchive it first.',
  INVALID_ACCOUNT_KIND: "That account can't be used here.",
  SAME_ACCOUNT: 'Choose two different accounts.',
  USE_CARD_PAYMENT: 'Paying a credit card is recorded as a card payment.',
  CATEGORY_REQUIRED: 'Choose a category.',
  CATEGORY_KIND_MISMATCH: "That category doesn't match this transaction type.",
  REFUND_TARGET_INVALID: 'Refunds must link to an existing expense.',
  REFUND_EXCEEDS_ORIGINAL: "Refunds can't exceed the original expense.",
  HAS_REFUNDS: 'This expense has refunds. Remove them first.',
  CARD_ACCOUNT_MISMATCH: "That card isn't linked to this account.",
  SENSITIVE_DATA: "That looks like a card number. For your safety it can't be saved.",
  VERSION_CONFLICT: 'This changed on another device. Reload and try again.',
  GOAL_ARCHIVED: 'This goal is archived.',
  RULE_INACTIVE: 'This schedule is paused or cancelled.',
  NETWORK: "Couldn't reach the server. Your change was not saved.",
};

export class KoshError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message?: string) {
    super(message ?? FRIENDLY[code] ?? code);
    this.name = 'KoshError';
    this.code = code;
  }
  get friendly(): string {
    return FRIENDLY[this.code] ?? this.message;
  }
}

export function fail(code: ErrorCode, message?: string): never {
  throw new KoshError(code, message);
}

const PREFIX_RE = /KOSH:([A-Z_]+):\s*(.*)/s;

/** Normalise anything thrown by an adapter (Postgres error, fetch failure…) into a KoshError. */
export function toKoshError(err: unknown): KoshError {
  if (err instanceof KoshError) return err;
  const message =
    typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  const match = PREFIX_RE.exec(message);
  if (match && (ERROR_CODES as readonly string[]).includes(match[1]!)) {
    return new KoshError(match[1] as ErrorCode, match[2]);
  }
  const pgCode = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
  if (pgCode === '23514' || pgCode === '23502' || pgCode === '22P02' || pgCode === '23503' || pgCode === '23505') {
    return new KoshError('INVALID_INPUT', message);
  }
  if (/fetch|network|Failed to fetch|NetworkError/i.test(message)) return new KoshError('NETWORK', message);
  return new KoshError('UNKNOWN', message);
}
