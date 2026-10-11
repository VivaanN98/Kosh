import { formatINR, formatINRCompact, splitParts, type Paise } from '@/lib/money';

type Tone = 'auto' | 'neutral' | 'positive' | 'negative' | 'muted';

const toneClass: Record<Exclude<Tone, 'auto'>, string> = {
  neutral: 'text-text',
  positive: 'text-positive',
  negative: 'text-negative',
  muted: 'text-text-2',
};

export function Money({
  amount,
  tone = 'neutral',
  signed = false,
  compact = false,
  className = '',
}: {
  amount: Paise;
  tone?: Tone;
  signed?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const resolved = tone === 'auto' ? (amount > 0 ? 'positive' : amount < 0 ? 'neutral' : 'muted') : tone;
  const text = compact ? formatINRCompact(amount) : formatINR(amount, { sign: signed ? 'always' : 'auto' });
  return <span className={`num ${toneClass[resolved]} ${className}`}>{text}</span>;
}

export function BigMoney({ amount, className = '', size = 'xl', hidePaise = false }: { amount: Paise; className?: string; size?: 'lg' | 'xl' | '2xl'; hidePaise?: boolean }) {
  const p = splitParts(amount);
  const sizes = {
    lg: 'text-[28px] leading-[32px]',
    xl: 'text-[40px] leading-[44px]',
    '2xl': 'text-[52px] leading-[56px] sm:text-[60px] sm:leading-[64px]',
  } as const;
  return (
    <span className={`display-num inline-flex items-baseline ${sizes[size]} ${className}`} aria-label={formatINR(amount)}>
      <span aria-hidden="true" className="flex items-baseline">
        {p.sign && <span className="mr-0.5 text-text-2">{p.sign}</span>}
        <span className="mr-[0.08em] translate-y-[-0.08em] text-[0.55em] font-normal text-text-2">₹</span>
        <span>{p.rupees}</span>
        {!hidePaise && <span className="text-[0.5em] font-normal text-text-3">.{p.paise}</span>}
      </span>
    </span>
  );
}
