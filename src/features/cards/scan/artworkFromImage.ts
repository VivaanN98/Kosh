/**
 * Builds a SANITIZED template artwork from a card photo: only colours and layout parameters are
 * derived (dominant colours, base style, chip position/colour, text tone, where the logo and issuer
 * sit). No pixels, text or numbers leave this function; the caller wipes the canvas afterwards.
 */
import { DEFAULT_ARTWORK, textToneFor } from '@/domain/cards/artwork';
import type { CardArtwork } from '@/domain/types';

export interface WordBox {
  text: string;
  /** Normalised 0..1 box within the card image. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** OCR confidence 0..100. */
  confidence?: number;
}

type RGB = [number, number, number];

const hex = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

function regionMean(d: Uint8ClampedArray, w: number, h: number, x0: number, y0: number, x1: number, y1: number): RGB {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = Math.floor(y0 * h); y < Math.ceil(y1 * h); y++) {
    for (let x = Math.floor(x0 * w); x < Math.ceil(x1 * w); x++) {
      const i = (y * w + x) * 4;
      r += d[i]!;
      g += d[i + 1]!;
      b += d[i + 2]!;
      n++;
    }
  }
  return n ? [r / n, g / n, b / n] : [34, 37, 43];
}

function saturation([r, g, b]: RGB): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function lum([r, g, b]: RGB): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** k-means (k=3) over a small sample of pixels. */
function dominantColors(d: Uint8ClampedArray): RGB[] {
  const pts: RGB[] = [];
  for (let i = 0; i < d.length; i += 4 * 3) pts.push([d[i]!, d[i + 1]!, d[i + 2]!]);
  pts.sort((a, b) => lum(a) - lum(b));
  let centers: RGB[] = [pts[Math.floor(pts.length * 0.15)]!, pts[Math.floor(pts.length * 0.5)]!, pts[Math.floor(pts.length * 0.85)]!];
  const counts = [0, 0, 0];
  for (let iter = 0; iter < 8; iter++) {
    const sums: RGB[] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    counts.fill(0);
    for (const p of pts) {
      let k = 0;
      for (let c = 1; c < 3; c++) if (dist(p, centers[c]!) < dist(p, centers[k]!)) k = c;
      sums[k]![0] += p[0];
      sums[k]![1] += p[1];
      sums[k]![2] += p[2];
      counts[k]!++;
    }
    centers = centers.map((c, k) => (counts[k] ? [sums[k]![0] / counts[k]!, sums[k]![1] / counts[k]!, sums[k]![2] / counts[k]!] : c)) as RGB[];
  }
  // Keep clusters that cover a meaningful share (text/logos are small clusters).
  return centers.filter((_, k) => counts[k]! > pts.length * 0.12);
}

export function artworkFromImage(card: HTMLCanvasElement, words: WordBox[] = []): CardArtwork {
  const w = 96;
  const h = Math.round(w / 1.586);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(card, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;

  const tl = regionMean(d, w, h, 0.02, 0.05, 0.35, 0.3);
  const mid = regionMean(d, w, h, 0.35, 0.35, 0.65, 0.65);
  const br = regionMean(d, w, h, 0.65, 0.7, 0.98, 0.95);
  const dom = dominantColors(d);
  const spread = Math.max(dist(tl, mid), dist(mid, br), dist(tl, br));
  const avgSat = (saturation(tl) + saturation(mid) + saturation(br)) / 3;

  let template: CardArtwork['template'] = 'gradient';
  if (spread < 28) template = 'solid';
  else if (avgSat < 0.12 && lum(mid) > 0.3) template = 'metal';
  else if (dom.length >= 3 && spread > 120) template = 'mesh';
  const colors: CardArtwork['colors'] = template === 'solid' ? [hex(mid), hex(mid)] : [hex(tl), hex(mid), hex(br)];

  // Chip: a warm (gold) or bright neutral (silver) patch in the left or right middle band.
  const left = regionMean(d, w, h, 0.07, 0.33, 0.2, 0.55);
  const right = regionMean(d, w, h, 0.8, 0.33, 0.93, 0.55);
  const chipScore = (p: RGB) => {
    const warm = p[0] > p[2] + 25 && p[1] > p[2] + 10 && lum(p) > 0.45;
    return (warm ? 2 : 0) + dist(p, mid) / 80;
  };
  const leftScore = chipScore(left);
  const rightScore = chipScore(right);
  const chipSide: CardArtwork['chip'] = Math.max(leftScore, rightScore) < 0.6 ? 'left' : leftScore >= rightScore ? 'left' : 'right';
  const chipColor = chipSide === 'right' ? right : left;
  const chipStyle: CardArtwork['chipStyle'] = chipColor[0] > chipColor[2] + 20 ? 'gold' : 'silver';

  // Gloss: a bright specular highlight well above the card's typical brightness.
  let peak = 0;
  for (let i = 0; i < d.length; i += 4) peak = Math.max(peak, lum([d[i]!, d[i + 1]!, d[i + 2]!]));
  const finish: CardArtwork['finish'] = peak - lum(mid) > 0.35 ? 'gloss' : 'matte';

  // Layout from OCR word positions (network words and the first long word ≈ issuer).
  const networkWord = words.find((wd) => /VISA|MASTER|RUPAY|AMEX|AMERICAN|DINERS|DISCOVER|JCB|UNIONPAY/i.test(wd.text));
  let networkPosition: CardArtwork['networkPosition'] = 'bottom-right';
  if (networkWord) {
    const cx = (networkWord.x0 + networkWord.x1) / 2;
    const cy = (networkWord.y0 + networkWord.y1) / 2;
    networkPosition = cy < 0.4 ? 'top-right' : cx < 0.45 ? 'bottom-left' : 'bottom-right';
  }
  const issuerWord = words.find((wd) => wd.y1 < 0.35 && /[A-Za-z]{3,}/.test(wd.text) && wd !== networkWord);
  const issuerPosition: CardArtwork['issuerPosition'] = issuerWord && issuerWord.x0 > 0.5 ? 'top-right' : 'top-left';

  const tone = textToneFor(colors.filter(Boolean) as string[]);
  c.width = 0; // release pixels
  return {
    ...DEFAULT_ARTWORK,
    template,
    colors,
    textTone: tone,
    chip: chipSide,
    chipStyle,
    finish,
    networkPosition,
    issuerPosition,
    contactless: true,
    pattern: 'none',
  };
}
