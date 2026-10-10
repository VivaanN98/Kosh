/// <reference types="vitest/config" />
import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import mkcert from 'vite-plugin-mkcert';
import { networkInterfaces } from 'node:os';
import { fileURLToPath, URL } from 'node:url';

/** LAN IPv4 addresses, so the dev certificate is valid when opened from a phone. */
function lanHosts(): string[] {
  const hosts: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const addr of list ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) hosts.push(addr.address);
    }
  }
  return hosts;
}

// HTTPS is on by default for `npm run dev` (camera access on a phone needs a secure context).
// Set DEV_HTTP=1 to serve plain http (used by Playwright; localhost is already a secure context).
const useHttps = !process.env.DEV_HTTP && !process.env.VITEST;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(useHttps
      ? [
          mkcert({
            savePath: fileURLToPath(new URL('./certs', import.meta.url)),
            hosts: ['localhost', '127.0.0.1', ...lanHosts()],
          }) as PluginOption,
        ]
      : []),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
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
          testTimeout: 30_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
