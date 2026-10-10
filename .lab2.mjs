import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const out = process.argv[2];
const u = JSON.parse(readFileSync('e2e/.artifacts/user.json', 'utf8'));
const b = await chromium.launch();
async function login(ctx) {
  const p = await ctx.newPage();
  await p.goto('http://localhost:5173/');
  await p.getByLabel('Email').fill(u.email);
  await p.getByLabel('Password').fill(u.password);
  await p.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await p.getByText('Net worth').first().waitFor({ timeout: 20000 });
  return p;
}
// Desktop side by side (dark)
let ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
let p = await login(ctx);
await p.goto('http://localhost:5173/design-lab/cards'); await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/design-lab-desktop.png` });
await ctx.close();
// Mobile each variant (dark), with the first card opened
ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
p = await login(ctx);
await p.goto('http://localhost:5173/design-lab/cards'); await p.waitForTimeout(1200);
for (const v of ['stacked', 'orbit', 'carousel']) {
  await p.getByTestId(`variant-${v}`).click(); await p.waitForTimeout(900);
  await p.evaluate(() => window.scrollTo(0, 330)); await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/variant-${v}-mobile.png` });
}
await b.close();
