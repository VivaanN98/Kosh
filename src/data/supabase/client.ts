import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** Reads public Supabase config from Vite env. A relative URL ("/sb") resolves against the page origin. */
export function readSupabaseConfig(env: Record<string, string | undefined> = import.meta.env): SupabaseConfig | null {
  const rawUrl = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!rawUrl || !anonKey) return null;
  const url = rawUrl.startsWith('/') && typeof window !== 'undefined' ? `${window.location.origin}${rawUrl}` : rawUrl;
  return { url, anonKey };
}

export function createSupabase(config: SupabaseConfig, storageKey = 'kosh.auth'): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey, detectSessionInUrl: true },
  });
}
