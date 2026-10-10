import { useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Archive, ArchiveRestore, ArrowLeft, ArrowLeftRight, CreditCard, Pencil, Plus, Scale, Settings2 } from 'lucide-react';
import { EmptyState, Page, Progress, Section, TextField } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { BigMoney, Money } from '@/components/ui/Money';
import { IconTile } from '@/components/ui/CategoryIcon';
import { Sheet } from '@/components/ui/Sheet';
import { AmountField } from '@/components/ui/AmountField';
import { useToast } from '@/components/ui/Toast';
import { useDerived, useSnapshot, useStore } from '@/data/hooks';
import { useAddSheet } from '@/features/add/AddSheetContext';
import { TransactionRow } from '@/features/activity/TransactionRow';
import { LazyTransactionDetailSheet as TransactionDetailSheet } from '@/features/activity/LazyTransactionDetailSheet';
import { formatDate, formatRelativeDay } from '@/lib/dates';
import { formatINR, parseRupees, ratioBps, toDecimalString } from '@/lib/money';
import { nextStatementDate, statementStatus } from '@/domain/statements';
import { toKoshError } from '@/domain/errors';
import { NETWORK_LABEL } from '@/domain/cards/artwork';
import type { Account, Transaction } from '@/domain/types';
import { ReconcileSheet } from './ReconcileSheet';
import { accountIcon } from './accountIcon';
import { paidSince } from './cardMath';

export default function AccountDetailPage() {
  const { id } = useParams();
  const snap = useSnapshot();
  const account = snap.accounts.find((a) => a.id === id);
  if (!account) {
    return (
      <Page>
        <EmptyState icon={<CreditCard size={24} />} title="Account not found" action={<Link to="/accounts" className="font-medium text-peri">Back to accounts</Link>} />
      </Page>
    );
  }
  return <AccountDetail key={account.id} account={account} />;
}

