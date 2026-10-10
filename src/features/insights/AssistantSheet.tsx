/**
 * "Ask Kosh" — the read-only assistant. Talks to the `assistant` Edge Function, which holds the
 * API key server-side and can only run read-only SQL queries for the signed-in user. Nothing on
 * this screen can change data. Card details are never sent.
 */
import { AnimatePresence, m } from 'motion/react';
import { useRef, useState } from 'react';
import { ArrowUp, KeyRound, Sparkles } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Button';
import { useBackend, useStore } from '@/data/hooks';
import { springs } from '@/motion/springs';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'How much did I spend this month?',
  'Am I over any budgets?',
  'What renews in the next 7 days?',
  'Biggest categories last month?',
];

type State = 'ready' | 'thinking' | 'not_configured' | 'error';

export function AssistantSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { mode } = useBackend();
  const store = useStore();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [state, setState] = useState<State>('ready');
  const listRef = useRef<HTMLDivElement>(null);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || state === 'thinking' || mode !== 'supabase') return;
    const next = [...turns, { role: 'user' as const, content: q }];
    setTurns(next);
    setInput('');
    setState('thinking');
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    try {
      const client = (store.repo as unknown as { client: SupabaseClient }).client;
      const { data, error } = await client.functions.invoke<{ reply?: string; error?: string }>('assistant', { body: { messages: next.slice(-20) } });
      if (error) {
        const status = (error as { context?: Response }).context?.status;
        if (status === 503) {
          setState('not_configured');
          return;
        }
        throw error;
      }
      setTurns([...next, { role: 'assistant', content: data?.reply ?? 'No answer.' }]);
      setState('ready');
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }));
    } catch {
      setState('error');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Ask Kosh" width={560} testId="assistant-sheet">
      {mode !== 'supabase' ? (
        <Notice icon={<Sparkles size={20} />} title="Not available in Demo Mode">
          The assistant runs on your own Supabase backend so your API key never reaches the browser. Sign in to your account to use it.
        </Notice>
      ) : state === 'not_configured' ? (
        <Notice icon={<KeyRound size={20} />} title="Assistant not set up yet" testId="assistant-setup">
          Add an OpenAI API key as a server secret, then ask again:
          <code className="mt-2 block rounded-[10px] bg-surface-2 px-3 py-2 text-[12px]">npx supabase secrets set OPENAI_API_KEY=…</code>
          The key stays on the server. Everything else in Kosh works without it.
        </Notice>
      ) : (
        <div className="flex min-h-[50dvh] flex-col">
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto pb-3" aria-live="polite">
            {turns.length === 0 && (
              <div className="pt-2">
                <p className="mb-3 text-[14px] text-text-2">Ask about your spending, budgets, balances, goals or what renews soon. It can read your data, never change it.</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => void ask(s)} className="min-h-[40px] rounded-full border border-line bg-surface-2 px-3.5 text-[13px] hover:bg-surface-3">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <AnimatePresence initial={false}>
              {turns.map((t, i) => (
                <m.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={springs.snappy}
                  className={`max-w-[88%] whitespace-pre-wrap rounded-[18px] px-4 py-2.5 text-[14.5px] leading-relaxed ${
                    t.role === 'user' ? 'ml-auto bg-text text-text-inverse' : 'bg-surface-2 text-text'
                  }`}
                >
                  {t.content}
                </m.div>
              ))}
            </AnimatePresence>
            {state === 'thinking' && (
              <div className="flex items-center gap-2 text-[13px] text-text-3" role="status">
                <Spinner size={14} /> Looking at your ledger…
              </div>
            )}
            {state === 'error' && <p className="text-[13px] text-negative">Something went wrong. Try again in a moment.</p>}
          </div>
          <form
            className="flex items-end gap-2 border-t border-line pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
          >
            <label className="flex-1">
              <span className="sr-only">Your question</span>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, 1000))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void ask(input);
                  }
                }}
                rows={1}
                placeholder="Ask about your money…"
                className="max-h-32 min-h-[44px] w-full resize-none rounded-[14px] border border-line bg-surface-2 px-3.5 py-2.5 text-[15px] placeholder:text-text-3"
                data-testid="assistant-input"
              />
            </label>
            <button
              type="submit"
              aria-label="Send"
              disabled={!input.trim() || state === 'thinking'}
              className="tap inline-flex items-center justify-center rounded-full bg-text text-text-inverse disabled:opacity-40"
            >
              <ArrowUp size={20} />
            </button>
          </form>
        </div>
      )}
    </Sheet>
  );
}

function Notice({ icon, title, children, testId }: { icon: React.ReactNode; title: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="flex gap-3 pb-4" data-testid={testId}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-surface-2 text-text-2" aria-hidden="true">
        {icon}
      </span>
      <div className="text-[14px] text-text-2">
        <p className="mb-1 text-[15px] font-medium text-text">{title}</p>
        {children}
      </div>
    </div>
  );
}
