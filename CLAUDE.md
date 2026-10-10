# Kosh — personal expense tracker (INR, Asia/Kolkata)

Single-user personal finance app. Correctness first, then navigation, then smoothness.

## Stack

React 19 · Vite 8 · TypeScript 6 (strict) · Tailwind CSS 4 · Motion (`motion/react`) · Lucide ·
React Hook Form + Zod 4 · Recharts 3 · date-fns 4 + `@date-fns/tz` · Supabase (Auth + Postgres + RLS) ·
Vitest 5 + React Testing Library · Playwright.

Additions beyond the original spec, and why:
- `react-router` 7 — deep links (`/accounts/:id`, `/plans/:tab`, `/settings#card-style`), back-button behaviour and lazy routes.
  Pinned to 7.x because 8.x requires Node ≥ 22.22 and this machine runs 22.14.
- `idb` — tiny (~1 KB) promise wrapper over IndexedDB for Demo Mode; loaded only in Demo Mode.
- `fake-indexeddb` (dev) — runs the Demo adapter under Vitest.
- `supabase` (dev) — the CLI, pinned per-project instead of a global install.
- `tesseract.js` 7 — on-device OCR for card scanning, chosen after measuring candidates on synthetic cards
  (docs/ocr.md). Self-hosted under `/ocr` (copied by `scripts/copy-ocr-assets.mjs`), lazy-loaded after Scan.
- `@tesseract.js-data/eng` (dev) — the English model file copied into `/ocr`.
- Phone testing uses a Cloudflare quick tunnel (`cloudflared` in `.tools/` or installed) instead of local certs.
- `@capacitor/core`, `@capacitor/android`, `@capacitor/app`, `@capacitor/cli` (dev) — the native Android
  app the user asked for (installable APK). `@capacitor/app` handles the hardware back button.
- `vite-plugin-pwa` + `workbox-window` (dev) — installable PWA (manifest, service worker, update prompt).
- `typescript` pinned to 6.0.x because `typescript-eslint` 8 supports `<6.1`.
- `jsdom` pinned to 29.x because 30.x requires Node ≥ 22.22.

## Commands

| Task | Command |
| --- | --- |
| Install | `npm install` |
| Dev | `npm run dev` → http://localhost:5173 (local Supabase proxied at `/sb`) |
| Dev on phone (https tunnel) | `npm run dev:phone` → prints a `https://…trycloudflare.com` link |
| OCR evaluation | `npm run ocr:eval` (re-runs the engine comparison on synthetic cards) |
| Build | `npm run build` |
| Serve build | `npm start` → http://localhost:4173 |
| Unit + adapter tests | `npm test` |
| DB tests (needs local Supabase) | `npm run test:db` |
| E2E | `npm run test:e2e` |
| Lint | `npm run lint` |
| Type-check | `npm run typecheck` |
| Start local Supabase (Docker) | `npm run db:start` |
| Apply migrations (reset + seed) | `npm run db:reset` |
| Apply new migrations only | `npm run db:migrate` |
| New migration | `npm run db:new -- <name>` |
| Write `.env.local` from local Supabase | `node scripts/write-local-env.mjs` |
| Serve Edge Functions locally | `npx supabase functions serve` |
| Android APK (signed) | `npm run android:apk` → `dist-apk/` (toolchain in `D:/KoshAndroid`, see docs/deployment.md) |
| Web build for the Android app | `npm run build:native` (`--mode native`, uses `.env.native(.local)`) |
| App icons from `public/icon.svg` | `npm run icons` |

## Folder structure

