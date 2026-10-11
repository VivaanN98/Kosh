import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('reduced motion: sheets still work, decorative motion is removed', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page);
  await page.getByTestId('add-button').locator('visible=true').click();
  const sheet = page.getByTestId('add-sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByTestId('key-7').click();
  await expect(sheet.getByTestId('amount-display')).toContainText('7');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  const anim = await page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'skeleton';
    document.body.appendChild(el);
    const name = getComputedStyle(el).animationName;
    el.remove();
    return name;
  });
  expect(anim).toBe('none');
});

test('glass falls back to solid surfaces when transparency is reduced', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile');
  await signIn(page);
  const tabbar = page.locator('nav ul.glass').last();
  const before = await tabbar.evaluate((el) => getComputedStyle(el).backdropFilter);
  expect(before).toContain('blur');
  await page.goto('/settings');
  await page.getByTestId('reduce-transparency').check();
  const after = await tabbar.evaluate((el) => ({ filter: getComputedStyle(el).backdropFilter, bg: getComputedStyle(el).backgroundColor }));
  expect(after.filter).toBe('none');
  expect(after.bg).not.toMatch(/rgba\(.*, 0?\.\d+\)/);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-transparency', 'reduced');
  await page.getByTestId('reduce-transparency').uncheck();
});

test('theme preference switches and persists', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop');
  await signIn(page);
  await page.goto('/settings');
  await page.getByTestId('theme-dark').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(10, 11, 13)');
  await page.getByTestId('theme-system').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
});

test('first screens are visible immediately (never waiting on deferred animation code)', async ({ browser, page }, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile');
  const fresh = await browser.newContext();
  const auth = await fresh.newPage();
  await auth.goto('/');
  await auth.getByLabel('Email').waitFor();
  expect(await auth.evaluate(() => getComputedStyle(document.querySelector('main')!).opacity)).toBe('1');
  await fresh.close();
  await signIn(page);
  await page.goto('/accounts');
  await page.getByText('Everything you hold and owe', { exact: false }).waitFor();
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('main')!).opacity)).toBe('1');
});
