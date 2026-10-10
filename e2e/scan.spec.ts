/**
 * Card scanning: camera permission timing, every failure path, and the full on-device OCR path
 * with a synthetic FICTIONAL card streamed as the camera. Asserts nothing sensitive is persisted.
 */
import { expect, test, type Page } from '@playwright/test';
import { admin, signIn, user } from './helpers';

type CameraMode = 'allow' | 'deny' | 'unsupported' | 'blurry' | 'blank';

/** Replace getUserMedia before the app loads; count calls; stream a drawn card for 'allow'. */
async function fakeCamera(page: Page, mode: CameraMode) {
  await page.addInitScript((m: CameraMode) => {
    const w = window as unknown as { __gumCalls: number };
    w.__gumCalls = 0;
    if (m === 'unsupported') {
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
      return;
    }
    const draw = (blur: boolean, blank: boolean) => {
      // 1080p "camera". The card is centred and sized like a user filling the on-screen guide
      // (the preview is 3:4 portrait with object-fit: cover, the guide is 86% of its width).
      const W = 1920;
      const H = 1080;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const x = c.getContext('2d')!;
      const cw = Math.round(H * 0.75 * 0.86);
      const ch = Math.round(cw / 1.586);
      const ox = Math.round((W - cw) / 2);
      const oy = Math.round((H - ch) / 2);
      const u = cw / 1000; // design units
      const paint = () => {
        x.filter = 'none';
        x.fillStyle = '#3d362f';
        x.fillRect(0, 0, W, H);
        if (blur) x.filter = 'blur(6px)';
        const g = x.createLinearGradient(ox, oy, ox + cw, oy + ch);
        g.addColorStop(0, '#1d3f8f');
        g.addColorStop(1, '#4f8be6');
        x.fillStyle = g;
        x.fillRect(ox, oy, cw, ch);
        if (blank) {
          // Sharp, textless artwork: passes the blur check, gives OCR nothing to read.
          x.fillStyle = 'rgba(255,255,255,0.8)';
          for (let sx = ox; sx < ox + cw; sx += 24 * u) x.fillRect(sx, oy, 8 * u, ch);
          return;
        }
        x.fillStyle = '#ffffff';
        x.font = `bold ${52 * u}px Arial`;
        x.fillText('STATE BANK OF INDIA', ox + 60 * u, oy + 100 * u);
        x.font = `bold ${30 * u}px Arial`;
        x.fillText('DEBIT', ox + 840 * u, oy + 100 * u);
        x.font = `600 ${30 * u}px Arial`;
        x.fillText('GLOBAL INTERNATIONAL', ox + 60 * u, oy + 150 * u);
        x.fillStyle = '#d9b56a';
        x.fillRect(ox + 70 * u, oy + 210 * u, 110 * u, 82 * u);
        x.fillStyle = '#ffffff';
        x.font = `bold ${60 * u}px "Courier New", monospace`;
        x.fillText('4000  1234  5678  9017', ox + 60 * u, oy + 400 * u); // fictional test number
        x.font = `italic 900 ${80 * u}px Arial`;
        x.fillText('VISA', ox + 730 * u, oy + 590 * u);
      };
      paint();
      setInterval(paint, 200);
      return (c as HTMLCanvasElement & { captureStream: (fps: number) => MediaStream }).captureStream(10);
    };
    const gum = async () => {
      w.__gumCalls++;
      if (m === 'deny') throw new DOMException('Permission denied', 'NotAllowedError');
      return draw(m === 'blurry', m === 'blank');
    };
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: gum }, configurable: true });
  }, mode);
}

async function openAddCard(page: Page) {
  await page.goto('/design-lab/cards');
  await page.getByTestId('wallet-add').click();
  await expect(page.getByTestId('choose-scan')).toBeVisible();
}

const gumCalls = (page: Page) => page.evaluate(() => (window as unknown as { __gumCalls: number }).__gumCalls);

test.describe.configure({ mode: 'serial' });

test('camera is requested only after Scan is chosen', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile');
  await fakeCamera(page, 'allow');
  await signIn(page);
  await openAddCard(page);
  expect(await gumCalls(page)).toBe(0);
  await page.getByTestId('choose-manual').click();
  await expect(page.getByTestId('card-form')).toBeVisible();
  expect(await gumCalls(page)).toBe(0);
  await page.keyboard.press('Escape');
  await page.getByTestId('wallet-add').click();
  await page.getByTestId('choose-scan').click();
  await expect(page.getByTestId('scan-capture')).toBeEnabled();
  expect(await gumCalls(page)).toBe(1);
});

