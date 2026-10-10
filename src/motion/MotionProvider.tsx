import { LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

// Feature bundle (layout animations, drag) loads once the browser is idle after the first paint, so it
// never competes with the Home screen's critical JS. Until then, elements render in their final state.
// The first page (or the sign-in screen) dispatches `kosh:painted` once it is on screen (fallback: 2.5 s).
const whenIdle = () =>
  new Promise<void>((resolve) => {
    const done = () => {
      window.removeEventListener('kosh:painted', done);
      resolve();
    };
    window.addEventListener('kosh:painted', done);
    setTimeout(done, 2500);
  });
const loadFeatures = () => whenIdle().then(() => import('./features')).then((m) => m.default);

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {/* reducedMotion="user": transforms are disabled for users who ask; opacity still fades. */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
