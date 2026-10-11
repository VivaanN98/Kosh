import type { CardNetwork, CardType } from '../types';

export type UncertainField = 'issuer' | 'network' | 'cardType' | 'last4';

interface ParsedCard {
  issuer: string | null;
  network: CardNetwork | null;
  cardType: CardType | null;
  displayName: string | null;
  last4: string | null;
  uncertain: UncertainField[];
}

interface Issuer {
  name: string;
  aliases: string[];
}

const ISSUERS: Issuer[] = [
  { name: 'State Bank of India', aliases: ['STATE BANK OF INDIA', 'SBI', 'STATE BANK'] },
  { name: 'SBI Card', aliases: ['SBI CARD', 'SBICARD'] },
  { name: 'HDFC Bank', aliases: ['HDFC BANK', 'HDFC'] },
  { name: 'ICICI Bank', aliases: ['ICICI BANK', 'ICICI'] },
  { name: 'Axis Bank', aliases: ['AXIS BANK', 'AXIS'] },
  { name: 'Kotak Mahindra Bank', aliases: ['KOTAK MAHINDRA BANK', 'KOTAK'] },
  { name: 'Indian Bank', aliases: ['INDIAN BANK'] },
  { name: 'Bank of Baroda', aliases: ['BANK OF BARODA', 'BOB', 'BARODA'] },
  { name: 'Punjab National Bank', aliases: ['PUNJAB NATIONAL BANK', 'PNB'] },
  { name: 'Canara Bank', aliases: ['CANARA BANK', 'CANARA'] },
  { name: 'Union Bank of India', aliases: ['UNION BANK OF INDIA', 'UNION BANK'] },
  { name: 'Bank of India', aliases: ['BANK OF INDIA'] },
  { name: 'Indian Overseas Bank', aliases: ['INDIAN OVERSEAS BANK', 'IOB'] },
  { name: 'Central Bank of India', aliases: ['CENTRAL BANK OF INDIA'] },
  { name: 'IDFC FIRST Bank', aliases: ['IDFC FIRST BANK', 'IDFC FIRST', 'IDFC'] },
  { name: 'Yes Bank', aliases: ['YES BANK'] },
  { name: 'IndusInd Bank', aliases: ['INDUSIND BANK', 'INDUSIND'] },
  { name: 'Federal Bank', aliases: ['FEDERAL BANK'] },
  { name: 'RBL Bank', aliases: ['RBL BANK', 'RBL'] },
  { name: 'AU Small Finance Bank', aliases: ['AU SMALL FINANCE BANK', 'AU BANK'] },
  { name: 'Standard Chartered', aliases: ['STANDARD CHARTERED'] },
  { name: 'HSBC', aliases: ['HSBC'] },
  { name: 'Citibank', aliases: ['CITIBANK', 'CITI'] },
  { name: 'American Express', aliases: ['AMERICAN EXPRESS'] },
  { name: 'OneCard', aliases: ['ONECARD', 'ONE CARD'] },
];

const NETWORK_WORDS: [CardNetwork, string[]][] = [
  ['visa', ['VISA']],
  ['mastercard', ['MASTERCARD', 'MASTER CARD']],
  ['rupay', ['RUPAY', 'RU PAY']],
  ['amex', ['AMERICAN EXPRESS', 'AMEX']],
  ['diners', ['DINERS CLUB', 'DINERS']],
  ['discover', ['DISCOVER']],
  ['jcb', ['JCB']],
  ['unionpay', ['UNIONPAY', 'UNION PAY']],
];

const TIERS = [
  'PLATINUM', 'SIGNATURE', 'INFINITE', 'WORLD', 'GOLD', 'CLASSIC', 'TITANIUM', 'SELECT', 'PRIME', 'REWARDS', 'MILLENNIA',
  'REGALIA', 'CORAL', 'RUBYX', 'SAPPHIRO', 'GLOBAL', 'INTERNATIONAL', 'BUSINESS', 'ELITE', 'CASHBACK', 'ACE', 'NEO',
  'MOMENTUM', 'MAGNUS', 'ATLAS', 'PRIVILEGE', 'PREMIER', 'SELECT', 'CORPORATE', 'TRAVEL', 'DIAMOND', 'EMERALD',
];

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length]![b.length]!;
}

function windowScore(line: string, needle: string): number {
  const words = line.split(' ').filter(Boolean);
  const n = needle.split(' ').length;
  let best = 0;
  for (let i = 0; i + n <= words.length; i++) {
    const window = words.slice(i, i + n).join(' ');
    const d = editDistance(window, needle);
    best = Math.max(best, 1 - d / Math.max(needle.length, window.length));
  }
  return best;
}

