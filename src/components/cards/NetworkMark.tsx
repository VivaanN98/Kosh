import type { CardNetwork } from '@/domain/types';

export function NetworkMark({ network, tone, height = 26 }: { network: CardNetwork; tone: 'light' | 'dark'; height?: number }) {
  const ink = tone === 'light' ? '#ffffff' : '#14161a';
  switch (network) {
    case 'mastercard':
      return (
        <svg height={height} viewBox="0 0 52 32" aria-label="Mastercard" role="img">
          <circle cx="18" cy="16" r="14" fill="#eb001b" />
          <circle cx="34" cy="16" r="14" fill="#f79e1b" />
          <path d="M26 4.6a14 14 0 0 1 0 22.8a14 14 0 0 1 0-22.8z" fill="#ff5f00" />
        </svg>
      );
    case 'visa':
      return (
        <svg height={height} viewBox="0 0 74 26" aria-label="Visa" role="img">
          <text x="0" y="22" fill={ink} fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontStyle="italic" fontSize="26" letterSpacing="-0.5">
            VISA
          </text>
        </svg>
      );
    case 'rupay':
      return (
        <svg height={height} viewBox="0 0 92 28" aria-label="RuPay" role="img">
          <text x="0" y="21" fill={ink} fontFamily="Arial, sans-serif" fontWeight="800" fontStyle="italic" fontSize="22" letterSpacing="-0.4">
            RuPay
          </text>
          <path d="M72 6 L84 14 L72 22 Z" fill="#f47920" />
          <path d="M79 6 L91 14 L79 22 Z" fill="#0d8e46" opacity="0.95" />
        </svg>
      );
    case 'amex':
      return (
        <svg height={height} viewBox="0 0 56 32" aria-label="American Express" role="img">
          <rect width="56" height="32" rx="4" fill="#2e77bc" />
          <text x="28" y="21" textAnchor="middle" fill="#fff" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="13" letterSpacing="0.5">
            AMEX
          </text>
        </svg>
      );
    default: {
      const label = { diners: 'Diners Club', discover: 'DISCOVER', jcb: 'JCB', unionpay: 'UnionPay', other: '' }[network];
      if (!label) return null;
      return (
        <svg height={height * 0.8} viewBox={`0 0 ${label.length * 11} 22`} aria-label={label} role="img">
          <text x="0" y="17" fill={ink} fontFamily="Arial, sans-serif" fontWeight="700" fontSize="16">
            {label}
          </text>
        </svg>
      );
    }
  }
}
