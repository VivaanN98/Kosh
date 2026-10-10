/**
 * The ONLY place spring presets are defined. Movement uses springs; reduced motion swaps them
 * for short opacity fades (see `useMotionPreset`).
 */
import type { Transition } from 'motion/react';

export const springs = {
  /** Taps, toggles, small elements. */
  snappy: { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 },
  /** Default UI movement: lists, layout shifts, page content. */
  smooth: { type: 'spring', stiffness: 320, damping: 32, mass: 1 },
  /** Bottom sheets and modals. */
  sheet: { type: 'spring', stiffness: 380, damping: 38, mass: 0.9 },
  /** Cards in the wallet: a touch of weight. */
  card: { type: 'spring', stiffness: 260, damping: 28, mass: 1.1 },
  /** Gentle reveals of numbers and charts. */
  gentle: { type: 'spring', stiffness: 170, damping: 26, mass: 1 },
} as const satisfies Record<string, Transition>;

export type SpringName = keyof typeof springs;

/** Replacement for every spring when the user prefers reduced motion. */
export const reducedFade: Transition = { duration: 0.16, ease: 'easeOut' };

export function transitionFor(name: SpringName, reduced: boolean | null): Transition {
  return reduced ? reducedFade : springs[name];
}
