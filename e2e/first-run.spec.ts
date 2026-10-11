import { expect, test } from '@playwright/test';
import { admin } from './helpers';

test('a brand-new account starts with no accounts or cards and can add both', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'one project is enough');
  const email = `e2e+fresh-${Date.now()}@kosh.local`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  try {
    await page.goto('/');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();

    await expect(page.getByTestId('first-run')).toBeVisible({ timeout: 20_000 });
    const { data: rows } = await admin().from('accounts').select('id').eq('user_id', data.user.id).eq('is_system', false);
    expect(rows).toEqual([]);

    // Adding an expense with no account points at adding one instead of a dead end.
    await page.getByRole('button', { name: /add/i }).first().click();
    await expect(page.getByTestId('add-first-account')).toBeVisible();
    await page.getByTestId('add-first-account').click();
    await expect(page).toHaveURL(/\/accounts/);
    // Wait for the account form itself: `dialog` can still match the Add sheet while it animates out.
    await expect(page.getByTestId('create-account')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('create-account')).toBeHidden();

    // A debit card can create its own bank account.
    await expect(page.getByText('No cards yet')).toBeVisible();
    await page.getByTestId('wallet-add').click();
    await page.getByTestId('choose-manual').click();
    const form = page.getByTestId('card-form');
    await form.getByTestId('card-issuer').fill('Sample Bank');
    await form.getByTestId('type-debit').click();
    await form.getByTestId('card-account').selectOption('new-bank');
    await form.getByTestId('save-card').click();
    await expect(page.getByTestId('add-card-sheet')).toBeHidden();
    await expect(page.getByLabel(/Sample Bank, visa debit, linked to Sample Bank Account/)).toBeVisible();
  } finally {
    await admin().auth.admin.deleteUser(data.user.id);
  }
});
