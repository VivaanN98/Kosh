/**
 * The glass surface has a solid fallback for every case: no backdrop-filter support, the OS
 * "reduce transparency" setting, and the in-app toggle. (E2E covers the toggle at runtime.)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/styles/index.css'), 'utf8');

describe('glass fallbacks', () => {
  it('falls back when backdrop-filter is unsupported', () => {
    expect(css).toMatch(/@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)\s*{\s*\.glass\s*{\s*background: var\(--glass-solid\)/);
  });
  it('honours prefers-reduced-transparency and the in-app toggle', () => {
    expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\)\s*{\s*\.glass\s*{[^}]*background: var\(--glass-solid\);[^}]*backdrop-filter: none/);
    expect(css).toMatch(/:root\[data-transparency='reduced'\] \.glass\s*{[^}]*backdrop-filter: none/);
  });
  it('disables shimmer and smooth scrolling for reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*{\s*\.skeleton\s*{\s*animation: none/);
  });
});
