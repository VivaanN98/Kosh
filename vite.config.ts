/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// Local Supabase is proxied through the dev server at /sb so a phone on the Cloudflare tunnel
// (https) can reach it same-origin, without mixed content or exposing port 54321.
const SUPABASE_LOCAL = process.env.SUPABASE_PROXY_TARGET ?? 'http://127.0.0.1:54321';
const supabaseProxy = {
  '/sb': {
    target: SUPABASE_LOCAL,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/sb/, ''),
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Only the app entry is scanned for dependencies (scripts/ocr-eval has its own optional engines).
  optimizeDeps: { entries: ['index.html'] },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Cloudflare quick tunnels (npm run dev:phone) use random *.trycloudflare.com hosts.
    allowedHosts: ['.trycloudflare.com'],
    proxy: supabaseProxy,
  },
  preview: {
    port: 4173,
    strictPort: true,
    allowedHosts: ['.trycloudflare.com'],
    proxy: supabaseProxy,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    reportCompressedSize: true,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./tests/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.{ts,tsx}'],
          css: false,
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          environment: 'node',
          globals: true,
          include: ['tests/db/**/*.test.ts'],
          // Server-side test credentials (service role) from .env.local — never exposed to the browser.
          env: loadEnv('test', process.cwd(), ''),
          testTimeout: 30_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