function normaliseLine(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toDigits(s: string): string {
  return s.replace(/[Oo]/g, '0').replace(/[IlL|]/g, '1').replace(/[S]/g, '5').replace(/[B]/g, '8').replace(/[Z]/g, '2');
}

export function luhnValid(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return digits.length >= 12 && sum % 10 === 0;
}

export function networkFromPrefix(digits: string): CardNetwork | null {
  const p2 = Number(digits.slice(0, 2));
  const p3 = Number(digits.slice(0, 3));
  const p4 = Number(digits.slice(0, 4));
  if (/^3[47]/.test(digits) && digits.length === 15) return 'amex';
  if (/^4/.test(digits)) return 'visa';
  if ((p2 >= 51 && p2 <= 55) || (p4 >= 2221 && p4 <= 2720)) return 'mastercard';
  if (/^(60|65|81|82)/.test(digits) || p3 === 508 || p3 === 353 || p3 === 356) return 'rupay';
  if (/^(36|38|39)/.test(digits) || (p3 >= 300 && p3 <= 305)) return 'diners';
  if (/^35/.test(digits)) return 'jcb';
  if (/^62/.test(digits)) return 'unionpay';
  return null;
}

function extractNumberFacts(lines: string[]): { last4: string | null; network: CardNetwork | null; confident: boolean } {
  const text = lines.join(' ');
  const pattern = /(?<![0-9A-Z])([0-9OoIlSBZ]{4})[ -]?([0-9OoIlSBZ]{4,6})[ -]?([0-9OoIlSBZ]{4,5})(?:[ -]?([0-9OoIlSBZ]{3,4}))?(?![0-9A-Z])/g;
  let fallback: string | null = null;
  for (const m of text.matchAll(pattern)) {
    const candidate = toDigits(m.slice(1).filter(Boolean).join(''));
    if (!/^\d{15,19}$/.test(candidate)) continue;
    if (luhnValid(candidate)) {
      return { last4: candidate.slice(-4), network: networkFromPrefix(candidate), confident: true };
    }
    fallback ??= candidate.slice(-4);
  }
  if (fallback) return { last4: fallback, network: null, confident: false };
  const masked = /(?:[X*•]{4}[ -]?){2,3}([0-9OoIlSB]{4})\b/i.exec(text);
  if (masked) return { last4: toDigits(masked[1]!), network: null, confident: false };
  return { last4: null, network: null, confident: false };
}

function findIssuer(lines: string[]): { name: string; score: number } | null {
  let best: { name: string; score: number; len: number } | null = null;
  for (const raw of lines) {
    const line = normaliseLine(raw);
    if (!line) continue;
    for (const issuer of ISSUERS) {
      for (const alias of issuer.aliases) {
        const glued = alias.replace(/ /g, '').length >= 6 && line.replace(/ /g, '').includes(alias.replace(/ /g, ''));
        if (!glued && alias.length <= 4 && !new RegExp(`\\b${alias}\\b`).test(line)) continue;
        const score = glued ? 1 : windowScore(line, alias) * (alias.length <= 4 ? 0.95 : 1);
        if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && alias.length > best.len)) {
          best = { name: issuer.name, score, len: alias.length };
        }
      }
    }
  }
  return best && best.score >= 0.75 ? { name: best.name, score: best.score } : null;
}

function findNetwork(lines: string[]): CardNetwork | null {
  let best: { n: CardNetwork; score: number } | null = null;
  for (const raw of lines) {
    const line = normaliseLine(raw);
    for (const [network, words] of NETWORK_WORDS) {
      for (const w of words) {
        const score = windowScore(line, w) * (w.length <= 4 ? 1 : 1);
        const threshold = w.length <= 4 ? 1 : 0.8;
        if (score >= threshold && (!best || score > best.score)) best = { n: network, score };
      }
    }
  }
  return best?.n ?? null;
}

function findType(lines: string[]): CardType | null {
  for (const raw of lines) {
    const words = normaliseLine(raw).split(' ');
    for (const w of words) {
      if (w.length >= 5 && editDistance(w, 'DEBIT') <= 1) return 'debit';
      if (w.length >= 6 && editDistance(w, 'CREDIT') <= 1) return 'credit';
      if (w.length >= 6 && (editDistance(w, 'PREPAID') <= 1 || w === 'FOREX')) return 'prepaid';
    }
  }
  return null;
}

function findTiers(lines: string[]): string[] {
  const found: string[] = [];
  for (const raw of lines) {
    for (const w of normaliseLine(raw).split(' ')) {
      if (w.length < 3) continue;
      const tier = TIERS.find((t) => (t.length >= 6 ? editDistance(w, t) <= 1 : w === t));
      if (tier && !found.includes(tier)) found.push(tier);
    }
  }
  return found;
}

const title = (w: string) => w.charAt(0) + w.slice(1).toLowerCase();

export function parseCardText(rawLines: readonly string[]): ParsedCard {
  const lines = rawLines.map((l) => l.trim()).filter(Boolean);
  const issuer = findIssuer(lines);
  const textNetwork = findNetwork(lines);
  const facts = extractNumberFacts(lines);
  const network = textNetwork ?? facts.network;
  const cardType = findType(lines);
  const tiers = findTiers(lines);
  const uncertain: UncertainField[] = [];
  if (!issuer || issuer.score < 0.9) uncertain.push('issuer');
  if (!network || (textNetwork && facts.network && textNetwork !== facts.network)) uncertain.push('network');
  if (!cardType) uncertain.push('cardType');
  if (facts.last4 && !facts.confident) uncertain.push('last4');
  return {
    issuer: issuer?.name ?? null,
    network,
    cardType,
    displayName: tiers.length ? tiers.map(title).join(' ') : null,
    last4: facts.last4,
    uncertain,
  };
}
