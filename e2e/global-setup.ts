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

  // New accounts start empty, so give the E2E user one bank account and two debit cards to work with.
  // This goes through the same RPC and RLS-checked insert the app uses, signed in as that user.
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error('E2E needs VITE_SUPABASE_ANON_KEY in .env.local (node scripts/write-local-env.mjs)');
  const asUser = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await asUser.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  const userId = data.user.id;
  const { data: acct, error: acctError } = await asUser.rpc('create_account', {
    p_input: { name: 'Test Savings', kind: 'bank', institution: 'Fixture Bank', opening_balance: 0 },
    p_idempotency_key: 'e2e:test-savings',
  });
  if (acctError) throw acctError;
  const artwork = { version: 1, template: 'gradient', colors: ['#1d3f8f', '#2f6fd6', '#7fb2ff'], textTone: 'light', chip: 'left', chipStyle: 'gold', networkPosition: 'bottom-right', issuerPosition: 'top-left', contactless: true, pattern: 'waves', finish: 'gloss' };
  const { error: cardError } = await asUser.from('payment_cards').insert([
    { user_id: userId, account_id: acct.id, issuer: 'Fixture Bank', network: 'visa', card_type: 'debit', display_name: 'Test Visa Debit', artwork, source: 'manual', sort_order: 1 },
    { user_id: userId, account_id: acct.id, issuer: 'Fixture Bank', network: 'rupay', card_type: 'debit', display_name: 'Test RuPay Debit', artwork, source: 'manual', sort_order: 2 },
  ]);
  if (cardError) throw cardError;
  mkdirSync('e2e/.artifacts', { recursive: true });
  writeFileSync('e2e/.artifacts/user.json', JSON.stringify({ id: data.user.id, email, password, url, key }));
}
