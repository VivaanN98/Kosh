import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { m } from 'motion/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { signalPainted, TextField } from '@/components/ui/bits';
import { springs } from '@/motion/springs';

const schema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
});
type Values = z.infer<typeof schema>;

export default function AuthScreen({ client, onDemo }: { client: SupabaseClient; onDemo: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  useEffect(() => signalPainted(), []);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(schema) });

  const submit = handleSubmit(async ({ email, password }) => {
    setMessage(null);
    const res =
      mode === 'signin' ? await client.auth.signInWithPassword({ email, password }) : await client.auth.signUp({ email, password });
    if (res.error) {
      setMessage({ tone: 'error', text: res.error.message });
      return;
    }
    if (mode === 'signup' && !res.data.session) setMessage({ tone: 'info', text: 'Check your email to confirm your account, then sign in.' });
  });

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5 py-10">
      <div className="aurora pointer-events-none absolute inset-x-0 top-0 h-[60vh]" aria-hidden="true" />
      <m.main
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.smooth}
        className="relative w-full max-w-[400px]"
      >
        <div className="mb-10">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-[15px] bg-text text-text-inverse">
            <span className="serif text-[28px] italic leading-none">k</span>
          </div>
          <h1 className="serif text-[44px] leading-[1.02]">
            Money, <span className="italic text-text-2">in focus.</span>
          </h1>
          <p className="mt-3 text-[15px] text-text-2">A calm, exact ledger for everything you earn, spend and save.</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-5" noValidate>
          <Segmented
            label="Sign in or create account"
            value={mode}
            onChange={setMode}
            className="w-full"
            options={[
              { value: 'signin', label: 'Sign in' },
              { value: 'signup', label: 'Create account' },
            ]}
          />
          <TextField label="Email" type="email" autoComplete="email" inputMode="email" {...register('email')} error={formState.errors.email?.message} />
          <TextField
            label="Password"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            {...register('password')}
            error={formState.errors.password?.message}
          />
          {message && (
            <p role="alert" className={`rounded-[12px] px-3 py-2 text-[13px] ${message.tone === 'error' ? 'bg-negative-soft text-negative' : 'bg-peri-soft text-text'}`}>
              {message.text}
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" block loading={formState.isSubmitting}>
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button type="button" onClick={onDemo} className="tap rounded-[12px] px-3 text-[14px] font-medium text-text-2 underline-offset-4 hover:text-text hover:underline">
            Explore Demo Mode instead
          </button>
          <p className="mt-1 text-[12px] text-text-3">Fictional data, stored only on this device.</p>
        </div>
      </m.main>
    </div>
  );
}
