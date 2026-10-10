import { m, type HTMLMotionProps } from 'motion/react';
import { forwardRef, type ReactNode } from 'react';
import { springs } from '@/motion/springs';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-text text-text-inverse shadow-2 hover:opacity-95',
  accent: 'bg-mint text-on-mint shadow-2 hover:opacity-95',
  secondary: 'bg-surface-2 text-text border border-line hover:bg-surface-3',
  ghost: 'bg-transparent text-text-2 hover:bg-surface-2 hover:text-text',
  danger: 'bg-negative-soft text-negative hover:opacity-90',
};

const sizes: Record<Size, string> = {
  sm: 'hit-y h-9 px-3 text-[13px] rounded-[11px] gap-1.5',
  md: 'h-11 px-4 text-[14px] rounded-[13px] gap-2',
  lg: 'h-14 px-6 text-[16px] rounded-[16px] gap-2',
};

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  children?: ReactNode;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, children, loading, block, className = '', disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <m.button
      ref={ref}
      type={type}
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      transition={springs.snappy}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-w-[44px] select-none items-center justify-center font-medium transition-[background-color,opacity,color] disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${sizes[size]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </m.button>
  );
});

export function IconButton({ label, children, className = '', ...rest }: Omit<ButtonProps, 'icon'> & { label: string }) {
  return (
    <Button variant="ghost" aria-label={label} title={label} className={`!px-0 w-11 ${className}`} {...rest}>
      {children}
    </Button>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
