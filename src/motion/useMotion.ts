import { useReducedMotion } from 'motion/react';
import { transitionFor, type SpringName } from './springs';

export function useSpring(name: SpringName) {
  const reduced = useReducedMotion();
  return transitionFor(name, reduced);
}

export { useReducedMotion };
