import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

// Narrowest supported phone, a common phone, and a small tablet.
const WIDTHS = [320, 390, 768];

/** Elements poking outside the open sheet (or the page), ignoring anything inside its own horizontal scroller. */
async function overflowing(page: Page, where: string): Promise<string[]> {
  return page.evaluate((label) => {
    const found: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth + 1) found.push(`${label}: page is ${root.scrollWidth}px wide in a ${root.clientWidth}px viewport`);
    const scope = (document.querySelector('[role=dialog]') as HTMLElement | null) ?? document.body;
    const box = scope.getBoundingClientRect();
    const inScroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== scope; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth) return true;
      }
      return false;
    };
    for (const el of scope.querySelectorAll<HTMLElement>('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || el.classList.contains('aurora')) continue;
      if ((r.right > box.right + 1 || r.left < box.left - 1) && !inScroller(el)) {
        found.push(`${label}: <${el.tagName.toLowerCase()}> "${(el.textContent ?? '').trim().slice(0, 24)}" spans ${Math.round(r.left)}–${Math.round(r.right)}px, container is ${Math.round(box.left)}–${Math.round(box.right)}px`);
        if (found.length >= 5) break;
      }
    }
    return found;
  }, where);
}

for (const width of WIDTHS) {
  test(`pages and sheets never scroll sideways at ${width}px`, async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'viewport is set per test');
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await page.setViewportSize({ width, height: 800 });
    const problems: string[] = [];

    for (const path of ['/', '/activity', '/accounts', '/plans/goals', '/plans/recurring', '/settings']) {
      await page.goto(path);
      await page.waitForTimeout(400);
      problems.push(...(await overflowing(page, path)));
    }

    // Each opener must succeed: a sheet that can't be opened is a failure, not a pass.
    const sheets: { name: string; path: string; open: () => Promise<void> }[] = [
      { name: 'add sheet', path: '/', open: () => page.getByTestId('add-button').locator('visible=true').first().click() },
      { name: 'new account', path: '/accounts', open: () => page.getByTestId('add-account').click() },
      {
        name: 'new card',
        path: '/accounts',
        open: async () => {
          await page.getByTestId('wallet-add').click();
          await page.getByTestId('choose-manual').click();
          await page.getByTestId('card-form').waitFor();
        },
      },
      {
        name: 'edit card',
        path: '/accounts',
        open: async () => {
          const card = page.getByLabel(/Test Visa Debit/).first();
          await card.scrollIntoViewIfNeeded();
          await card.evaluate((el) => (el as HTMLElement).click());
          await page.getByTestId('card-details').getByRole('button', { name: 'Edit' }).evaluate((el) => (el as HTMLElement).click());
          await page.getByTestId('card-form').waitFor();
        },
      },
      { name: 'new goal', path: '/plans/goals', open: () => page.getByTestId('new-goal').click() },
      { name: 'new recurring', path: '/plans/recurring', open: () => page.getByTestId('new-rule').click() },
    ];
    for (const sheet of sheets) {
      await page.goto(sheet.path);
      await sheet.open();
      await page.waitForTimeout(600);
      expect(await page.getByRole('dialog').count(), `${sheet.name} should be open`).toBeGreaterThan(0);
      problems.push(...(await overflowing(page, sheet.name)));
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }

    expect(problems, `Horizontal overflow at ${width}px`).toEqual([]);
  });
}
