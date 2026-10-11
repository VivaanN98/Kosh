import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

export interface E2EUser {
  id: string;
  email: string;
  password: string;
  url: string;
  key: string;
}

export function user(): E2EUser {
  return JSON.parse(readFileSync('e2e/.artifacts/user.json', 'utf8')) as E2EUser;
}

export function admin() {
  const u = user();
  return createClient(u.url, u.key, { auth: { persistSession: false } });
}

export async function signIn(page: Page) {
  const u = user();
  await page.goto('/');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill(u.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page.getByText('Net worth').first()).toBeVisible({ timeout: 20_000 });
}

export function paiseFrom(text: string): number {
  const negative = /[−-]/.test(text);
  const clean = text.replace(/[^\d.]/g, '');
  const [w = '0', f = ''] = clean.split('.');
  const v = Number(w) * 100 + Number((f + '00').slice(0, 2));
  return negative ? -v : v;
}
