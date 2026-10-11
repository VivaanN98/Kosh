import { LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

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
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
