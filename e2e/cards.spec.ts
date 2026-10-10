import { expect, test } from '@playwright/test';
import { admin, signIn, user } from './helpers';

test.describe.configure({ mode: 'serial' });

test('card style lives in Settings: Stacked by default, all three selectable, persisted, used in Accounts', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop');
  await signIn(page);
  await page.goto('/design-lab/cards'); // retired route redirects to Settings
  await expect(page).toHaveURL(/\/settings#card-style$/);
  const style = page.getByTestId('card-style');
  await expect(style.getByTestId('preview-stacked')).toBeVisible();
  await expect(style.getByLabel(/SBI Global International, visa debit, linked to SBI Savings/)).toHaveCount(1);
  for (const v of ['orbit', 'carousel', 'stacked'] as const) {
    await style.getByTestId(`variant-${v}`).click();
    await expect(style.getByTestId(`preview-${v}`)).toBeVisible();
  }
  // Orbit is keyboard operable.
  await style.getByTestId('variant-orbit').click();
  const deck = page.getByTestId('orbit-deck');
  const focused = deck.locator('[role=option][aria-selected=true]');
  const before = await focused.getAttribute('aria-label');
  await deck.focus();
  await page.keyboard.press('ArrowRight');
  await expect(focused).not.toHaveAttribute('aria-label', before!);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('card-details').first()).toBeVisible();
  // Persisted and applied to Accounts.
  await page.reload();
  await expect(page.getByTestId('card-style').getByTestId('variant-orbit')).toHaveAttribute('aria-checked', 'true');
  await page.goto('/accounts');
  await expect(page.getByTestId('wallet-orbit')).toBeVisible();
  await page.goto('/settings#card-style');
  await page.getByTestId('card-style').getByTestId('variant-stacked').click();
});

test('switching card style keeps the selected card (mobile)', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile selector');
  await signIn(page);
  await page.goto('/settings#card-style');
  const style = page.getByTestId('card-style');
  await style.getByTestId('variant-orbit').click();
  await style.getByRole('button', { name: 'Next card' }).click();
  const selected = await style.locator('[role=option][aria-selected=true]').getAttribute('aria-label');
  await style.getByTestId('variant-carousel').click();
  await expect(style.locator('[role=option][aria-selected=true]')).toHaveAttribute('aria-label', selected!);
  await style.getByTestId('variant-stacked').click();
  await expect(style.getByTestId('preview-stacked')).toBeVisible();
});

test('manual add card: saved with sanitized fields only and animated into the wallet', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile flow');
  await signIn(page);
  await page.goto('/accounts');
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
