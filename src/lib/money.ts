
export type Paise = number;

const PAISE_PER_RUPEE = 100;
export const MAX_ABS_PAISE = 1_000_000_000_000_000;

function isPaise(value: unknown): value is Paise {
  return typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= MAX_ABS_PAISE;
}

function assertPaise(value: number, label = 'amount'): Paise {
  if (!isPaise(value)) throw new RangeError(`${label} must be an integer number of paise, got ${value}`);
  return value;
}

export function rupees(whole: number): Paise {
  if (!Number.isSafeInteger(whole)) throw new RangeError('rupees() takes whole rupees');
  return assertPaise(whole * PAISE_PER_RUPEE);
}

export function add(...values: Paise[]): Paise {
  let total = 0;
  for (const v of values) total += assertPaise(v);
  return assertPaise(total);
}

export function sum(values: Iterable<Paise>): Paise {
  let total = 0;
  for (const v of values) total += assertPaise(v);
  return assertPaise(total);
}

export function sub(a: Paise, b: Paise): Paise {
  return assertPaise(assertPaise(a) - assertPaise(b));
}

export function abs(a: Paise): Paise {
  return assertPaise(Math.abs(a));
}

export function min(a: Paise, b: Paise): Paise {
  return a < b ? a : b;
}

export function max(a: Paise, b: Paise): Paise {
  return a > b ? a : b;
}

export function applyBps(amount: Paise, bps: number): Paise {
  if (!Number.isSafeInteger(bps)) throw new RangeError('bps must be an integer');
  const product = BigInt(assertPaise(amount)) * BigInt(bps);
  const sign = product < 0n ? -1n : 1n;
  const absProduct = product * sign;
  const rounded = (absProduct + 5_000n) / 10_000n;
  return assertPaise(Number(rounded * sign));
}

export function ratioBps(part: Paise, whole: Paise): number {
  if (whole === 0) return 0;
  const p = BigInt(assertPaise(part)) * 10_000n;
  const w = BigInt(assertPaise(whole));
  const sign = (p < 0n) !== (w < 0n) ? -1n : 1n;
  const ap = p < 0n ? -p : p;
  const aw = w < 0n ? -w : w;
  return Number(((ap * 2n + aw) / (aw * 2n)) * sign);
}

export function allocate(amount: Paise, parts: number): Paise[] {
  assertPaise(amount);
  if (!Number.isSafeInteger(parts) || parts <= 0) throw new RangeError('parts must be a positive integer');
  const base = Math.trunc(amount / parts);
  let remainder = amount - base * parts;
  const step = remainder < 0 ? -1 : 1;
  return Array.from({ length: parts }, () => {
    if (remainder !== 0) {
      remainder -= step;
      return base + step;
    }
    return base;
  });
}

const DECIMAL_RE = /^(\d{1,13})(?:\.(\d{0,2}))?$/;

export function parseRupees(input: string): Paise | null {
  const cleaned = input.replace(/[₹,\s]/g, '').replace(/^Rs\.?/i, '');
  if (cleaned === '' || cleaned === '.') return null;
  const match = DECIMAL_RE.exec(cleaned.startsWith('.') ? `0${cleaned}` : cleaned);
  if (!match) return null;
  const whole = match[1] ?? '0';
  const frac = (match[2] ?? '').padEnd(2, '0');
  const value = Number(whole) * PAISE_PER_RUPEE + Number(frac);
  return isPaise(value) ? value : null;
}

export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const groups: string[] = [];
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) groups.unshift(rest);
  return `${groups.join(',')},${last3}`;
}

interface FormatOptions {
  sign?: 'auto' | 'always' | 'never';
  decimals?: 'auto' | 'always' | 'never';
  symbol?: boolean;
}

export function formatINR(amount: Paise, opts: FormatOptions = {}): string {
  const { sign = 'auto', decimals = 'auto', symbol = true } = opts;
  assertPaise(amount);
  const negative = amount < 0;
  let absolute = Math.abs(amount);
  if (decimals === 'never') absolute = Math.round(absolute / PAISE_PER_RUPEE) * PAISE_PER_RUPEE;
  const whole = Math.trunc(absolute / PAISE_PER_RUPEE);
  const frac = absolute % PAISE_PER_RUPEE;
  let text = groupIndian(String(whole));
  if (decimals === 'always' || (decimals === 'auto' && frac !== 0)) {
    text += `.${String(frac).padStart(2, '0')}`;
  }
  if (symbol) text = `₹${text}`;
  const isZero = absolute === 0;
  if (sign === 'always' && !isZero) return `${negative ? '−' : '+'}${text}`;
  if (sign === 'auto' && negative && !isZero) return `−${text}`;
  return text;
}

export function formatINRCompact(amount: Paise): string {
  assertPaise(amount);
  const negative = amount < 0;
  const r = Math.abs(amount) / PAISE_PER_RUPEE;
  let body: string;
  if (r >= 1e7) body = `${trimZero((r / 1e7).toFixed(r >= 1e8 ? 0 : 1))}Cr`;
  else if (r >= 1e5) body = `${trimZero((r / 1e5).toFixed(r >= 1e6 ? 0 : 1))}L`;
  else if (r >= 1e3) body = `${trimZero((r / 1e3).toFixed(r >= 1e4 ? 0 : 1))}K`;
  else body = String(Math.round(r));
  return `${negative ? '−' : ''}₹${body}`;
}

function trimZero(s: string): string {
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

export function splitParts(amount: Paise): { sign: '' | '−'; rupees: string; paise: string } {
  assertPaise(amount);
  const a = Math.abs(amount);
  return {
    sign: amount < 0 ? '−' : '',
    rupees: groupIndian(String(Math.trunc(a / PAISE_PER_RUPEE))),
    paise: String(a % PAISE_PER_RUPEE).padStart(2, '0'),
  };
}

export function toDecimalString(amount: Paise): string {
  assertPaise(amount);
  const a = Math.abs(amount);
  return `${amount < 0 ? '-' : ''}${Math.trunc(a / PAISE_PER_RUPEE)}.${String(a % PAISE_PER_RUPEE).padStart(2, '0')}`;
}
