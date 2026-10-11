import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { Page, PageHeader, Section } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { BigMoney, Money } from '@/components/ui/Money';
import { IconTile } from '@/components/ui/CategoryIcon';
import { useDerived, useSnapshot } from '@/data/hooks';
import { formatRelativeDay } from '@/lib/dates';
import { springs } from '@/motion/springs';
import { statementStatus } from '@/domain/statements';
import type { Account } from '@/domain/types';
import { CardsSection } from '@/features/cards/CardsSection';
import { AccountFormSheet } from './AccountFormSheet';
import { paidSince } from './cardMath';
import { accountIcon } from './accountIcon';

const GROUPS: { kind: Account['kind']; title: string }[] = [
  { kind: 'bank', title: 'Bank accounts' },
  { kind: 'cash', title: 'Cash' },
  { kind: 'credit_card', title: 'Credit cards' },
  { kind: 'goal', title: 'Goal pots' },
];

export default function AccountsPage() {
  const snap = useSnapshot();
  const d = useDerived();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const wantsNew = params.get('new') === '1';
  const closeForm = () => {
    setAdding(false);
    if (wantsNew) setParams({}, { replace: true });
  };
  const [showArchived, setShowArchived] = useState(false);
  const archived = snap.accounts.filter((a) => a.archivedAt);

  return (
    <Page>
      <PageHeader
        eyebrow="Everything you hold and owe"
        title="Accounts"
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={16} />} onClick={() => setAdding(true)} data-testid="add-account">
            Account
          </Button>
        }
      />

      <section className="card mb-8 grid grid-cols-2 gap-5 p-5 sm:grid-cols-3" aria-label="Totals">
        <div className="col-span-2 sm:col-span-1">
          <p className="mb-1 text-[13px] text-text-2">Net worth</p>
          <BigMoney amount={d.netWorth} size="lg" hidePaise />
        </div>
        <div>
          <p className="mb-1 text-[13px] text-text-2">Assets</p>
          <Money amount={d.assets} className="text-[22px] font-medium" />
        </div>
        <div>
          <p className="mb-1 text-[13px] text-text-2">Liabilities</p>
          <Money amount={d.liabilities} tone={d.liabilities > 0 ? 'negative' : 'muted'} className="text-[22px] font-medium" />
        </div>
      </section>

      {d.activeAccounts.some((a) => (a.kind === 'bank' || a.kind === 'cash') && (d.balances.get(a.id) ?? 0) <= 0) && (
        <p className="mb-8 rounded-[14px] bg-warning-soft px-4 py-3 text-[13.5px] text-text">
          Net worth only counts what you've told Kosh about. Open an account marked <span className="font-medium">Set your current balance</span> and enter what it holds today.
        </p>
      )}

      <CardsSection />

      {GROUPS.map((g) => {
        const list = d.activeAccounts.filter((a) => a.kind === g.kind);
        if (list.length === 0) return null;
        const total = list.reduce((s, a) => s + (d.balances.get(a.id) ?? 0), 0);
        return (
          <Section key={g.kind} title={g.title} action={<Money amount={g.kind === 'credit_card' ? -total : total} tone="muted" className="text-[13px]" />}>
            <ul className="card divide-y divide-[var(--line)] p-1.5">
              {list.map((a) => (
                <AccountRow key={a.id} account={a} />
              ))}
            </ul>
          </Section>
        );
      })}

      {archived.length > 0 && (
        <section className="mb-8">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            aria-expanded={showArchived}
            className="tap mb-2 flex items-center gap-1 px-1 text-[13px] font-medium uppercase tracking-[0.1em] text-text-3"
          >
            Archived ({archived.length})
            <ChevronDown size={15} className={`transition-transform ${showArchived ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          <AnimatePresence initial={false}>
            {showArchived && (
              <m.ul initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={springs.smooth} className="card divide-y divide-[var(--line)] p-1.5 opacity-80">
                {archived.map((a) => (
                  <AccountRow key={a.id} account={a} />
                ))}
              </m.ul>
            )}
          </AnimatePresence>
        </section>
      )}

      <AccountFormSheet open={adding || wantsNew} onClose={closeForm} />
    </Page>
  );
}

function AccountRow({ account: a }: { account: Account }) {
  const snap = useSnapshot();
  const d = useDerived();
  const bal = d.balances.get(a.id) ?? 0;
  const isCard = a.kind === 'credit_card';
  const due = useMemo(() => {
    if (!isCard) return null;
    const st = snap.statements.filter((s) => s.accountId === a.id).sort((x, y) => y.periodEnd.localeCompare(x.periodEnd))[0];
    return st ? statementStatus(st, paidSince(snap.entries, snap.transactions, a.id, st.periodEnd)) : null;
  }, [isCard, snap.statements, snap.entries, snap.transactions, a.id]);
  const goal = a.kind === 'goal' ? snap.goals.find((g) => g.accountId === a.id) : undefined;
  const needsBalance = !a.archivedAt && (a.kind === 'bank' || a.kind === 'cash') && bal <= 0;
  const subtitle = isCard
    ? due && !due.isPaid
      ? due.statement.dueOn < d.today
        ? `Overdue · was due ${formatRelativeDay(due.statement.dueOn, d.today)}`
        : `Statement due ${formatRelativeDay(due.statement.dueOn, d.today)}`
      : (a.institution ?? 'Credit card')
    : goal
      ? `For ${goal.name}`
      : (a.institution ?? (a.kind === 'cash' ? 'Cash' : 'Bank account'));

  return (
    <li>
      <Link to={needsBalance ? `/accounts/${a.id}?balance=1` : `/accounts/${a.id}`} className="flex min-h-[64px] items-center gap-3 rounded-[14px] px-2 py-2 hover:bg-surface-2" data-testid={`account-row-${a.name}`}>
        <IconTile name={accountIcon(a)} color={a.color} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{a.name}</span>
          {needsBalance ? (
            <span className="block truncate text-[12.5px] font-medium text-warning">Set your current balance</span>
          ) : (
            <span className={`block truncate text-[12.5px] ${due && !due.isPaid ? (due.statement.dueOn < d.today ? 'text-negative' : 'text-warning') : 'text-text-3'}`}>{subtitle}</span>
          )}
        </span>
        <span className="text-right">
          <Money amount={isCard ? -bal : bal} tone={isCard && bal < 0 ? 'negative' : bal < 0 ? 'negative' : 'neutral'} className="block text-[15px] font-medium" />
          {isCard && <span className="block text-[11.5px] text-text-3">owed</span>}
        </span>
        <ChevronRight size={18} className="text-text-3" aria-hidden="true" />
      </Link>
    </li>
  );
}
