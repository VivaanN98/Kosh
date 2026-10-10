/**
 * Scanned card faces: what gets removed before the picture is kept, and that removed areas are
 * filled from their surroundings without any of the original pixels surviving.
 */
import { describe, expect, it } from 'vitest';
import { inpaint, maskFromRects, sensitiveRects, type FaceWord } from '@/domain/cards/faceMask';

const word = (text: string, x0: number, y0: number, x1: number, y1: number, confidence = 90): FaceWord => ({ text, x0, y0, x1, y1, confidence });
const covers = (rects: ReturnType<typeof sensitiveRects>, x: number, y: number) => rects.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);

describe('sensitiveRects', () => {
  it('removes the whole number row when only one group was read', () => {
    const rects = sensitiveRects([word('9017', 0.7, 0.58, 0.85, 0.66)]);
    // The groups OCR missed, further left on the same row, are covered too.
    expect(covers(rects, 0.1, 0.62)).toBe(true);
    expect(covers(rects, 0.45, 0.62)).toBe(true);
    // The rest of the design is kept.
    expect(covers(rects, 0.5, 0.2)).toBe(false);
    expect(covers(rects, 0.5, 0.9)).toBe(false);
  });

  it('removes expiry and CVV digits without wiping their row', () => {
    const rects = sensitiveRects([word('12/29', 0.4, 0.72, 0.5, 0.78), word('123', 0.8, 0.4, 0.86, 0.46)]);
    expect(covers(rects, 0.45, 0.75)).toBe(true);
    expect(covers(rects, 0.83, 0.43)).toBe(true);
    expect(covers(rects, 0.9, 0.75)).toBe(false);
  });

  it('removes the name in the lower half but keeps the bank, the network mark and OCR noise', () => {
    const rects = sensitiveRects([
      word('STATE', 0.06, 0.1, 0.2, 0.17),
      word('PRIYA', 0.06, 0.82, 0.2, 0.88),
      word('SHARMA', 0.22, 0.82, 0.4, 0.88),
      word('VISA', 0.72, 0.84, 0.92, 0.95),
      word('Ss', 0.5, 0.7, 0.55, 0.74, 20),
    ]);
    expect(covers(rects, 0.13, 0.85)).toBe(true);
    expect(covers(rects, 0.3, 0.85)).toBe(true);
    expect(covers(rects, 0.13, 0.13)).toBe(false);
    expect(covers(rects, 0.85, 0.9)).toBe(false);
    expect(covers(rects, 0.52, 0.72)).toBe(false);
  });
});

describe('inpaint', () => {
  it('replaces masked pixels using only their surroundings', () => {
    const w = 40;
    const h = 25;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        // A left→right blue gradient card…
        data[i] = 20;
        data[i + 1] = 60;
        data[i + 2] = 100 + x * 3;
        data[i + 3] = 255;
      }
    }
    // …with bright white "digits" in the middle.
    const rect = { x0: 0.25, y0: 0.4, x1: 0.75, y1: 0.6 };
    const mask = maskFromRects([rect], w, h);
    for (let i = 0; i < w * h; i++) if (mask[i]) data.fill(255, i * 4, i * 4 + 3);

    inpaint(data, w, h, mask);

    for (let i = 0; i < w * h; i++) {
      if (!mask[i]) continue;
      const x = i % w;
      // No white survives, and the fill follows the gradient around it.
      expect(data[i * 4]).toBeLessThan(40);
      expect(Math.abs(data[i * 4 + 2]! - (100 + x * 3))).toBeLessThan(14);
    }
  });
});
