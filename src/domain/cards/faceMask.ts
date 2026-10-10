/**
 * Removing the sensitive parts of a scanned card picture, so its real design can be kept as the
 * card's face. Pure: works on word boxes and raw RGBA pixels, no DOM.
 *
 * What is removed: every word containing a digit (number, expiry, CVV), the whole row across the
 * card wherever a 4-digit group was read (a long number whose other groups OCR missed), and
 * confidently read words in the lower half that are not the network mark (name, "VALID THRU").
 * Removed areas are filled from their surroundings so the card looks clean, not blacked out.
 */

export interface FaceWord {
  text: string;
  /** Normalised 0..1 box within the card image. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** OCR confidence 0..100, when known. */
  confidence?: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const NETWORK_WORD = /VISA|MASTER|RUPAY|AMEX|AMERICAN|EXPRESS|DINERS|DISCOVER|JCB|UNIONPAY|MAESTRO/i;
const DATE_LIKE = /^\D*\d{1,2}\s*[/-]\s*\d{2,4}\D*$/;
const clamp = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Zones that are removed on EVERY card face, whatever OCR found. Embossed or glare-covered numbers
 * are often unreadable to OCR, so masking only what was read could keep a full number in the
 * picture. On ISO/IEC 7810 ID-1 cards the number line sits in the middle band and the name and
 * expiry in the lower-left; the bank name (top) and network mark (lower-right) stay visible.
 */
export const STANDARD_SENSITIVE_ZONES: readonly Rect[] = [
  { x0: 0.03, y0: 0.47, x1: 0.97, y1: 0.7 }, // card number line
  { x0: 0.03, y0: 0.68, x1: 0.7, y1: 0.97 }, // name, expiry, "VALID THRU"
];

export function sensitiveRects(words: readonly FaceWord[]): Rect[] {
  const rects: Rect[] = [];
  for (const w of words) {
    const text = w.text.trim();
    if (!text) continue;
    const h = Math.max(0.01, w.y1 - w.y0);
    const padY = Math.max(0.02, h * 0.35);
    const padX = Math.max(0.015, h * 0.6);
    const box = { x0: clamp(w.x0 - padX), y0: clamp(w.y0 - padY), x1: clamp(w.x1 + padX), y1: clamp(w.y1 + padY) };
    if (/\d/.test(text)) {
      rects.push(box);
      // A card number is one row of groups; OCR often reads only some of them.
      if (/\d{4}/.test(text.replace(/\s/g, '')) && !DATE_LIKE.test(text)) rects.push({ x0: 0, y0: box.y0, x1: 1, y1: box.y1 });
    } else if (w.y0 > 0.5 && /[A-Za-z]{2,}/.test(text) && !NETWORK_WORD.test(text) && (w.confidence ?? 100) >= 55) {
      rects.push(box);
    }
  }
  return rects;
}

/** 1 where a pixel must be replaced. */
export function maskFromRects(rects: readonly Rect[], w: number, h: number): Uint8Array {
  const mask = new Uint8Array(w * h);
  for (const r of rects) {
    const x0 = Math.floor(r.x0 * w);
    const x1 = Math.min(w, Math.ceil(r.x1 * w));
    const y0 = Math.floor(r.y0 * h);
    const y1 = Math.min(h, Math.ceil(r.y1 * h));
    for (let y = y0; y < y1; y++) mask.fill(1, y * w + x0, y * w + x1);
  }
  return mask;
}

/**
 * Fills masked pixels from their surroundings (push-pull: average outward into coarser levels,
 * then pull the averages back into the holes), then smooths the filled area. The original pixels
 * under the mask never contribute.
 */
export function inpaint(data: Uint8ClampedArray, w: number, h: number, mask: Uint8Array): void {
  type Level = { w: number; h: number; c: Float32Array; a: Float32Array };
  const base: Level = { w, h, c: new Float32Array(w * h * 3), a: new Float32Array(w * h) };
  for (let i = 0; i < w * h; i++) {
    if (mask[i]) continue;
    base.a[i] = 1;
    base.c[i * 3] = data[i * 4]!;
    base.c[i * 3 + 1] = data[i * 4 + 1]!;
    base.c[i * 3 + 2] = data[i * 4 + 2]!;
  }
  // Push: premultiplied 2×2 averages until one pixel remains.
  const levels: Level[] = [base];
  while (levels.at(-1)!.w > 1 || levels.at(-1)!.h > 1) {
    const f = levels.at(-1)!;
    const lw = Math.max(1, Math.ceil(f.w / 2));
    const lh = Math.max(1, Math.ceil(f.h / 2));
    const l: Level = { w: lw, h: lh, c: new Float32Array(lw * lh * 3), a: new Float32Array(lw * lh) };
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const fi = y * f.w + x;
        const ci = (y >> 1) * lw + (x >> 1);
        l.a[ci]! += f.a[fi]!;
        for (let k = 0; k < 3; k++) l.c[ci * 3 + k]! += f.c[fi * 3 + k]!;
      }
    }
    for (let i = 0; i < lw * lh; i++) {
      const a = l.a[i]!;
      if (a > 1) {
        for (let k = 0; k < 3; k++) l.c[i * 3 + k]! /= a;
        l.a[i] = 1;
      }
    }
    levels.push(l);
  }
  // Pull: fill each level's missing coverage from the (already complete) coarser level.
  for (let li = levels.length - 2; li >= 0; li--) {
    const f = levels[li]!;
    const cl = levels[li + 1]!;
    const top = cl.a[0] || 1;
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const i = y * f.w + x;
        const a = f.a[i]!;
        if (a >= 1) continue;
        // Bilinear sample of the coarser level at this pixel's centre.
        const gx = Math.min(cl.w - 1, Math.max(0, (x + 0.5) / 2 - 0.5));
        const gy = Math.min(cl.h - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const x1 = Math.min(cl.w - 1, x0 + 1);
        const y1 = Math.min(cl.h - 1, y0 + 1);
        const tx = gx - x0;
        const ty = gy - y0;
        for (let k = 0; k < 3; k++) {
          const s = (xx: number, yy: number) => {
            const j = yy * cl.w + xx;
            return cl.c[j * 3 + k]! / (cl.a[j]! || top);
          };
          const v = (s(x0, y0) * (1 - tx) + s(x1, y0) * tx) * (1 - ty) + (s(x0, y1) * (1 - tx) + s(x1, y1) * tx) * ty;
          f.c[i * 3 + k] = f.c[i * 3 + k]! + (1 - a) * v;
        }
        f.a[i] = 1;
      }
    }
  }
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    data[i * 4] = base.c[i * 3]!;
    data[i * 4 + 1] = base.c[i * 3 + 1]!;
    data[i * 4 + 2] = base.c[i * 3 + 2]!;
    data[i * 4 + 3] = 255;
  }
  smoothMasked(data, w, h, mask, 3);
}

/** A few 3×3 box-blur passes over masked pixels only, to hide the coarse-level blockiness. */
function smoothMasked(data: Uint8ClampedArray, w: number, h: number, mask: Uint8Array, passes: number) {
  const src = new Uint8ClampedArray(data.length);
  for (let p = 0; p < passes; p++) {
    src.set(data);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!mask[i]) continue;
        for (let k = 0; k < 3; k++) {
          let sum = 0;
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= h) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              if (xx < 0 || xx >= w) continue;
              sum += src[(yy * w + xx) * 4 + k]!;
              n++;
            }
          }
          data[i * 4 + k] = sum / n;
        }
      }
    }
  }
}
