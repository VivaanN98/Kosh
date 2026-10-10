// Starts the Vite dev server and a Cloudflare quick tunnel, then prints the https URL to open
// on your phone. Camera access (card scanning) requires https, which the tunnel provides.
// The tunnel is public while this runs; the app still requires sign-in (or runs Demo Mode).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const candidates = [
  process.env.CLOUDFLARED_PATH,
  'C:\Program Files (x86)\cloudflared\cloudflared.exe',
  'C:\Program Files\cloudflared\cloudflared.exe',
].filter(Boolean);
const cloudflared = candidates.find((p) => existsSync(p)) ?? 'cloudflared';

const vite = spawn('npx', ['vite'], { stdio: 'inherit', shell: true });
const tunnel = spawn(cloudflared, ['tunnel', '--no-autoupdate', '--url', 'http://localhost:5173'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

let printed = false;
const onData = (buf) => {
  const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(buf.toString());
  if (match && !printed) {
    printed = true;
    console.log(`\n  📱  Open on your phone: ${match[0]}\n`);
  }
};
tunnel.stdout.on('data', onData);
tunnel.stderr.on('data', onData);
tunnel.on('error', (err) => {
  console.error('Could not start cloudflared. Install it with: winget install Cloudflare.cloudflared', err.message);
});

const stop = () => {
  tunnel.kill();
  vite.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
