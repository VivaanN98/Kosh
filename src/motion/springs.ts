/**
 * The ONLY place spring presets are defined. Movement uses springs; reduced motion swaps them
 * for short opacity fades (see `useMotionPreset`).
 */
import type { Transition } from 'motion/react';

/*
 * Damping ratio ζ = damping / (2·√(stiffness·mass)). UI that did not carry momentum is critically
 * damped (ζ ≈ 1, no overshoot); only the wallet card, which is thrown by a flick, bounces (ζ ≈ 0.83).
 */
export const springs = {
  /** Taps, toggles, small elements. ζ ≈ 1. */
  snappy: { type: 'spring', stiffness: 520, damping: 41, mass: 0.8 },
  /** Default UI movement: lists, layout shifts, page content. ζ ≈ 1. */
  smooth: { type: 'spring', stiffness: 320, damping: 36, mass: 1 },
  /** Bottom sheets and modals. ζ ≈ 1. */
  sheet: { type: 'spring', stiffness: 380, damping: 38, mass: 0.9 },
  /** Cards in the wallet: a touch of weight, a little overshoot after a flick. ζ ≈ 0.83. */
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
