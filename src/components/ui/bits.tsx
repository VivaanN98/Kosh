import { m } from 'motion/react';
import { forwardRef, useEffect, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { springs } from '@/motion/springs';

export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[18px] bg-surface-2 text-text-2" aria-hidden="true">
        {icon}
      </div>
      <p className="serif text-[22px] leading-tight">{title}</p>
      {body && <p className="mt-1.5 max-w-[30ch] text-[14px] text-text-2">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, actions }: { eyebrow?: string; title: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4 pt-2">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="serif text-[34px] leading-[1.05] tracking-[-0.01em] md:text-[40px]">{title}</h1>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`mb-8 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex min-h-[32px] items-center justify-between gap-3 px-1">
          {title && <h2 className="text-[13px] font-medium uppercase tracking-[0.1em] text-text-3">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

let painted = false;

/**
 * Motion's animation features load only after the first page paints (bundle size). Anything on that
 * first screen must therefore render in its final state rather than wait for an entrance animation.
 */
export function useIsFirstPaint(): boolean {
  return useState(() => !painted)[0];
}

export function signalPainted() {
  if (painted) return;
  painted = true;
  requestAnimationFrame(() => setTimeout(() => window.dispatchEvent(new Event('kosh:painted')), 0));
}

/** Fade + rise for route content. Transform/opacity only. */
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  const first = useIsFirstPaint();
  // The first real page on screen releases deferred loaders (motion features, preloads).
  useEffect(() => signalPainted(), []);
  return (
    <m.main
      id="main"
      initial={first ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.smooth}
      className={`mx-auto w-full max-w-[var(--content-max)] px-4 pb-[calc(var(--tabbar-h)+40px+var(--safe-bottom))] pt-[calc(12px+var(--safe-top))] md:px-8 md:pb-16 md:pt-8 ${className}`}
    >
      {children}
    </m.main>
  );
}

const fieldBase =
  'h-12 w-full rounded-[14px] border border-line bg-surface-2 px-3.5 text-[15px] text-text placeholder:text-text-3 outline-none transition-[border-color,box-shadow] focus:border-[var(--focus)] focus:shadow-[0_0_0_3px_var(--peri-soft)]';

export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }>(
  function TextField({ label, hint, error, id, className = '', ...rest }, ref) {
    const fid = id ?? `f-${label.replace(/\W+/g, '-').toLowerCase()}`;
    return (
      <label htmlFor={fid} className={`block ${className}`}>
        <span className="mb-1.5 block text-[13px] font-medium text-text-2">{label}</span>
        <input ref={ref} id={fid} className={fieldBase} aria-invalid={error ? true : undefined} aria-describedby={error || hint ? `${fid}-msg` : undefined} {...rest} />
        {(error || hint) && (
          <span id={`${fid}-msg`} className={`mt-1.5 block text-[12px] ${error ? 'text-negative' : 'text-text-3'}`}>
            {error ?? hint}
          </span>
        )}
      </label>
    );
  },
);

export const SelectField = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; children: ReactNode }>(
  function SelectField({ label, error, id, className = '', children, ...rest }, ref) {
    const fid = id ?? `s-${label.replace(/\W+/g, '-').toLowerCase()}`;
    return (
      <label htmlFor={fid} className={`block ${className}`}>
        <span className="mb-1.5 block text-[13px] font-medium text-text-2">{label}</span>
        <span className="relative block">
          <select ref={ref} id={fid} className={`${fieldBase} appearance-none pr-10`} aria-invalid={error ? true : undefined} {...rest}>
            {children}
          </select>
          <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-3" aria-hidden="true" />
        </span>
        {error && <span className="mt-1.5 block text-[12px] text-negative">{error}</span>}
      </label>
    );
  },
);

/** Thin progress bar (scaleX transform — never animates width). */
export function Progress({ value, tone = 'mint', label }: { value: number; tone?: 'mint' | 'warning' | 'negative' | 'peri'; label: string }) {
  const clamped = Math.max(0, Math.min(1, value));
  const color = { mint: 'var(--mint)', warning: 'var(--warning)', negative: 'var(--negative)', peri: 'var(--peri)' }[tone];
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
    >
      <m.div
        className="h-full w-full origin-left rounded-full"
        style={{ background: color }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: clamped }}
        transition={springs.gentle}
      />
    </div>
  );
}
