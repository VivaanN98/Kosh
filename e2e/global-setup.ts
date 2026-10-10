/**
 * Creates a throwaway confirmed user in LOCAL Supabase for the E2E run (service role, test-only).
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadEnv } from 'vite';

export default async function globalSetup() {
  const env = loadEnv('test', process.cwd(), '');
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('E2E needs .env.local with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (node scripts/write-local-env.mjs)');
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const email = `e2e+${Date.now()}@kosh.local`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  mkdirSync('e2e/.artifacts', { recursive: true });
  writeFileSync('e2e/.artifacts/user.json', JSON.stringify({ id: data.user.id, email, password, url, key }));
}
