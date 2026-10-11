import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { readSupabaseConfig } from './supabase/config';
import { AppStore } from './store';
import { BackendContext, type BackendContextValue } from './hooks';

const AuthScreen = lazy(() => import('@/features/auth/AuthScreen'));

const DEMO_FLAG = 'kosh.demo';

function demoChosen(): boolean {
  try {
    return sessionStorage.getItem(DEMO_FLAG) === '1' || localStorage.getItem(DEMO_FLAG) === '1';
  } catch {
    return false;
  }
}

function setDemoChoice(on: boolean) {
  try {
    if (on) localStorage.setItem(DEMO_FLAG, '1');
    else {
      localStorage.removeItem(DEMO_FLAG);
      sessionStorage.removeItem(DEMO_FLAG);
    }
  } catch {
  }
}

let demoBoot: Promise<AppStore> | null = null;

function startDemo(): Promise<AppStore> {
  demoBoot ??= bootDemo().catch((err) => {
    demoBoot = null;
    throw err;
  });
  return demoBoot;
}

async function bootDemo(): Promise<AppStore> {
  const { openDemoRepository } = await import('./demo/demoRepository');
  const repo = await openDemoRepository();
  const meta = repo.store.get<{ id: string; value: unknown }>('meta', 'sample_data');
  if (!meta) {
    const { seedSampleData } = await import('./demo/sampleData');
    await seedSampleData(repo);
    await repo.store.mutate((w) => w.put('meta', { id: 'sample_data', value: 1 }));
  }
  const store = new AppStore(repo);
  void store.load();
  return store;
}

export function BackendProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const config = useMemo(() => readSupabaseConfig(), []);
  const [demo, setDemo] = useState(() => !config || demoChosen());
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [demoStore, setDemoStore] = useState<AppStore | null>(null);
  const [userStore, setUserStore] = useState<{ userId: string; store: AppStore } | null>(null);

  useEffect(() => {
    if (!demo) return;
    let cancelled = false;
    void startDemo().then((s) => !cancelled && setDemoStore(s));
    return () => {
      cancelled = true;
    };
  }, [demo]);

  useEffect(() => {
    if (demo || !config) return;
    let unsub: (() => void) | undefined;
    void import('./supabase/client').then(({ createSupabase }) => {
      const c = createSupabase(config);
      setClient(c);
      void c.auth.getSession().then(({ data }) => setSession(data.session));
      const { data } = c.auth.onAuthStateChange((_event, s) => setSession(s));
      unsub = () => data.subscription.unsubscribe();
    });
    return () => unsub?.();
  }, [demo, config]);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (demo || !client || !userId) return;
    let cancelled = false;
    void import('./supabase/supabaseRepository').then(({ SupabaseRepository }) => {
      if (cancelled) return;
      const s = new AppStore(new SupabaseRepository(client));
      setUserStore({ userId, store: s });
      void s.load();
    });
    return () => {
      cancelled = true;
    };
  }, [demo, client, userId]);

  const signOut = useCallback(async () => {
    if (demo) {
      setDemoChoice(false);
      if (config) setDemo(false);
      return;
    }
    await client?.auth.signOut();
  }, [demo, client, config]);

  const store = demo ? demoStore : userStore && userStore.userId === userId ? userStore.store : null;
  const value = useMemo<BackendContextValue | null>(
    () => (store ? { mode: demo ? 'demo' : 'supabase', store, userEmail: session?.user.email ?? null, signOut } : null),
    [store, demo, session, signOut],
  );

  if (!demo && config && client && session === null) {
    return (
      <Suspense fallback={fallback}>
        <AuthScreen
          client={client}
          onDemo={() => {
            setDemoChoice(true);
            setDemo(true);
          }}
        />
      </Suspense>
    );
  }
  if (!value) return <>{fallback}</>;
  return <BackendContext.Provider value={value}>{children}</BackendContext.Provider>;
}