for (const [mode, message] of [
  ['deny', /Camera access was blocked/],
  ['unsupported', /can’t use the camera/],
] as const) {
  test(`scan failure (${mode}) falls back to manual entry`, async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'mobile');
    await fakeCamera(page, mode);
    await signIn(page);
    await openAddCard(page);
    await page.getByTestId('choose-scan').click();
    await expect(page.getByTestId('scan-fallback-reason')).toHaveText(message);
    await expect(page.getByTestId('card-form')).toBeVisible();
  });
}

test('blurry capture asks for a retake and manual stays available', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile');
  await fakeCamera(page, 'blurry');
  await signIn(page);
  await openAddCard(page);
  await page.getByTestId('choose-scan').click();
  await page.getByTestId('scan-capture').click();
  await expect(page.getByText('That photo looks blurry')).toBeVisible();
  await expect(page.getByTestId('scan-retake')).toBeVisible();
  await page.getByTestId('scan-manual').click();
  await expect(page.getByTestId('scan-fallback-reason')).toBeVisible();
  await expect(page.getByTestId('card-form')).toBeVisible();
});

test('cancel during scan falls back to manual entry', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile');
  await fakeCamera(page, 'allow');
  await signIn(page);
  await openAddCard(page);
  await page.getByTestId('choose-scan').click();
  await expect(page.getByTestId('scan-capture')).toBeEnabled();
  await page.getByTestId('scan-manual').click();
  await expect(page.getByTestId('scan-fallback-reason')).toHaveText(/Scan cancelled/);
});

test('OCR that finds no text falls back with the card colours kept', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile');
  await fakeCamera(page, 'blank');
  await signIn(page);
  await openAddCard(page);
  await page.getByTestId('choose-scan').click();
  await page.getByTestId('scan-capture').click();
  await expect(page.getByTestId('scan-fallback-reason')).toHaveText(/couldn’t read any text/, { timeout: 45_000 });
  await expect(page.getByTestId('card-form')).toBeVisible();
});

test('full scan: on-device OCR → editable review → saved without sensitive data', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile');
  await fakeCamera(page, 'allow');
  await signIn(page);
  await openAddCard(page);
  await page.getByTestId('choose-scan').click();
  await expect(page.getByTestId('scan-capture')).toBeEnabled();
  await page.getByTestId('scan-capture').click();
  await expect(page.getByTestId('scan-review-note')).toBeVisible({ timeout: 45_000 });
  const form = page.getByTestId('card-form');
  // Recognised fields are pre-filled and every one is editable.
  await expect(form.getByTestId('card-issuer')).toHaveValue('State Bank of India');
  await expect(form.getByTestId('card-network')).toHaveValue('visa');
  await expect(form.getByTestId('card-last4')).toHaveValue('9017');
  await form.getByTestId('card-issuer').fill('State Bank of India');
  await form.getByLabel('Name on the card face (optional)').fill('Scanned Global');
  await form.getByTestId('card-account').selectOption({ label: 'SBI Savings' });
  await form.getByTestId('save-card').click();
  await expect(page.getByTestId('add-card-sheet')).toBeHidden();
  await expect(page.getByLabel(/Scanned Global, visa debit ending 9017/).first()).toBeVisible();

  // Database: only sanitized fields; no full number anywhere.
  const { data } = await admin().from('payment_cards').select('*').eq('user_id', user().id).eq('display_name', 'Scanned Global');
  expect(data).toHaveLength(1);
  expect(data![0]!.source).toBe('scan');
  expect(JSON.stringify(data)).not.toContain('4000123456789017');
  expect(JSON.stringify(data).replace(/[\s-]/g, '')).not.toMatch(/\d{12,}/);
  // Browser storage: neither localStorage nor IndexedDB holds the number or the image.
  const local = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(local.replace(/[\s-]/g, '')).not.toMatch(/4000123456789017|data:image/);
  const idb = await page.evaluate(async () => {
    const dbs = (await indexedDB.databases?.()) ?? [];
    return dbs.map((d) => d.name).join(',');
  });
  expect(idb).not.toContain('kosh-demo'); // Supabase mode never touches the Demo store
});
