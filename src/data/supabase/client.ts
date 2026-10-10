import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseConfig } from './config';

const clients = new Map<string, SupabaseClient>();

/** One client per project per page (StrictMode re-runs effects; two auth clients would race). */
export function createSupabase(config: SupabaseConfig, storageKey = 'kosh.auth'): SupabaseClient {
  const id = `${config.url}|${storageKey}`;
  let client = clients.get(id);
  if (!client) {
    client = createClient(config.url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey, detectSessionInUrl: true },
    });
    clients.set(id, client);
  }
  return client;
}
