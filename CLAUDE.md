# Kosh — personal expense tracker (INR, Asia/Kolkata)

Single-user personal finance app. Correctness first, then navigation, then smoothness.

## Stack

React 19 · Vite 8 · TypeScript 6 (strict) · Tailwind CSS 4 · Motion (`motion/react`) · Lucide ·
React Hook Form + Zod 4 · Recharts 3 · date-fns 4 + `@date-fns/tz` · Supabase (Auth + Postgres + RLS) ·
Vitest 5 + React Testing Library · Playwright.

Additions beyond the original spec, and why:
- `react-router` 7 — deep links (`/design-lab/cards`, `/accounts/:id`), back-button behaviour and lazy routes.
  Pinned to 7.x because 8.x requires Node ≥ 22.22 and this machine runs 22.14.
- `idb` — tiny (~1 KB) promise wrapper over IndexedDB for Demo Mode; loaded only in Demo Mode.
- `fake-indexeddb` (dev) — runs the Demo adapter under Vitest.
- `supabase` (dev) — the CLI, pinned per-project instead of a global install.
- `vite-plugin-mkcert` (dev) — trusted local HTTPS so the camera works on a phone. Pinned to 1.17.x
  because 2.x requires Node ≥ 22.19.
- `typescript` pinned to 6.0.x because `typescript-eslint` 8 supports `<6.1`.
- `jsdom` pinned to 29.x because 30.x requires Node ≥ 22.22.

## Commands

| Task | Command |
| --- | --- |
| Install | `npm install` |
| Dev (HTTPS, LAN-visible cert) | `npm run dev` → https://localhost:5173 |
| Dev on phone | `npm run dev:lan` → https://<LAN-IP>:5173 (see docs/deployment.md for trusting the cert) |
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

## Folder structure

```
src/
  lib/            money.ts (ALL money math/format), dates.ts (ALL date math, IST), ids, csv
  domain/         pure TS: types, ledger engine (validation + postings), metrics, budgets,
                  goals, recurring schedule, statements, reports, seed data
  data/           repository.ts (interface), demo/ (IndexedDB adapter), supabase/ (RPC adapter),
                  provider.tsx (picks backend), queries (cache + optimistic updates)
  motion/         springs.ts — the ONLY place spring presets are defined
  styles/         tokens.css (all design tokens), index.css
  components/     ui primitives (Sheet, Toast, Keypad, Skeleton, Glass…), cards/
  features/       home, activity, add, accounts, cards, plans, insights, settings, auth, design-lab
tests/
  vectors/        ledger test vectors (data) + runner, executed against BOTH adapters
  unit/           adapter + domain tests (jsdom)
  db/             Supabase integration tests (RLS, RPC, vectors) — need `npm run db:start`
e2e/              Playwright specs + screenshots
supabase/
  migrations/     schema, RLS, ledger RPC functions
  functions/      Edge Functions (assistant)
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

## Privacy rules (cards)

- Never persist card photos, full card numbers, CVV/CVC, PINs or credentials. OCR text stays in memory.
- Only issuer, network, type, display name, optional last 4 and sanitized template artwork are stored.
- Card data and images are never sent to any AI provider.
