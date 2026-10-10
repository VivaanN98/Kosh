import { useMemo, useState } from 'react';
import { SelectField, TextField } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Segmented } from '@/components/ui/Segmented';
import { AmountField } from '@/components/ui/AmountField';
import { useToast } from '@/components/ui/Toast';
import { useDerived, useSnapshot, useStore } from '@/data/hooks';
import { describeSchedule, nextOccurrence } from '@/domain/recurring';
import { addDays, formatDate, parseIso } from '@/lib/dates';
import { parseRupees, toDecimalString } from '@/lib/money';
import { toKoshError } from '@/domain/errors';
import type { Frequency, RecurringMode, RecurringRule, RecurringType } from '@/domain/types';

/**
 * Create/edit a recurring rule, or (asSubscription) a subscription, which owns exactly one rule.
 * Charges only ever come from the rule, so a subscription can never double-charge.
 */
export function RuleFormSheet({ rule, asSubscription: editingSub = false, onClose }: { rule?: RecurringRule; asSubscription?: boolean; onClose: () => void }) {
  const [asSubscription, setAsSubscription] = useState(editingSub);
  const store = useStore();
  const snap = useSnapshot();
  const d = useDerived();
  const toast = useToast();
  const [name, setName] = useState(rule?.name ?? '');
  const [type, setType] = useState<RecurringType>(rule?.type ?? 'expense');
  const [amount, setAmount] = useState(rule ? toDecimalString(rule.amount).replace(/\.00$/, '') : '');
  const usable = d.activeAccounts.filter((a) => a.kind !== 'goal');
  const [accountId, setAccountId] = useState(rule?.accountId ?? usable.find((a) => a.kind === (asSubscription ? 'credit_card' : 'bank'))?.id ?? usable[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(rule?.toAccountId ?? '');
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? '');
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? 'monthly');
  const [interval, setInterval] = useState(String(rule?.interval ?? 1));
  const [startOn, setStartOn] = useState(rule?.startOn ?? d.today);
  const [endOn, setEndOn] = useState(rule?.endOn ?? '');
  const [mode, setMode] = useState<RecurringMode>(rule?.mode ?? (asSubscription ? 'automatic' : 'reminder'));
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);

  const paise = parseRupees(amount);
  const to = d.accountById.get(toAccountId);
  const from = d.accountById.get(accountId);
  const effectiveType: RecurringType = type === 'transfer' && to?.kind === 'credit_card' && (from?.kind === 'bank' || from?.kind === 'cash') ? 'card_payment' : type;
  const needsCategory = effectiveType === 'expense' || effectiveType === 'income';
  const anchorDay = frequency === 'monthly' || frequency === 'yearly' ? parseIso(startOn).d : null;
  const preview = useMemo(() => {
    try {
      const r = { frequency, interval: Math.max(1, Number(interval) || 1), startOn, endOn: endOn || null, anchorDay };
      const first = nextOccurrence(r, addDays(startOn, -1));
      return { text: describeSchedule(r), first };
    } catch {
      return null;
    }
  }, [frequency, interval, startOn, endOn, anchorDay]);
  const valid =
    name.trim() && paise && paise > 0 && accountId && (needsCategory ? categoryId : toAccountId && toAccountId !== accountId) && Number(interval) >= 1 && (!endOn || endOn >= startOn);

  const save = async () => {
    if (!valid || !paise) return;
    setBusy(true);
    try {
      const base = {
        name: name.trim(), amount: paise, accountId, frequency, interval: Number(interval), startOn, endOn: endOn || null, anchorDay, mode,
      };
      if (asSubscription && !rule) {
        await store.run((repo) => repo.createSubscription({ ...base, categoryId, website: website || null }), 'subscriptions', 'rules');
      } else if (rule) {
        await store.run(
          (repo) => repo.updateRecurringRule(rule.id, { ...base, type: effectiveType, toAccountId: needsCategory ? null : toAccountId, categoryId: needsCategory ? categoryId : null }),
          'rules',
        );
      } else {
        await store.run(
          (repo) => repo.createRecurringRule({ ...base, type: effectiveType, toAccountId: needsCategory ? null : toAccountId, categoryId: needsCategory ? categoryId : null }),
          'rules',
        );
      }
      await store.runScheduledJobs();
      onClose();
    } catch (err) {
      toast({ tone: 'error', message: toKoshError(err).friendly });
    } finally {
      setBusy(false);
    }
  };

  const catKind = effectiveType === 'income' ? 'income' : 'expense';
  return (
    <Sheet
      open
      onClose={onClose}
      title={rule ? 'Edit schedule' : asSubscription ? 'New subscription' : 'New recurring'}
      footer={
        <Button variant="primary" size="lg" block disabled={!valid} loading={busy} onClick={save} data-testid="save-rule">
          Save
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        {!editingSub && (
          <Segmented
            label="Type"
            value={asSubscription ? 'subscription' : type === 'card_payment' ? 'transfer' : type}
            onChange={(v) => {
              const sub = v === 'subscription';
              setAsSubscription(sub);
              if (sub) {
                setType('expense');
                if (!rule) setMode('automatic');
              } else {
                setType(v);
                if (!rule) setMode('reminder');
              }
            }}
            className="w-full"
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
              { value: 'transfer', label: 'Transfer' },
              ...(rule ? [] : [{ value: 'subscription' as const, label: 'Subscription' }]),
            ]}
          />
        )}
        <TextField label="Name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={asSubscription ? 'StreamBox Premium' : 'Rent'} data-testid="rule-name" />
        <AmountField label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="rule-amount" />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label={needsCategory ? (effectiveType === 'income' ? 'Into' : 'Paid from') : 'From'} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {usable.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
          {needsCategory ? (
            <SelectField label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} data-testid="rule-category">
              <option value="">Choose…</option>
              {snap.categories
                .filter((c) => c.kind === catKind && !c.archivedAt)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parentId ? `  ${c.name}` : c.name}
                  </option>
                ))}
            </SelectField>
          ) : (
            <SelectField label="To" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              <option value="">Choose…</option>
              {usable
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </SelectField>
          )}
        </div>
        <div className="grid grid-cols-[1fr_96px] gap-3">
          <SelectField label="Repeats" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </SelectField>
          <TextField label="Every" inputMode="numeric" value={interval} onChange={(e) => setInterval(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Starts" type="date" value={startOn} onChange={(e) => setStartOn(e.target.value)} />
          <TextField label="Ends (optional)" type="date" value={endOn} min={startOn} onChange={(e) => setEndOn(e.target.value)} />
        </div>
        {preview && (
          <p className="rounded-[12px] bg-surface-2 px-3 py-2 text-[13px] text-text-2">
            {preview.text}
            {preview.first ? ` · first ${formatDate(preview.first, 'd MMM yyyy')}` : ''}
            {anchorDay && anchorDay >= 29 ? ' · shorter months use their last day' : ''}
          </p>
        )}
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-text-2">When it&rsquo;s due</span>
          <Segmented
            label="Mode"
            value={mode}
            onChange={setMode}
            className="w-full"
            options={[
              { value: 'reminder', label: 'Remind me' },
              { value: 'automatic', label: 'Record automatically' },
            ]}
          />
          <p className="mt-2 text-[12px] text-text-3">
            {mode === 'reminder' ? 'Nothing is recorded until you confirm it.' : 'Recorded once on each due date. It can never be posted twice.'}
          </p>
        </div>
        {asSubscription && !rule && <TextField label="Website (optional)" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="streambox.example" />}
      </div>
    </Sheet>
  );
}