```
src/
  lib/            money.ts (ALL money math/format), dates.ts (ALL date math, IST), ids, csv
  domain/         pure TS: types, ledger engine (validation + postings), metrics, budgets,
                  goals, recurring schedule, statements, reports, seed data
  data/           repository.ts (interface), demo/ (IndexedDB adapter), supabase/ (RPC adapter),
                  provider.tsx (picks backend), queries (cache + optimistic updates)
  motion/         springs.ts — the ONLY place spring presets are defined; MotionProvider defers
                  animation features until the first page paints (first screens never wait on them)
  native/         Capacitor integration (Android back button, system bars) — native build only
  pwa.ts          service worker registration + install prompt — web only
  styles/         tokens.css (all design tokens), index.css
  components/     ui primitives (Sheet, Toast, Keypad, Skeleton, Glass…), cards/
  features/       home, activity, add, accounts, cards (3 wallet variants + scan), plans, insights,
                  settings (incl. Card style), auth
tests/
  vectors/        ledger test vectors (data) + runner, executed against BOTH adapters
  unit/           adapter + domain tests (jsdom)
  db/             Supabase integration tests (RLS, RPC, vectors) — need `npm run db:start`
e2e/              Playwright specs + screenshots
supabase/
  migrations/     schema, RLS, ledger RPC functions
  functions/      Edge Functions: `assistant` (read-only AI; key server-side; six SQL tools)
android/          Capacitor Android project (generated; signing via android/keystore.properties, gitignored)
docs/             architecture, database, security, deployment, testing
```

## Money rules (non-negotiable)

- Amounts are integer **paise** (`Paise = number`, safe integer). Never floats. Never `parseFloat`
  (lint rule enforces it). Parse input with `parseRupees`, format with `formatINR` / `formatINRCompact`.
- Indian grouping (1,00,000) only through `lib/money.ts`.
- Database columns are `bigint` paise named `*_paise`.

## Ledger rules

- Every financial operation is a `transactions` row plus balanced `ledger_entries` (sum = 0, enforced
  by a deferred constraint trigger). Debit-positive: asset balance = Σ entries; card debt = −Σ entries.
- System accounts per user: `income`, `expense`, `equity` (hidden). Expense postings hit the expense
  account with a category; that is the ONLY source of "spending".
- Postings are built in exactly one place per backend: `domain/ledger/engine.ts` (Demo) and
  `private._post_entries` (Postgres). Shared vectors in `tests/vectors` keep them identical.
- The browser never writes ledger rows. Supabase: all money writes go through `public.*` RPC functions
  (security definer, `auth.uid()` checked). Every write carries an idempotency key.
- Types: expense, income, transfer, card_payment, refund, opening_balance, adjustment, goal_transfer.
  Transfers/card payments/goal transfers never count as income or expense. Refunds credit the expense
  account. Fees & interest are expenses (category "Fees & Charges").
- Net worth = Σ balances of cash, bank, goal accounts − card debt. Available cash = Σ positive
  balances of cash + bank. Free cash = available − earmarked goal money.
- Goals: `earmark` mode (no ledger movement) or `account` mode (dedicated goal account; contributions
  are goal_transfer transactions). Never expenses.
- A payment card is an instrument linked to an account; it has no balance.

## Date rules

- Ledger dates are calendar dates (`YYYY-MM-DD`) in Asia/Kolkata. Use `lib/dates.ts`; never `new Date()`
  arithmetic for calendar logic. "Today" = `todayIST()`.
- Monthly schedules keep an anchor day and clamp (31st → 28/29/30), never drift.

## Design rules

- All tokens live in `src/styles/tokens.css`; components use Tailwind utilities mapped to tokens.
- Animate only `transform` and `opacity`. Springs come from `src/motion/springs.ts`.
- Respect `prefers-reduced-motion` (fades only) and provide a solid fallback for glass surfaces
  (`@supports not (backdrop-filter)` and `prefers-reduced-transparency`).
- Tabular numerals for money. Translucency only on nav, sheets and cards — never behind dense text.
- 44px minimum touch targets, visible focus rings, WCAG AA contrast in both themes.
- Home shows at most two charts. Destructive actions use undo toasts.
- Cards: three wallet variants (Stacked — default, Orbit, Vertical Carousel) share one set of components,
  data and selection state. The user picks one in Settings → Card style (`useCardVariant`).

## Privacy rules (cards)

- Never persist full card numbers, CVV/CVC, expiry, PINs or credentials. OCR text stays in memory.
- The database stores only issuer, network, type, display name, optional last 4 and sanitized template
  artwork.
- A scanned card's face picture may be kept, but ONLY after `domain/cards/faceMask.ts` has removed every
  digit, the number row and the lower-half name, the cleaned picture re-reads with no digits
  (`features/cards/scan/cardFaceImage.ts`; otherwise none is kept), and ONLY in this browser's
  IndexedDB (`data/cardFaces.ts`). Never in Supabase, never uploaded. The raw photo is never stored.
- Card data and images are never sent to any AI provider.
