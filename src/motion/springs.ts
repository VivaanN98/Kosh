import type { Transition } from 'motion/react';

export const springs = {
  snappy: { type: 'spring', stiffness: 520, damping: 41, mass: 0.8 },
  smooth: { type: 'spring', stiffness: 320, damping: 36, mass: 1 },
  sheet: { type: 'spring', stiffness: 380, damping: 38, mass: 0.9 },
  card: { type: 'spring', stiffness: 260, damping: 28, mass: 1.1 },
  gentle: { type: 'spring', stiffness: 170, damping: 26, mass: 1 },
} as const satisfies Record<string, Transition>;
