import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseConfig } from './config';

export function createSupabase(config: SupabaseConfig, storageKey = 'kosh.auth'): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey, detectSessionInUrl: true },
  });
}
