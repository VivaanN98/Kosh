import { describe, expect, it } from 'vitest';
import { project } from '@/motion/gesture';

describe('gesture maths', () => {
  it('projects a flick forward in the direction of travel', () => {
    expect(project(0)).toBe(0);
    expect(project(1000, 0.99)).toBeCloseTo(99, 5);
    expect(project(-1000, 0.99)).toBeCloseTo(-99, 5);
  });

  it('a quick upward flick cancels a short downward drag', () => {
    const end = 60 + project(-900, 0.99);
    expect(end).toBeLessThan(140);
  });
});
