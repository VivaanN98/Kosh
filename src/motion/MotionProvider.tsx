import { LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

// Feature bundle (layout animations, drag) is loaded after first paint to keep the initial JS small.
const loadFeatures = () => import('./features').then((m) => m.default);

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {/* reducedMotion="user": transforms are disabled for users who ask; opacity still fades. */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
