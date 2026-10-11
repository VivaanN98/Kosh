import { Link } from 'react-router';
import { ChevronRight, Landmark } from 'lucide-react';
import { IconByName } from '@/components/ui/CategoryIcon';
import { Section } from '@/components/ui/bits';
import { useDerived } from '@/data/hooks';
import { accountIcon } from '@/features/accounts/accountIcon';
import { formatINR } from '@/lib/money';

const MAX_TILES = 5;

export function AccountTiles() {
  const d = useDerived();
  const accounts = d.activeAccounts.filter((a) => !a.isSystem);
  if (accounts.length === 0) {
    return (
      <Section title="Get started" className="mt-2">
        <div className="card flex flex-col items-start gap-3 p-5" data-testid="first-run">
          <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-surface-2 text-text-2" aria-hidden="true">
            <Landmark size={22} />
          </span>
          <p className="serif text-[20px] leading-tight">Add your first account</p>
          <p className="max-w-[44ch] text-[14px] text-text-2">
            Start with a bank account or your cash in hand, and enter what it holds today. You can add cards, credit cards and goals whenever you like.
          </p>
          <Link to="/accounts?new=1" className="tap inline-flex h-11 items-center rounded-full bg-text px-5 text-[15px] font-semibold text-text-inverse" data-testid="first-run-add-account">
            Add an account
          </Link>
        </div>
      </Section>
    );
  }
  const shown = accounts.slice(0, MAX_TILES);

  return (
    <Section title="Your accounts" className="mt-2">
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {shown.map((a, i) => {
          const n = (i % 6) + 1;
          const bal = d.balances.get(a.id) ?? 0;
          const isCard = a.kind === 'credit_card';
          return (
            <li key={a.id}>
              <Link
                to={`/accounts/${a.id}`}
                data-testid={`account-tile-${a.name}`}
                className="relative flex min-h-[156px] flex-col justify-between overflow-hidden rounded-[22px] p-4 text-white transition-transform duration-150 active:scale-[0.97]"
                style={{ background: `linear-gradient(145deg, var(--tile-${n}-from), var(--tile-${n}-to))` }}
              >
                <IconByName name={accountIcon(a)} size={104} strokeWidth={1.25} className="pointer-events-none absolute -bottom-4 -right-4 opacity-[0.16]" />
                <span className="relative block">
                  <span className="block text-[17px] font-semibold leading-snug">{a.name}</span>
                  <span className="num mt-1 block text-[15px] font-medium">
                    {formatINR(isCard ? -bal : bal, { decimals: 'never' })}
                    {isCard && <span className="ml-1.5 text-[12px] font-medium">owed</span>}
                  </span>
                </span>
                <span className="relative inline-flex h-9 w-fit items-center gap-0.5 rounded-full bg-white pl-3.5 pr-2.5 text-[14px] font-semibold text-[#17171a]">
                  Open <ChevronRight size={15} aria-hidden="true" />
                </span>
              </Link>
            </li>
          );
        })}
        <li>
          <Link
            to="/accounts"
            className="relative flex min-h-[156px] flex-col justify-between rounded-[22px] border border-line bg-surface-2 p-4 transition-transform duration-150 active:scale-[0.97]"
          >
            <span className="block text-[17px] font-semibold leading-snug">{accounts.length > shown.length ? `All ${accounts.length} accounts` : 'Manage accounts'}</span>
            <span className="inline-flex h-9 w-fit items-center gap-0.5 rounded-full bg-text pl-3.5 pr-2.5 text-[14px] font-semibold text-text-inverse">
              View <ChevronRight size={15} aria-hidden="true" />
            </span>
          </Link>
        </li>
      </ul>
    </Section>
  );
}
