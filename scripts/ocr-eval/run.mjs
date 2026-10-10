// Runs the OCR evaluation page in headless Chromium and writes docs/ocr-evaluation.json + a summary.
// Usage: node scripts/ocr-eval/run.mjs [engine-prefix]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 5190;
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore', env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' } });
await new Promise((r) => setTimeout(r, 6000));
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
const engine = process.argv[2] ?? '';
await page.goto(`http://localhost:${PORT}/scripts/ocr-eval/index.html${engine ? `?engine=${engine}` : ''}`);
await page.waitForFunction(() => window.__OCR_RESULTS__, null, { timeout: 15 * 60_000, polling: 1000 });
const out = await page.evaluate(() => window.__OCR_RESULTS__);
console.log('paddle raw:', await page.evaluate(() => window.__PADDLE_RAW__));
for (const r of out.results) console.log(r.engine, 'first sample:', JSON.stringify(r.rows?.[0]?.sample));
await browser.close();
vite.kill();
if (process.platform === 'win32') spawn('taskkill', ['/F', '/T', '/PID', String(vite.pid)], { stdio: 'ignore' });

mkdirSync('docs', { recursive: true });
writeFileSync(`docs/ocr-evaluation${engine ? `-${engine}` : ''}.json`, JSON.stringify(out, null, 2));
for (const r of out.results) {
  if (r.error) {
    console.log(`\n${r.engine}: FAILED TO LOAD — ${r.error}`);
    continue;
  }
  const n = r.rows.length;
  const pct = (k) => `${Math.round((r.rows.filter((x) => x[k]).length / n) * 100)}%`;
  const all = r.rows.filter((x) => x.issuer && x.network && x.cardType && x.last4).length;
  const silentWrong = r.rows.reduce((s, x) => s + x.flaggedWrong.length, 0);
  const avg = Math.round(r.rows.reduce((s, x) => s + x.ms, 0) / n);
  console.log(`\n${r.engine}\n  init ${r.initMs} ms · avg ${avg} ms/card · issuer ${pct('issuer')} · network ${pct('network')} · type ${pct('cardType')} · last4 ${pct('last4')} · all-four ${Math.round((all / n) * 100)}% · wrong-but-not-flagged ${silentWrong}`);
  for (const cond of ['clean', 'embossed', 'glossy-blur', 'angled-lowlight']) {
    const rows = r.rows.filter((x) => x.cond === cond);
    const ok = (k) => rows.filter((x) => x[k]).length;
    console.log(`    ${cond.padEnd(16)} issuer ${ok('issuer')}/${rows.length} network ${ok('network')}/${rows.length} type ${ok('cardType')}/${rows.length} last4 ${ok('last4')}/${rows.length}`);
  }
}
console.log('\ndownload bytes by engine:', out.bytes);
process.exit(0);
