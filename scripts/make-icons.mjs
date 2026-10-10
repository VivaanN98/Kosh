// Renders public/icon.svg to the PNG sizes the PWA and the Android app need (via headless Chromium).
// Usage: node scripts/make-icons.mjs
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const svg = readFileSync('public/icon.svg', 'utf8');
// Adaptive-icon foreground: the glyph only (Android supplies the shape; background colour is set in
// res/values/ic_launcher_background.xml).
const glyph = svg.replace(/<rect[^>]*\/>/, '');
const b = await chromium.launch();
const page = await b.newPage();

async function render(path, size, { maskable = false, round = false, transparentPad = 0, glyphOnly = false } = {}) {
  // maskable: full-bleed background with the glyph inside the 80% safe zone.
  const inner = glyphOnly ? glyph : maskable ? svg.replace('rx="116"', 'rx="0"') : svg;
  const scale = maskable ? 0.8 : 1 - transparentPad * 2;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:${maskable ? '#0a0b0d' : 'transparent'}">
    <div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;${round ? 'border-radius:50%;overflow:hidden;' : ''}">
      <div style="width:${size * scale}px;height:${size * scale}px">${inner.replace('<svg ', `<svg width="${size * scale}" height="${size * scale}" `)}</div>
    </div></body></html>`);
  await page.screenshot({ path, omitBackground: !maskable, clip: { x: 0, y: 0, width: size, height: size } });
}

mkdirSync('public/icons', { recursive: true });
await render('public/icons/icon-192.png', 192);
await render('public/icons/icon-512.png', 512);
await render('public/icons/maskable-512.png', 512, { maskable: true });
await render('public/icons/apple-touch-icon.png', 180, { maskable: true });

// Android launcher icons (legacy + round + adaptive foreground) if the native project exists.
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const res = 'android/app/src/main/res';
if (existsSync('android/app')) {
  for (const [d, px] of Object.entries(densities)) {
    mkdirSync(`${res}/mipmap-${d}`, { recursive: true });
    await render(`${res}/mipmap-${d}/ic_launcher.png`, px, { maskable: true });
    await render(`${res}/mipmap-${d}/ic_launcher_round.png`, px, { maskable: true, round: true });
    // Adaptive foreground is 108dp with a 72dp safe zone → glyph at ~66%.
    await render(`${res}/mipmap-${d}/ic_launcher_foreground.png`, Math.round(px * 2.25), { transparentPad: 0.2, glyphOnly: true });
  }
  console.log('Android launcher icons written');
} else {
  console.log('No Android project yet — PWA icons only');
}
await b.close();
console.log('icons done');
