import { expect, test } from '@playwright/test';
import { admin, paiseFrom, signIn, user } from './helpers';

test.describe.configure({ mode: 'serial' });

test('add an expense end to end (Supabase mode)', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile viewport flow');
  await signIn(page);
  await expect(page.getByTestId('demo-badge')).toHaveCount(0);

  await page.getByTestId('add-button').locator('visible=true').click();
  const sheet = page.getByTestId('add-sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByTestId('mode-income').click();
  for (const k of '10000') await sheet.getByTestId(`key-${k}`).click();
  await expect(sheet.getByTestId('amount-display')).toContainText('10,000');
  await sheet.getByTestId('save-transaction').click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId('stat-available')).toContainText('₹10,000');

  const t0 = Date.now();
  await page.getByTestId('add-button').locator('visible=true').click();
  await expect(sheet).toBeVisible();
  for (const k of ['5', '0', '0']) await sheet.getByTestId(`key-${k}`).click();
  await expect(sheet.getByTestId('chip-category')).not.toHaveText(/Category/);
  await sheet.getByTestId('save-transaction').click();
  await expect(sheet).toBeHidden();
  const elapsed = Date.now() - t0;
  info.annotations.push({ type: 'add-expense-ms', description: String(elapsed) });

  await expect(page.getByTestId('recent-list').getByTestId('tx-row').first()).toContainText('₹500');
  await expect(page.getByText('Expense added')).toBeVisible();
  const available = paiseFrom((await page.getByTestId('stat-available').innerText()).split('cash')[1] ?? '');
  expect(available).toBe(950_000);

  await expect
    .poll(async () => {
      const { data } = await admin().from('transactions').select('id, amount_paise, type').eq('user_id', user().id).eq('type', 'expense').is('deleted_at', null);
      return data?.map((r) => Number(r.amount_paise));
    })
    .toEqual([50_000]);
  const { data: entries } = await admin().from('ledger_entries').select('amount_paise').eq('user_id', user().id);
  expect((entries ?? []).reduce((s, e) => s + Number(e.amount_paise), 0)).toBe(0);
});

test('undo removes the expense everywhere', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile viewport flow');
  await signIn(page);
  await page.getByTestId('add-button').locator('visible=true').click();
  const sheet = page.getByTestId('add-sheet');
  for (const k of ['2', '5', '0']) await sheet.getByTestId(`key-${k}`).click();
  await sheet.getByTestId('save-transaction').click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(async () => {
      const { data } = await admin().from('transactions').select('deleted_at').eq('user_id', user().id).eq('amount_paise', 25_000);
      return data?.[0]?.deleted_at ? 'deleted' : 'live';
    })
    .toBe('deleted');
  await expect(page.getByTestId('stat-available')).toContainText('₹9,500');
});

test('keyboard-only add on desktop', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop keyboard flow');
  await signIn(page);
  await page.getByTestId('add-button').locator('visible=true').focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByTestId('add-sheet');
  await expect(sheet).toBeVisible();
  await page.keyboard.type('120');
  await expect(sheet.getByTestId('amount-display')).toContainText('120');
  await page.keyboard.press('Enter');
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId('recent-list').getByTestId('tx-row').first()).toContainText('₹120');
  await page.keyboard.press('Escape');
});
