import { AnimatePresence, m } from 'motion/react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, CalendarDays, ChevronLeft, CreditCard, Delete, Landmark, NotebookPen } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Segmented } from '@/components/ui/Segmented';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/bits';
import { IconTile } from '@/components/ui/CategoryIcon';
import { Money } from '@/components/ui/Money';
import { springs } from '@/motion/springs';
import { useDerived, useSnapshot, useStore } from '@/data/hooks';
import { useToast } from '@/components/ui/Toast';
import { addDays, formatDate, formatRelativeDay } from '@/lib/dates';
import { groupIndian, parseRupees, type Paise } from '@/lib/money';
import { idempotencyKey } from '@/lib/ids';
import { toKoshError } from '@/domain/errors';
import type { Account, Category, PaymentCard, TransactionInput, TransactionType, Uuid } from '@/domain/types';
import { NETWORK_LABEL } from '@/domain/cards/artwork';
import { defaultAccount, mostLikelyCategory, pressKey, rankCategories, rememberAccount, type AddMode } from './suggest';
import type { AddPreset } from './AddSheetContext';

type Panel = 'keypad' | 'category' | 'account' | 'to' | 'date' | 'details';

const toInput = (p: Paise) => {
  const whole = Math.trunc(p / 100);
  const frac = p % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`;
};

function modeOf(type: TransactionType): AddMode {
  if (type === 'income') return 'income';
  if (type === 'transfer' || type === 'card_payment') return 'transfer';
  return 'expense';
}

export default function AddSheet({ open, preset, onClose }: { open: boolean; preset: AddPreset; onClose: () => void }) {
  const store = useStore();
  const snap = useSnapshot();
  const d = useDerived();
  const toast = useToast();
  const navigate = useNavigate();
  const editing = preset.edit;
  const refundOf = preset.refundOf;
  const [key] = useState(() => idempotencyKey('tx'));

  const refundable = useMemo(() => {
    if (!refundOf) return 0;
    const done = snap.transactions.filter((t) => t.refundOf === refundOf.id && !t.deletedAt && t.id !== editing?.id).reduce((s, t) => s + t.amount, 0);
    return refundOf.amount - done;
  }, [refundOf, snap.transactions, editing]);

  const [mode, setMode] = useState<AddMode>(() => (editing ? modeOf(editing.type) : (preset.mode ?? 'expense')));
  const [amount, setAmount] = useState(() => (editing ? toInput(editing.amount) : refundOf ? toInput(refundable) : preset.amount ? toInput(preset.amount) : ''));
  const [categoryId, setCategoryId] = useState<Uuid | null>(() => {
    if (editing) return editing.categoryId;
    if (refundOf) return refundOf.categoryId;
    const kind = (preset.mode ?? 'expense') === 'income' ? 'income' : 'expense';
    return mostLikelyCategory(kind, snap.categories, snap.transactions, d.today)?.id ?? null;
  });
  const [accountId, setAccountId] = useState<Uuid | null>(
    () => editing?.accountId ?? refundOf?.accountId ?? preset.accountId ?? defaultAccount(preset.mode ?? 'expense', d.activeAccounts, snap.transactions)?.id ?? null,
  );
  const [paymentCardId, setPaymentCardId] = useState<Uuid | null>(() => editing?.paymentCardId ?? refundOf?.paymentCardId ?? preset.paymentCardId ?? null);
  const [toAccountId, setToAccountId] = useState<Uuid | null>(() => editing?.toAccountId ?? preset.toAccountId ?? null);
  const [date, setDate] = useState(() => editing?.occurredOn ?? d.today);
  const [merchant, setMerchant] = useState(() => editing?.merchant ?? refundOf?.merchant ?? '');
  const [note, setNote] = useState(() => editing?.note ?? '');
  const [panel, setPanel] = useState<Panel>('keypad');
  const [error, setError] = useState<string | null>(null);

  const paise = parseRupees(amount) ?? 0;
  const account = accountId ? d.accountById.get(accountId) : undefined;
  const toAccount = toAccountId ? d.accountById.get(toAccountId) : undefined;
  const category = categoryId ? d.categoryById.get(categoryId) : undefined;
  const card = paymentCardId ? d.cardById.get(paymentCardId) : undefined;
  const isCardPayment = mode === 'transfer' && toAccount?.kind === 'credit_card' && (account?.kind === 'cash' || account?.kind === 'bank');

  const changeMode = (next: AddMode) => {
    setMode(next);
    setError(null);
    setPanel('keypad');
    if (next !== 'transfer') {
      const kind = next === 'income' ? 'income' : 'expense';
      if (!category || category.kind !== kind) setCategoryId(mostLikelyCategory(kind, snap.categories, snap.transactions, d.today)?.id ?? null);
    }
    if (next === 'transfer' && account?.kind === 'credit_card') setAccountId(defaultAccount('transfer', d.activeAccounts, snap.transactions)?.id ?? null);
  };

  const type: TransactionType = refundOf ? 'refund' : mode === 'income' ? 'income' : mode === 'expense' ? 'expense' : isCardPayment ? 'card_payment' : 'transfer';
  const canSave = paise > 0 && !!accountId && (mode === 'transfer' ? !!toAccountId : !!categoryId);

  const save = useCallback(() => {
    if (!canSave || !accountId) return;
    const input: TransactionInput =
      mode === 'transfer'
        ? { type, amount: paise, occurredOn: date, accountId, toAccountId, note: note || null }
        : {
            type, amount: paise, occurredOn: date, accountId, categoryId, merchant: merchant || null, note: note || null,
            paymentCardId: paymentCardId && d.cardById.get(paymentCardId)?.accountId === accountId ? paymentCardId : null,
            refundOf: refundOf?.id ?? null,
          };
    let handle;
    try {
      handle = editing ? store.beginUpdate(editing.id, input) : store.beginPost(input, key);
    } catch (err) {
      setError(toKoshError(err).friendly);
      return;
    }
    rememberAccount(mode, accountId);
    onClose();
    const label = { expense: 'Expense', income: 'Income', refund: 'Refund', transfer: 'Transfer', card_payment: 'Card payment' }[type as string] ?? 'Transaction';
    const { done } = handle;
    toast({
      message: editing ? 'Changes saved' : `${label} added`,
      tone: 'success',
      action: editing
        ? undefined
        : {
            label: 'Undo',
            onClick: async () => {
              const saved = await done;
              await store.deleteTransaction(saved.id);
            },
          },
    });
    done.catch((err) => {
      const e = toKoshError(err);
      toast({
        tone: 'error',
        message: e.friendly,
        action:
          !editing && (e.code === 'NETWORK' || e.code === 'UNKNOWN')
            ? { label: 'Retry', onClick: () => void store.postTransaction(input, key).catch(() => toast({ tone: 'error', message: 'Still offline. Not saved.' })) }
            : undefined,
      });
    });
  }, [canSave, accountId, mode, type, paise, date, toAccountId, note, categoryId, merchant, paymentCardId, d.cardById, refundOf, editing, store, key, onClose, toast]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key) || e.key === '.') {
        if (panel !== 'keypad') setPanel('keypad');
        setAmount((a) => pressKey(a, e.key));
        e.preventDefault();
      } else if (e.key === 'Backspace') {
        setAmount((a) => pressKey(a, 'back'));
        e.preventDefault();
      } else if (e.key === 'Enter' && target.tagName !== 'BUTTON') {
        save();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, panel, save]);

  const hasAccounts = d.activeAccounts.some((a) => a.kind !== 'goal');
  const title = editing ? 'Edit transaction' : refundOf ? 'Add refund' : `Add ${mode}`;

  if (!hasAccounts && !editing) {
    return (
      <Sheet open={open} onClose={onClose} title="Add an account first" hideTitle width={460} testId="add-sheet">
        <EmptyState
          icon={<Landmark size={24} />}
          title="Add an account first"
          body="Every expense comes out of an account, such as a bank account or your cash in hand."
          action={
            <Button
              variant="primary"
              onClick={() => {
                onClose();
                void navigate('/accounts?new=1');
              }}
              data-testid="add-first-account"
            >
              Add an account
            </Button>
          }
        />
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title={title} hideTitle width={460} testId="add-sheet" initialFocus="[data-autofocus]">
      <div className="flex flex-col">
        {!refundOf && !(editing && editing.type === 'refund') ? (
          <div className="flex justify-center">
            <Segmented
              label="Transaction type"
              value={mode}
              onChange={changeMode}
              options={[
                { value: 'expense', label: 'Expense', testId: 'mode-expense' },
                { value: 'income', label: 'Income', testId: 'mode-income' },
                { value: 'transfer', label: 'Transfer', testId: 'mode-transfer' },
              ]}
            />
          </div>
        ) : (
          <p className="text-center text-[13px] text-text-2">
            Refund of <span className="font-medium text-text">{refundOf?.merchant ?? 'expense'}</span>
            {refundOf && (
              <>
                {' · up to '}
                <Money amount={refundable} />
              </>
            )}
          </p>
        )}

        <AmountDisplay value={amount} mode={mode} isRefund={!!refundOf} />

        <div className="scroll-clean -mx-5 mb-3 flex gap-2 overflow-x-auto px-5" role="group" aria-label="Details">
          {mode === 'transfer' ? (
            <>
              <Chip active={panel === 'account'} onClick={() => setPanel(panel === 'account' ? 'keypad' : 'account')} testId="chip-from" label="From">
                <span className="truncate">{account?.name ?? 'From account'}</span>
              </Chip>
              <ArrowRight size={16} className="shrink-0 self-center text-text-3" aria-hidden="true" />
              <Chip active={panel === 'to'} onClick={() => setPanel(panel === 'to' ? 'keypad' : 'to')} testId="chip-to" label="To">
                <span className="truncate">{toAccount?.name ?? 'To account'}</span>
              </Chip>
            </>
          ) : (
            <>
              <Chip active={panel === 'category'} onClick={() => setPanel(panel === 'category' ? 'keypad' : 'category')} testId="chip-category" label="Category">
                {category && <IconTile name={category.icon} color={category.color ?? parentColor(category, d.categoryById)} size={22} iconSize={13} />}
                <span className="truncate">{category?.name ?? 'Category'}</span>
              </Chip>
              <Chip active={panel === 'account'} onClick={() => setPanel(panel === 'account' ? 'keypad' : 'account')} testId="chip-account" label="Account">
                {card ? <CreditCard size={15} aria-hidden="true" /> : null}
                <span className="truncate">{card ? (card.displayName ?? card.issuer) : (account?.name ?? 'Account')}</span>
              </Chip>
            </>
          )}
          <Chip active={panel === 'date'} onClick={() => setPanel(panel === 'date' ? 'keypad' : 'date')} testId="chip-date" label="Date">
            <CalendarDays size={15} aria-hidden="true" />
            <span>{formatRelativeDay(date, d.today)}</span>
          </Chip>
          <Chip active={panel === 'details'} onClick={() => setPanel(panel === 'details' ? 'keypad' : 'details')} testId="chip-details" label="Note">
            <NotebookPen size={15} aria-hidden="true" />
            <span className="max-w-[120px] truncate">{merchant || note || (mode === 'transfer' ? 'Note' : 'Merchant & note')}</span>
          </Chip>
        </div>

        {isCardPayment && <p className="mb-2 text-center text-[12px] text-text-2">Recorded as a card payment — not an expense.</p>}
        {error && (
          <p role="alert" className="mb-2 rounded-[12px] bg-negative-soft px-3 py-2 text-center text-[13px] text-negative">
            {error}
          </p>
        )}

        <div className="relative h-[292px]">
          <AnimatePresence mode="popLayout" initial={false}>
            <m.div
              key={panel}
              className="absolute inset-0"
              initial={{ opacity: 0, x: panel === 'keypad' ? -16 : 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: panel === 'keypad' ? 16 : -16 }}
              transition={springs.snappy}
            >
              {panel === 'keypad' && <Keypad onKey={(k) => setAmount((a) => pressKey(a, k))} />}
              {panel === 'category' && (
                <CategoryPicker
                  kind={mode === 'income' ? 'income' : 'expense'}
                  selected={categoryId}
                  onPick={(id) => {
                    setCategoryId(id);
                    setPanel('keypad');
                  }}
                />
              )}
              {panel === 'account' && (
                <AccountPicker
                  mode={mode}
                  selected={accountId}
                  selectedCard={paymentCardId}
                  exclude={mode === 'transfer' ? toAccountId : null}
                  onPick={(id, cardId) => {
                    setAccountId(id);
                    setPaymentCardId(cardId);
                    setPanel('keypad');
                  }}
                />
              )}
              {panel === 'to' && (
                <AccountPicker
                  mode="transfer-to"
                  selected={toAccountId}
                  selectedCard={null}
                  exclude={accountId}
                  onPick={(id) => {
                    setToAccountId(id);
                    setPanel('keypad');
                  }}
                />
              )}
              {panel === 'date' && (
                <DatePicker
                  value={date}
                  today={d.today}
                  onPick={(v) => {
                    setDate(v);
                    setPanel('keypad');
                  }}
                />
              )}
              {panel === 'details' && (
                <Details mode={mode} merchant={merchant} note={note} setMerchant={setMerchant} setNote={setNote} onDone={() => setPanel('keypad')} />
              )}
            </m.div>
          </AnimatePresence>
        </div>

        <div className="pt-3">
          <Button variant="primary" size="lg" block disabled={!canSave} onClick={save} data-testid="save-transaction" data-autofocus>
            {editing ? 'Save changes' : `Save ${refundOf ? 'refund' : isCardPayment ? 'card payment' : mode}`}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function parentColor(c: Category, byId: Map<Uuid, Category>): string | null {
  return c.color ?? (c.parentId ? (byId.get(c.parentId)?.color ?? null) : null);
}

function AmountDisplay({ value, mode, isRefund }: { value: string; mode: AddMode; isRefund: boolean }) {
  const [whole = '', frac] = value.split('.');
  const grouped = whole === '' ? '0' : groupIndian(whole);
  const tone = isRefund || mode === 'income' ? 'text-positive' : 'text-text';
  return (
    <div className="flex h-[112px] flex-col items-center justify-center" aria-live="polite">
      <p className={`display-num flex items-baseline text-[56px] leading-none ${value ? tone : 'text-text-3'}`} data-testid="amount-display">
        <span className="mr-1 text-[30px] font-normal text-text-3">₹</span>
        <span>{grouped}</span>
        {frac !== undefined && <span className="text-text-2">.{frac}</span>}
        <span className="ml-0.5 inline-block h-[44px] w-[2px] translate-y-[4px] animate-pulse rounded-full bg-[var(--peri)] motion-reduce:animate-none" aria-hidden="true" />
      </p>
      <span className="sr-only">Amount {value || '0'} rupees</span>
    </div>
  );
}

function Chip({ children, active, onClick, testId, label }: { children: ReactNode; active: boolean; onClick: () => void; testId?: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      aria-label={undefined}
      title={label}
      data-testid={testId}
      className={`flex h-11 max-w-[200px] shrink-0 items-center gap-2 rounded-full border px-3.5 text-[14px] font-medium transition-colors ${
        active ? 'border-[var(--peri)] bg-peri-soft text-text' : 'border-line bg-surface-2 text-text hover:bg-surface-3'
      }`}
    >
      {children}
    </button>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const;

function Keypad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <div className="grid h-full grid-cols-3 gap-2" role="group" aria-label="Amount keypad">
      {KEYS.map((k) => (
        <m.button
          key={k}
          type="button"
          whileTap={{ scale: 0.94 }}
          transition={springs.snappy}
          onClick={() => onKey(k)}
          onContextMenu={(e) => {
            if (k === 'back') {
              e.preventDefault();
              onKey('clear');
            }
          }}
          aria-label={k === 'back' ? 'Delete digit' : k === '.' ? 'Decimal point' : k}
          data-testid={`key-${k}`}
          className="display-num flex items-center justify-center rounded-[18px] bg-surface-2 text-[26px] text-text active:bg-surface-3"
        >
          {k === 'back' ? <Delete size={24} strokeWidth={1.6} aria-hidden="true" /> : k}
        </m.button>
      ))}
    </div>
  );
}

function CategoryPicker({ kind, selected, onPick }: { kind: 'expense' | 'income'; selected: Uuid | null; onPick: (id: Uuid) => void }) {
  const snap = useSnapshot();
  const d = useDerived();
  const ranked = useMemo(() => rankCategories(kind, snap.categories, snap.transactions, d.today), [kind, snap.categories, snap.transactions, d.today]);
  const suggested = ranked.slice(0, 6);
  const parents = snap.categories.filter((c) => c.kind === kind && !c.parentId && !c.archivedAt);
  const item = (c: Category, compact = false) => (
    <button
      key={c.id}
      type="button"
      onClick={() => onPick(c.id)}
      aria-pressed={selected === c.id}
      data-testid={`category-${c.seedKey ?? c.id}`}
      className={`flex min-h-[44px] items-center gap-2 rounded-[14px] border px-2.5 text-left text-[13.5px] ${
        selected === c.id ? 'border-[var(--peri)] bg-peri-soft' : 'border-transparent bg-surface-2 hover:bg-surface-3'
      } ${compact ? '' : 'w-full'}`}
    >
      <IconTile name={c.icon} color={parentColor(c, d.categoryById)} size={28} iconSize={15} />
      <span className="truncate">{c.name}</span>
    </button>
  );
  return (
    <div className="h-full overflow-y-auto overscroll-contain pr-1" role="listbox" aria-label="Categories">
      <p className="eyebrow mb-2 mt-1">Suggested</p>
      <div className="mb-4 grid grid-cols-2 gap-2">{suggested.map((c) => item(c))}</div>
      {parents.map((p) => (
        <div key={p.id} className="mb-3">
          <p className="eyebrow mb-2">{p.name}</p>
          <div className="flex flex-wrap gap-2">
            {item(p, true)}
            {snap.categories.filter((c) => c.parentId === p.id && !c.archivedAt).map((c) => item(c, true))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AccountPicker({
  mode,
  selected,
  selectedCard,
  exclude,
  onPick,
}: {
  mode: AddMode | 'transfer-to';
  selected: Uuid | null;
  selectedCard: Uuid | null;
  exclude: Uuid | null;
  onPick: (accountId: Uuid, cardId: Uuid | null) => void;
}) {
  const snap = useSnapshot();
  const d = useDerived();
  const accounts = d.activeAccounts.filter((a) => a.kind !== 'goal' && a.id !== exclude && !(mode === 'transfer' && a.kind === 'credit_card'));
  const cardsFor = (a: Account): PaymentCard[] => (mode === 'expense' ? snap.cards.filter((c) => c.accountId === a.id && !c.archivedAt) : []);
  const row = (a: Account, card: PaymentCard | null) => {
    const active = selected === a.id && (card ? selectedCard === card.id : !selectedCard);
    const bal = d.balances.get(a.id) ?? 0;
    return (
      <button
        key={card ? card.id : a.id}
        type="button"
        onClick={() => onPick(a.id, card?.id ?? null)}
        aria-pressed={active}
        data-testid={card ? `card-option-${card.id}` : `account-option-${a.name}`}
        className={`flex min-h-[52px] w-full items-center gap-3 rounded-[14px] px-3 text-left ${active ? 'bg-peri-soft' : 'hover:bg-surface-2'} ${card ? 'pl-12' : ''}`}
      >
        {!card && <IconTile name={a.kind === 'cash' ? 'wallet' : a.kind === 'credit_card' ? 'credit-card' : 'landmark'} color={a.color} size={32} iconSize={16} />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium">{card ? `${card.displayName ?? card.issuer}` : a.name}</span>
          <span className="block text-[12px] text-text-3">
            {card ? `${NETWORK_LABEL[card.network]} ${card.cardType}${card.last4 ? ` ·· ${card.last4}` : ''}` : a.kind === 'credit_card' ? 'Credit card' : a.kind === 'cash' ? 'Cash' : 'Bank account'}
          </span>
        </span>
        {!card && <Money amount={a.kind === 'credit_card' ? -bal : bal} tone="muted" className="text-[13px]" />}
      </button>
    );
  };
  return (
    <div className="h-full overflow-y-auto overscroll-contain" role="listbox" aria-label={mode === 'transfer-to' ? 'To account' : 'Account'}>
      {accounts.map((a) => (
        <div key={a.id}>
          {row(a, null)}
          {cardsFor(a).map((c) => row(a, c))}
        </div>
      ))}
    </div>
  );
}

function DatePicker({ value, today, onPick }: { value: string; today: string; onPick: (v: string) => void }) {
  const quick = [today, addDays(today, -1), addDays(today, -2)];
  return (
    <div className="flex h-full flex-col gap-2">
      {quick.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onPick(q)}
          aria-pressed={value === q}
          className={`flex min-h-[52px] items-center justify-between rounded-[14px] px-4 text-[15px] ${value === q ? 'bg-peri-soft' : 'bg-surface-2 hover:bg-surface-3'}`}
        >
          <span className="font-medium">{formatRelativeDay(q, today)}</span>
          <span className="text-text-3">{formatDate(q, 'EEE, d MMM')}</span>
        </button>
      ))}
      <label className="mt-2 block">
        <span className="mb-1.5 block text-[13px] font-medium text-text-2">Another date</span>
        <input
          type="date"
          value={value}
          max={addDays(today, 365)}
          min="2000-01-01"
          onChange={(e) => e.target.value && onPick(e.target.value)}
          className="h-12 w-full rounded-[14px] border border-line bg-surface-2 px-3.5 text-[15px]"
        />
      </label>
    </div>
  );
}

function Details({
  mode,
  merchant,
  note,
  setMerchant,
  setNote,
  onDone,
}: {
  mode: AddMode;
  merchant: string;
  note: string;
  setMerchant: (v: string) => void;
  setNote: (v: string) => void;
  onDone: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      {mode !== 'transfer' && (
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-text-2">{mode === 'income' ? 'From' : 'Merchant'}</span>
          <input
            value={merchant}
            maxLength={80}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder={mode === 'income' ? 'e.g. Employer' : 'e.g. FreshBasket'}
            className="h-12 w-full rounded-[14px] border border-line bg-surface-2 px-3.5 text-[15px] placeholder:text-text-3"
            data-testid="merchant-input"
            autoComplete="off"
          />
        </label>
      )}
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-text-2">Note</span>
        <textarea
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Optional"
          className="w-full resize-none rounded-[14px] border border-line bg-surface-2 px-3.5 py-3 text-[15px] placeholder:text-text-3"
        />
      </label>
      <Button variant="secondary" onClick={onDone} icon={<ChevronLeft size={16} />}>
        Back to keypad
      </Button>
    </div>
  );
}
