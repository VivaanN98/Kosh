import { expect, test } from '@playwright/test';
import { admin, signIn, user } from './helpers';

test.describe.configure({ mode: 'serial' });

test('design lab shows all three variants side by side on desktop', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop comparison');
  await signIn(page);
  await page.goto('/design-lab/cards');
  await expect(page.getByTestId('lab-compare')).toBeVisible();
  for (const v of ['stacked', 'orbit', 'carousel']) await expect(page.getByTestId(`lab-panel-${v}`)).toBeVisible();
  // Both seeded cards appear in every variant.
  await expect(page.getByLabel(/SBI Global International, visa debit, linked to SBI Savings/)).toHaveCount(3);
  await expect(page.getByLabel(/Debit Platinum, rupay debit, linked to Indian Bank Savings/)).toHaveCount(3);
  // Orbit is keyboard operable.
  const deck = page.getByTestId('orbit-deck');
  const focused = deck.locator('[role=option][aria-selected=true]');
  const before = await focused.getAttribute('aria-label');
  await deck.focus();
  await page.keyboard.press('ArrowRight');
  await expect(focused).not.toHaveAttribute('aria-label', before!);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('card-details').first()).toBeVisible();
});

test('mobile variant selector switches variants and keeps the selection', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile selector');
  await signIn(page);
  await page.goto('/design-lab/cards');
  await page.getByTestId('variant-orbit').click();
  await page.getByRole('button', { name: 'Next card' }).click();
  const selected = await page.locator('[role=option][aria-selected=true]').getAttribute('aria-label');
  await page.getByTestId('variant-carousel').click();
  await expect(page.locator('[role=option][aria-selected=true]')).toHaveAttribute('aria-label', selected!);
  await page.getByTestId('variant-stacked').click();
  await expect(page.getByTestId('lab-panel-stacked')).toBeVisible();
  // Persisted locally.
  await page.reload();
  await expect(page.getByTestId('variant-stacked')).toHaveAttribute('aria-checked', 'true');
});

test('manual add card: saved with sanitized fields only and animated into the wallet', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile flow');
  await signIn(page);
  await page.goto('/design-lab/cards');
  await page.getByTestId('wallet-add').click();
  await page.getByTestId('choose-manual').click();
  const form = page.getByTestId('card-form');
  await form.getByTestId('card-issuer').fill('Test Bank');
  await form.getByTestId('card-network').selectOption('mastercard');
  await form.getByTestId('type-credit').click();
  await form.getByTestId('card-last4').fill('4321');
  await form.getByLabel('Name on the card face (optional)').fill('Travel Rewards');
  await form.getByTestId('card-account').selectOption('new-credit');
  await form.getByRole('radio', { name: 'Aurora' }).click();
  await form.getByTestId('save-card').click();
  await expect(page.getByTestId('add-card-sheet')).toBeHidden();
  await expect(page.getByLabel(/Travel Rewards, mastercard credit ending 4321/).first()).toBeVisible();

  const { data } = await admin().from('payment_cards').select('*').eq('user_id', user().id).eq('issuer', 'Test Bank');
  expect(data).toHaveLength(1);
  const row = data![0]!;
  expect(row.last4).toBe('4321');
  expect(row.source).toBe('manual');
  expect(JSON.stringify(row).replace(/[\s-]/g, '')).not.toMatch(/\d{12,}/);
  for (const k of Object.keys(row)) expect(['number', 'pan', 'cvv', 'cvc', 'pin', 'expiry', 'photo', 'image']).not.toContain(k);
  const { data: acct } = await admin().from('accounts').select('kind').eq('id', row.account_id).single();
  expect(acct?.kind).toBe('credit_card');
});
