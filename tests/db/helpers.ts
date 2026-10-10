/**
 * Supabase integration helpers. Requires `npm run db:start` and `.env.local`
 * (node scripts/write-local-env.mjs). Uses the service role ONLY to create throwaway users.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SupabaseRepository } from '@/data/supabase/supabaseRepository';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

export const dbConfigured = Boolean(url && serviceKey && anonKey);

export function adminClient(): SupabaseClient {
  return createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
  repo: SupabaseRepository;
}

export async function createTestUser(): Promise<TestUser> {
  const email = `test+${crypto.randomUUID()}@kosh.local`;
  const password = `pw-${crypto.randomUUID()}`;
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, email, password, client, repo: new SupabaseRepository(client) };
}

export async function deleteTestUser(user: TestUser): Promise<void> {
  await adminClient().auth.admin.deleteUser(user.id);
}
