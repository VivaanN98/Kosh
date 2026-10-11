import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1]!, m[2]!]));
}

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

const themes = { light: block(':root {'), dark: block(":root[data-theme='dark']") };

describe('theme contrast (WCAG AA)', () => {
  for (const [name, t] of Object.entries(themes)) {
    it(`${name}: body text, secondary and tertiary text meet 4.5:1 on bg and surfaces`, () => {
      for (const fg of ['text', 'text-2', 'text-3']) {
        for (const bg of ['bg', 'surface', 'surface-2']) {
          expect(ratio(t[fg]!, t[bg]!), `${name} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
    it(`${name}: accent and semantic text colours meet 4.5:1 on surface`, () => {
      for (const fg of ['mint', 'peri', 'positive', 'negative', 'warning']) {
        expect(ratio(t[fg]!, t.surface!), `${name} ${fg}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(ratio(t['on-mint']!, t.mint!), `${name} on-mint`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t['text-inverse']!, t.text!), `${name} inverse button`).toBeGreaterThanOrEqual(4.5);
    });
  }
});
