/**
 * Visual pass: key screens at the project's viewport (mobile / desktop) in both themes.
 * Output: e2e/.artifacts/screens/<project>-<theme>-<screen>.png (reviewed by eye, not diffed).
 */
import { test } from '@playwright/test';
import { signIn } from './helpers';

const OUT = 'e2e/.artifacts/screens';

for (const theme of ['light', 'dark'] as const) {
  test(`screens in ${theme} theme`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await signIn(page);
    const shot = async (name: string) => {
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${OUT}/${info.project.name}-${theme}-${name}.png` });
    };
    await shot('home');
    await page.getByTestId('add-button').locator('visible=true').click();
    for (const k of ['4', '5', '0']) await page.getByTestId('add-sheet').getByTestId(`key-${k}`).click();
    await shot('add-sheet');
    await page.keyboard.press('Escape');
    await page.goto('/accounts');
    await shot('accounts');
    await page.goto('/settings#card-style');
    await page.waitForTimeout(600);
    await shot('card-style');
    await page.goto('/insights');
    await shot('insights');
    await page.goto('/plans/budgets');
    await shot('plans');
  });
}
