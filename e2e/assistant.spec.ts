import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Requires `npx supabase functions serve` (or a deployed function). With no OPENAI_API_KEY set,
// the assistant must show its setup state and leave the rest of the app untouched.
test('assistant without a key shows setup steps; the app keeps working', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile');
  await signIn(page);
  await page.goto('/insights');
  await page.getByTestId('open-assistant').click();
  await page.getByRole('button', { name: 'How much did I spend this month?' }).click();
  await expect(page.getByTestId('assistant-setup')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('category-breakdown')).toBeVisible();
});