function AccountDetail({ account: a }: { account: Account }) {
  const snap = useSnapshot();
  const d = useDerived();
  const store = useStore();
  const toast = useToast();
  const add = useAddSheet();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [params, setParams] = useSearchParams();
  const [reconciling, setReconciling] = useState(params.get('balance') === '1');
  const [editing, setEditing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isCard = a.kind === 'credit_card';
  const bal = d.balances.get(a.id) ?? 0;

  // History with the running balance after each transaction (from this account's ledger entries).
  const history = useMemo(() => {
    const txById = new Map(snap.transactions.map((t) => [t.id, t]));
    const mine = snap.entries
      .filter((e) => e.accountId === a.id)
      .map((e) => ({ e, t: txById.get(e.transactionId) }))
      .filter((x): x is { e: typeof x.e; t: Transaction } => !!x.t)
      .sort((x, y) => x.e.occurredOn.localeCompare(y.e.occurredOn) || x.t.createdAt.localeCompare(y.t.createdAt));
    const rows: { t: Transaction; after: number }[] = [];
    for (const { e, t } of mine) rows.push({ t, after: (rows[rows.length - 1]?.after ?? 0) + e.amount });
    return rows.reverse();
  }, [snap.entries, snap.transactions, a.id]);

  const settings = snap.ccSettings.find((s) => s.accountId === a.id);
  const statements = snap.statements.filter((s) => s.accountId === a.id).sort((x, y) => y.periodEnd.localeCompare(x.periodEnd));
  const latest = statements[0];
  const status = latest ? statementStatus(latest, paidSince(snap.entries, snap.transactions, a.id, latest.periodEnd)) : null;
  const linkedCards = snap.cards.filter((c) => c.accountId === a.id && !c.archivedAt);
  const debt = -bal;

  const toggleArchive = async () => {
    const archiving = !a.archivedAt;
    try {
      await store.run((repo) => repo.setAccountArchived(a.id, archiving), 'accounts');
      toast({
        message: archiving ? `${a.name} archived` : `${a.name} restored`,
        action: { label: 'Undo', onClick: () => store.run((repo) => repo.setAccountArchived(a.id, !archiving), 'accounts') },
      });
      if (archiving) navigate('/accounts');
    } catch (err) {
      toast({ tone: 'error', message: toKoshError(err).friendly });
    }
  };

  return (
    <Page>
      <Link to="/accounts" className="tap -ml-2 mb-2 inline-flex items-center gap-1 rounded-[12px] px-2 text-[14px] text-text-2 hover:text-text">
        <ArrowLeft size={16} aria-hidden="true" /> Accounts
      </Link>
      <header className="mb-6 flex items-center gap-4">
        <IconTile name={accountIcon(a)} color={a.color} size={52} iconSize={24} />
        <div className="min-w-0">
          <h1 className="serif truncate text-[28px] leading-tight">{a.name}</h1>
          <p className="text-[13px] text-text-3">
            {[a.institution, { bank: 'Bank account', cash: 'Cash', credit_card: 'Credit card', goal: 'Goal pot' }[a.kind as 'bank'], a.archivedAt ? 'Archived' : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </header>

      <section className="card mb-6 p-5" aria-label="Balance">
        <p className="mb-1 text-[13px] text-text-2">{isCard ? 'Current debt' : 'Balance'}</p>
        <BigMoney amount={isCard ? debt : bal} size="xl" className={!isCard && bal < 0 ? 'text-negative' : ''} />
        {isCard && settings?.creditLimit && (
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-[12.5px] text-text-2">
              <span>Credit used</span>
              <span className="num">
                {formatINR(Math.max(0, debt), { decimals: 'never' })} of {formatINR(settings.creditLimit, { decimals: 'never' })}
              </span>
            </div>
            <Progress value={ratioBps(Math.max(0, debt), settings.creditLimit) / 10000} tone={debt > settings.creditLimit * 0.8 ? 'warning' : 'peri'} label="Credit limit used" />
          </div>
        )}
        {a.reconciledAt && <p className="mt-3 text-[12px] text-text-3">Last reconciled {formatDate(a.reconciledAt.slice(0, 10))}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          {!a.archivedAt && a.kind !== 'goal' && (
            <Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => add.open({ mode: 'expense', accountId: a.id })}>
              Add
            </Button>
          )}
          {!a.archivedAt && isCard && (
            <Button size="sm" variant="accent" icon={<CreditCard size={15} />} onClick={() => add.open({ mode: 'transfer', toAccountId: a.id, amount: status && !status.isPaid ? status.remaining : undefined })} data-testid="pay-card">
              Pay card
            </Button>
          )}
          {!a.archivedAt && !isCard && a.kind !== 'goal' && (
            <Button size="sm" icon={<ArrowLeftRight size={15} />} onClick={() => add.open({ mode: 'transfer', accountId: a.id })}>
              Transfer
            </Button>
          )}
          <Button size="sm" icon={<Scale size={15} />} onClick={() => setReconciling(true)} data-testid="reconcile">
            {isCard ? 'Reconcile' : 'Set balance'}
          </Button>
          <Button size="sm" variant="ghost" icon={<Pencil size={15} />} onClick={() => setEditing(true)}>
            Rename
          </Button>
          <Button size="sm" variant="ghost" icon={a.archivedAt ? <ArchiveRestore size={15} /> : <Archive size={15} />} onClick={toggleArchive}>
            {a.archivedAt ? 'Unarchive' : 'Archive'}
          </Button>
        </div>
        {!a.archivedAt && bal !== 0 && <p className="mt-3 text-[12px] text-text-3">Archived accounts keep their balance in net worth until it is moved out.</p>}
      </section>

      {isCard && (
        <Section
          title="Statement"
          action={
            <Button size="sm" variant="ghost" icon={<Settings2 size={15} />} onClick={() => setSettingsOpen(true)}>
              {settings ? 'Cycle' : 'Set up cycle'}
            </Button>
          }
        >
          {!settings ? (
            <div className="card p-5 text-[14px] text-text-2">Set the statement day to track bills separately from what you owe right now.</div>
          ) : status ? (
            <div className="card p-5" data-testid="statement-card">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Figure label="Statement balance" value={<Money amount={status.statement.statementBalance} className="text-[18px] font-medium" />} />
                <Figure label="Minimum due" value={<Money amount={status.statement.minimumDue} className="text-[18px] font-medium" />} />
                <Figure label="Paid since" value={<Money amount={status.paidSince} tone="positive" className="text-[18px] font-medium" />} />
                <Figure label="Still due" value={<Money amount={status.remaining} tone={status.remaining > 0 ? 'negative' : 'muted'} className="text-[18px] font-medium" />} />
              </div>
              <p className="mt-4 text-[13px] text-text-2">
                {formatDate(status.statement.periodStart, 'd MMM')} – {formatDate(status.statement.periodEnd, 'd MMM')} · {status.isPaid ? 'Paid in full' : status.statement.dueOn < d.today ? `Overdue since ${formatDate(status.statement.dueOn, 'd MMM')}` : `Due ${formatRelativeDay(status.statement.dueOn, d.today)} (${formatDate(status.statement.dueOn, 'd MMM')})`}
                {' · '}Next statement {formatDate(nextStatementDate(d.today, settings.statementDay), 'd MMM')}
              </p>
              <p className="mt-1 text-[12px] text-text-3">Current debt includes purchases after the statement date, so it can differ from the statement balance.</p>
              {statements.length > 1 && (
                <details className="mt-4">
                  <summary className="tap flex cursor-pointer items-center text-[13px] font-medium text-text-2">Past statements</summary>
                  <ul className="mt-2 divide-y divide-[var(--line)] text-[13px]">
                    {statements.slice(1, 13).map((s) => (
                      <li key={s.id} className="flex justify-between py-2">
                        <span>
                          {formatDate(s.periodStart, 'd MMM')} – {formatDate(s.periodEnd, 'd MMM yyyy')}
                        </span>
                        <Money amount={s.statementBalance} />
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ) : (
            <div className="card p-5 text-[14px] text-text-2">First statement closes on {formatDate(nextStatementDate(d.today, settings.statementDay), 'd MMMM')}.</div>
          )}
        </Section>
      )}

      {linkedCards.length > 0 && (
        <Section title="Cards on this account">
          <ul className="card divide-y divide-[var(--line)] p-1.5">
            {linkedCards.map((c) => (
              <li key={c.id} className="flex min-h-[52px] items-center gap-3 px-2">
                <CreditCard size={18} className="text-text-2" aria-hidden="true" />
                <span className="flex-1 text-[14px]">{c.displayName ?? c.issuer}</span>
                <span className="text-[12.5px] text-text-3">
                  {NETWORK_LABEL[c.network]} {c.cardType}
                  {c.last4 ? ` ·· ${c.last4}` : ''}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 px-1 text-[12px] text-text-3">Cards are payment instruments. They share this account&rsquo;s balance — nothing is counted twice.</p>
        </Section>
      )}

      <Section title="History">
        {history.length === 0 ? (
          <div className="card p-6 text-center text-[14px] text-text-3">No transactions yet.</div>
        ) : (
          <ul className="card p-1.5" data-testid="account-history">
            <AnimatePresence initial={false}>
            {history.slice(0, 200).map(({ t, after }) => (
              <div key={t.id} className="relative">
                <TransactionRow t={t} d={d} onOpen={setSelected} showDate contextAccountId={a.id} />
                <span className="num pointer-events-none absolute bottom-2 right-2 text-[11px] text-text-3">
                  bal {formatINR(isCard ? -after : after, { decimals: 'never' })}
                </span>
              </div>
            ))}
            </AnimatePresence>
          </ul>
        )}
      </Section>

      <TransactionDetailSheet tx={selected} onClose={() => setSelected(null)} />
      <ReconcileSheet
        account={a}
        open={reconciling}
        onClose={() => {
          setReconciling(false);
          if (params.has('balance')) setParams({}, { replace: true });
        }}
      />
      <RenameSheet account={a} open={editing} onClose={() => setEditing(false)} />
      {isCard && <CardSettingsSheet account={a} open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
    </Page>
  );
}

function Figure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[12px] text-text-3">{label}</p>
      {value}
    </div>
  );
}

function RenameSheet({ account, open, onClose }: { account: Account; open: boolean; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [name, setName] = useState(account.name);
  const [institution, setInstitution] = useState(account.institution ?? '');
  const save = async () => {
    try {
      await store.run((repo) => repo.updateAccount(account.id, { name, institution: institution || null }), 'accounts');
      onClose();
    } catch (err) {
      toast({ tone: 'error', message: toKoshError(err).friendly });
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Edit account" footer={<Button variant="primary" size="lg" block onClick={save} disabled={!name.trim()}>Save</Button>}>
      <div className="space-y-4 pb-2">
        <TextField label="Name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <TextField label="Bank or issuer" value={institution} maxLength={60} onChange={(e) => setInstitution(e.target.value)} />
      </div>
    </Sheet>
  );
}

function CardSettingsSheet({ account, open, onClose }: { account: Account; open: boolean; onClose: () => void }) {
  const store = useStore();
  const snap = useSnapshot();
  const toast = useToast();
  const s = snap.ccSettings.find((x) => x.accountId === account.id);
  const [day, setDay] = useState(String(s?.statementDay ?? ''));
  const [dueDays, setDueDays] = useState(String(s?.dueDays ?? 20));
  const [limit, setLimit] = useState(s?.creditLimit ? toDecimalString(s.creditLimit) : '');
  const valid = Number(day) >= 1 && Number(day) <= 31 && Number(dueDays) >= 1 && Number(dueDays) <= 60 && (limit === '' || parseRupees(limit) !== null);
  const save = async () => {
    try {
      await store.run(
        (repo) => repo.upsertCreditCardSettings({ accountId: account.id, statementDay: Number(day), dueDays: Number(dueDays), creditLimit: limit ? parseRupees(limit) : null }),
        'ccSettings',
      );
      void store.runScheduledJobs();
      onClose();
    } catch (err) {
      toast({ tone: 'error', message: toKoshError(err).friendly });
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Billing cycle" footer={<Button variant="primary" size="lg" block onClick={save} disabled={!valid}>Save</Button>}>
      <div className="grid grid-cols-2 gap-3 pb-2">
        <TextField label="Statement day" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} hint="1–31 (31 = month end)" />
        <TextField label="Days to pay" inputMode="numeric" value={dueDays} onChange={(e) => setDueDays(e.target.value)} hint="After the statement" />
        <AmountField label="Credit limit" value={limit} onChange={(e) => setLimit(e.target.value)} className="col-span-2" placeholder="Optional" />
      </div>
    </Sheet>
  );
}
