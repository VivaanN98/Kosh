import { forwardRef, type InputHTMLAttributes } from 'react';

export const AmountField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }>(
  function AmountField({ label, error, hint, id, className = '', ...rest }, ref) {
    const fid = id ?? `amt-${label.replace(/\W+/g, '-').toLowerCase()}`;
    return (
      <label htmlFor={fid} className={`block ${className}`}>
        <span className="mb-1.5 block text-[13px] font-medium text-text-2">{label}</span>
        <span className="relative block">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] text-text-3" aria-hidden="true">
            ₹
          </span>
          <input
            ref={ref}
            id={fid}
            inputMode="decimal"
            autoComplete="off"
            className="num h-12 w-full rounded-[14px] border border-line bg-surface-2 pl-8 pr-3.5 text-[16px] outline-none placeholder:text-text-3 focus:border-[var(--focus)] focus:shadow-[0_0_0_3px_var(--peri-soft)]"
            aria-invalid={error ? true : undefined}
            aria-describedby={error || hint ? `${fid}-msg` : undefined}
            {...rest}
          />
        </span>
        {(error || hint) && (
          <span id={`${fid}-msg`} className={`mt-1.5 block text-[12px] ${error ? 'text-negative' : 'text-text-3'}`}>
            {error ?? hint}
          </span>
        )}
      </label>
    );
  },
);
