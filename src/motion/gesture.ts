/**
 * Gesture maths shared by the sheet and the wallet carousel (Apple, "Designing Fluid Interfaces").
 * Pure functions: decisions use where a flick is *going*, not where the finger lifted.
 */

/**
 * Distance a flick would coast if it decelerated like a scroll view.
 * `velocity` is px/s; `decelerationRate` 0.998 is normal scroll, 0.99 is snappier.
 */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

