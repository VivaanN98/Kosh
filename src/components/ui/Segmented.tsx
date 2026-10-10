import { m } from 'motion/react';
import { useId, type ReactNode } from 'react';
import { springs } from '@/motion/springs';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  testId?: string;
}

/** iOS-style segmented control. The selection pill moves with a shared layout animation. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
  className = '',
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={`inline-flex rounded-[14px] bg-surface-2 p-1 ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={o.testId}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const i = options.findIndex((x) => x.value === value);
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                onChange(options[(i + 1) % options.length]!.value);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                onChange(options[(i - 1 + options.length) % options.length]!.value);
              }
            }}
            tabIndex={active ? 0 : -1}
            className={`relative flex-1 whitespace-nowrap rounded-[10px] font-medium transition-colors ${
              size === 'sm' ? 'h-9 px-3 text-[13px]' : 'h-10 px-4 text-[14px]'
            } ${active ? 'text-text' : 'text-text-2 hover:text-text'}`}
          >
            {active && (
              <m.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-[10px] bg-surface shadow-1"
                style={{ boxShadow: 'inset 0 0 0 1px var(--line), var(--shadow-1)' }}
                transition={springs.snappy}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
