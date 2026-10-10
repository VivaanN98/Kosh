/**
 * Card artwork is a sanitized TEMPLATE: colours and layout parameters only. It never contains
 * text from the card, numbers or image data. `sanitizeArtwork` is applied before every save.
 */
import { hasCardLikeNumber } from '../ledger/engine';
import type { CardArtwork, CardNetwork } from '../types';
import { fail } from '../errors';

const HEX = /^#[0-9a-f]{6}$/i;
const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

export const DEFAULT_ARTWORK: CardArtwork = {
  version: 1,
  template: 'gradient',
  colors: ['#22252b', '#3a3f48', '#5b6270'],
  textTone: 'light',
  chip: 'left',
  chipStyle: 'gold',
  networkPosition: 'bottom-right',
  issuerPosition: 'top-left',
  contactless: true,
  pattern: 'none',
  finish: 'gloss',
};

export function sanitizeArtwork(input: unknown): CardArtwork {
  const a = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const colors = Array.isArray(a.colors) ? a.colors.filter((c): c is string => typeof c === 'string' && HEX.test(c)) : [];
  const [c0 = DEFAULT_ARTWORK.colors[0], c1 = DEFAULT_ARTWORK.colors[1], c2] = colors;
  const out: CardArtwork = {
    version: 1,
    template: pick(a.template, ['gradient', 'solid', 'metal', 'mesh'] as const, 'gradient'),
    colors: c2 ? [c0.toLowerCase(), c1.toLowerCase(), c2.toLowerCase()] : [c0.toLowerCase(), c1.toLowerCase()],
    textTone: pick(a.textTone, ['light', 'dark'] as const, 'light'),
    chip: pick(a.chip, ['left', 'right', 'none'] as const, 'left'),
    chipStyle: pick(a.chipStyle, ['gold', 'silver'] as const, 'gold'),
    networkPosition: pick(a.networkPosition, ['bottom-right', 'top-right', 'bottom-left'] as const, 'bottom-right'),
    issuerPosition: pick(a.issuerPosition, ['top-left', 'top-right'] as const, 'top-left'),
    contactless: a.contactless !== false,
    pattern: pick(a.pattern, ['none', 'waves', 'grid', 'arcs', 'dots'] as const, 'none'),
    finish: pick(a.finish, ['gloss', 'matte'] as const, 'gloss'),
  };
  const json = JSON.stringify(out);
  if (json.length > 4096 || hasCardLikeNumber(json)) fail('SENSITIVE_DATA');
  return out;
}

/** Relative luminance (WCAG) of a hex colour, 0..1. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

export function textToneFor(colors: readonly string[]): 'light' | 'dark' {
  const avg = colors.reduce((s, c) => s + luminance(c), 0) / Math.max(1, colors.length);
  return avg > 0.45 ? 'dark' : 'light';
}

export const NETWORK_LABEL: Record<CardNetwork, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  rupay: 'RuPay',
  amex: 'American Express',
  diners: 'Diners Club',
  discover: 'Discover',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  other: 'Other',
};

/** Validate the optional last four digits. */
export function normalizeLast4(value: string | null | undefined): string | null {
  const v = value?.trim() ?? '';
  if (v === '') return null;
  if (!/^\d{4}$/.test(v)) fail('INVALID_INPUT', 'last four digits must be exactly 4 digits');
  return v;
}
