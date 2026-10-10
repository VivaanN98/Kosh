# Architecture

## Layers

```
UI (features/*, components/*)           React 19, Motion, Tailwind tokens
  │  useSnapshot / useDerived
Client store (data/store.ts)            in-memory mirror, optimistic writes, retries, reconciliation
  │  Repository interface (data/repository.ts)
  ├─ Demo adapter (data/demo/*)         IndexedDB + TypeScript ledger engine
  └─ Supabase adapter (data/supabase/*) PostgREST reads + security-definer RPC writes
                                        │
                                        Postgres: ledger functions, RLS, constraints
Domain (domain/*)                       pure TS: engine, metrics, budgets, reports, schedules
Money & dates (lib/money.ts, lib/dates.ts) — the only places currency and calendar math happen
```

The UI never knows which backend it uses. `BackendProvider` picks Supabase when
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set (sign-in required), otherwise Demo Mode.
Demo Mode is never used silently with Supabase configured: only through the explicit "Explore Demo
Mode" button, and a persistent **Demo Mode** badge is shown.

## The ledger

- Amounts are integer paise. Dates are calendar dates in Asia/Kolkata.
- Every financial operation is one `transactions` row plus balanced `ledger_entries`
  (sum = 0, enforced by a deferred constraint trigger in Postgres and checked in TypeScript).
  The sign convention is debit-positive: an asset's balance is Σ entries; card debt is −Σ entries.
- Each user has hidden `income`, `expense` and `equity` accounts. Spending is, by definition, the
  activity on the expense account, so transfers, card payments and goal moves can't count as spending.

| Type | Postings |
| --- | --- |
| expense | paying account −A · expense(category) +A |
| refund | paying account +A · expense(category) −A |
| income | receiving account +A · income(category) −A |
| transfer / card_payment / goal_transfer | from −A · to +A |
| opening_balance / adjustment | account ±A · equity ∓A |

Postings are built in exactly two places that must agree: `domain/ledger/engine.ts` (Demo) and
`private.post_entries` (Postgres). The 21 **shared vectors** in `tests/vectors` run against both
adapters, and `tests/db/schedule-parity.test.ts` compares the SQL and TypeScript recurring
schedules for every day of three years.

## Client store

`data/store.ts` keeps the user's ledger in memory:

1. **Optimistic writes.** `beginPost` validates with the same engine, inserts the transaction and
   its postings locally (the UI updates in under 100 ms), then sends the RPC with an idempotency key.
2. **Retries.** Network failures retry with the same key, so a lost response never duplicates.
3. **Rollback.** A server rejection removes only that optimistic row.
4. **Reconciliation.** After writes settle, the authoritative ledger is re-fetched and replaces
   the mirror.

All derived numbers (`useDerived`) are computed from ledger entries by `domain/ledger/metrics.ts`.

## Scheduled jobs

Recurring occurrences and card statements are materialised on load and whenever the app returns to
the foreground (at most every 5 minutes). The client computes due dates; the server re-checks them
(`private.is_scheduled`) and a unique `(rule_id, due_on)` constraint makes it idempotent.

## Cards

- **Cards are payment instruments** linked to an account; they never hold a balance.
- **Wallet styles:** the three styles share `CardFace`, `WalletFrame` and one `WalletProvider`
  (selection state), and the style is picked in Settings (`useCardVariant`).
- **Scanning:** `features/cards/scan` takes the camera frame, then runs on-device OCR (tesseract.js),
  the parser (`domain/cards/ocrParse.ts`), template artwork extraction and face masking. See
  [security.md](security.md).

## Native and offline

- **PWA:** vite-plugin-pwa precaches the app shell, caches the OCR engine on first use, and never
  caches API calls.
- **Android:** Capacitor wraps the same web build (`--mode native`), served from `https://localhost`
  in the WebView. `src/native/native.ts` handles the hardware back button and system-bar styling.

## Performance choices

- Every route and heavy library (Recharts, OCR, the card styles) is lazy.
- Motion's animation features, the Add-sheet preload, the transaction detail sheet and PWA
  registration load after the first page paints. First screens render in their final state.
- Only `transform` and `opacity` animate. Springs come from `motion/springs.ts`.
