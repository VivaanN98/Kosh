import type { Account } from '@/domain/types';

export function accountIcon(a: Account): string {
  return a.kind === 'cash' ? 'wallet' : a.kind === 'credit_card' ? 'credit-card' : a.kind === 'goal' ? 'piggy-bank' : 'landmark';
}
