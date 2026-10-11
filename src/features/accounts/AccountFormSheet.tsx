import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { TextField } from '@/components/ui/bits';
import { AmountField } from '@/components/ui/AmountField';
import { useToast } from '@/components/ui/Toast';
import { useDerived, useStore } from '@/data/hooks';
import { parseRupees } from '@/lib/money';
import { idempotencyKey } from '@/lib/ids';
import { toKoshError } from '@/domain/errors';
import type { Account } from '@/domain/types';

const amount = z.string().refine((v) => v.trim() === '' || parseRupees(v) !== null, 'Enter an amount like 12,500.50');

const schema = z
  .object({
    kind: z.enum(['bank', 'cash', 'credit_card']),
    name: z.string().trim().min(1, 'Name your account').max(60),
    institution: z.string().trim().max(60),
    opening: amount,
    openingOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    statementDay: z.string(),
    creditLimit: amount,
  })
  .refine((v) => v.kind !== 'credit_card' || v.statementDay === '' || (Number(v.statementDay) >= 1 && Number(v.statementDay) <= 31), {
    path: ['statementDay'],
    message: 'Day 1–31',
  });

type Values = z.infer<typeof schema>;

export function AccountFormSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (a: Account) => void }) {
  const store = useStore();
  const d = useDerived();
  const toast = useToast();
  const [key] = useState(() => idempotencyKey('acct'));
  const { register, handleSubmit, control, watch, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { kind: 'bank', name: '', institution: '', opening: '', openingOn: d.today, statementDay: '', creditLimit: '' },
  });
  const kind = watch('kind');

  const submit = handleSubmit(async (v) => {
    const opening = parseRupees(v.opening) ?? 0;
    try {
      const account = await store.run(
        (repo) =>
          repo.createAccount(
            {
              name: v.name,
              kind: v.kind,
              institution: v.institution || null,
              openingBalance: v.kind === 'credit_card' ? -opening : opening,
              openingOn: v.openingOn,
              statementDay: v.kind === 'credit_card' && v.statementDay ? Number(v.statementDay) : undefined,
              creditLimit: v.kind === 'credit_card' ? parseRupees(v.creditLimit) : null,
            },
            key,
          ),
        'accounts',
        'transactions',
        'entries',
        'ccSettings',
      );
      toast({ tone: 'success', message: `${account.name} added` });
      onCreated?.(account);
      onClose();
    } catch (err) {
      toast({ tone: 'error', message: toKoshError(err).friendly });
    }
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New account"
      footer={
        <Button variant="primary" size="lg" block onClick={submit} loading={formState.isSubmitting} data-testid="create-account">
          Add account
        </Button>
      }
    >
      <form onSubmit={submit} className="space-y-4 pb-2" noValidate>
        <Controller
          control={control}
          name="kind"
          render={({ field }) => (
            <Segmented
              label="Account type"
              value={field.value}
              onChange={field.onChange}
              className="w-full"
              options={[
                { value: 'bank', label: 'Bank' },
                { value: 'cash', label: 'Cash' },
                { value: 'credit_card', label: 'Credit card' },
              ]}
            />
          )}
        />
        <TextField label="Name" placeholder={kind === 'cash' ? 'Wallet' : kind === 'bank' ? 'HDFC Salary' : 'Rewards Card'} {...register('name')} error={formState.errors.name?.message} />
        {kind !== 'cash' && <TextField label="Bank or issuer (optional)" {...register('institution')} />}
        <div className="grid grid-cols-2 gap-3">
          <AmountField
            label={kind === 'credit_card' ? 'Outstanding now' : 'Current balance'}
            placeholder="0"
            {...register('opening')}
            error={formState.errors.opening?.message}
            hint={kind === 'credit_card' ? 'What you owe today' : undefined}
          />
          <TextField label="As of" type="date" {...register('openingOn')} />
        </div>
        {kind === 'credit_card' && (
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Statement day" inputMode="numeric" placeholder="e.g. 12" {...register('statementDay')} error={formState.errors.statementDay?.message} hint="Day the bill is generated" />
            <AmountField label="Credit limit" placeholder="Optional" {...register('creditLimit')} error={formState.errors.creditLimit?.message} />
          </div>
        )}
        <p className="text-[12px] text-text-3">Card numbers are never needed or stored. Add the card itself later from Cards.</p>
      </form>
    </Sheet>
  );
}
