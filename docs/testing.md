# Testing

| Suite | Command | Needs |
| --- | --- | --- |
| Unit + Demo adapter (jsdom) | `npm test` | nothing |
| Database (RLS, RPC, vectors, assistant SQL) | `npm run test:db` | `npm run db:start` + `.env.local` |
| End-to-end (Playwright, mobile + desktop) | `npm run test:e2e` | local Supabase; the assistant test also needs `npx supabase functions serve` |

## What is covered

**Ledger, run against both backends** (`tests/vectors`, 21 vectors × 2 adapters):
- **Basic postings:** ₹500 cash expense; ₹5,000 income; ₹2,000 transfer leaves totals unchanged.
- **Edits and deletes:** editing ₹500→₹700 changes totals by exactly ₹200 (and a date move changes
  the month). Delete reverses postings and restore re-posts them.
- **Credit cards:** ₹10,000 card purchase and repayment with no extra expense; partial repayments;
  refunds to card and to cash; fees and interest are expenses; statement balance vs current debt,
  including minimum due and the next period.
- **Reliability:** idempotent retries.
- **Plans:** budgets that exclude transfers and card payments; goals in both modes never counted
  as expenses; reconciliation adjustments that are neither income nor expense.
- **Recurring:** no duplicates; reminder mode waits; end-of-month and leap-year clamping;
  pause/resume never back-fills; cancelled can't resume; subscriptions charge once per period.
- **Validation:** identical error codes from both engines.

**Database** (`tests/db`):
- **Isolation:** RLS cross-user isolation; the browser role can't write ledger tables; anonymous
  callers can't run RPCs.
- **Retries:** five concurrent posts with one key make one row; a failed write then a retry makes
  no duplicate.
- **Card data:** card numbers, CVVs and forged seeded cards are rejected by the database itself.
- **Parity:** SQL vs TypeScript schedules for every day of 2024–2026, and SQL `category_totals`
  equals the TypeScript metrics.
- **Assistant:** its SQL tools reconcile with the ledger, are user-scoped, and never return card details.

**Unit** (`src/**/*.test.ts`, `tests/unit`):
- money (Indian grouping, float-free parsing, rounding), dates (IST, clamping)
- the schedule generator against its predicate
- statements, CSV columns, escaping and formula guard
- keypad and category suggestions, OCR parsing, card-face masking (including standard zones)
- reports reconciling with the ledger on the full demo dataset
- the optimistic store (instant update, synchronous validation, a lost response retried without
  duplicates, rollback, undo) and scheduled jobs
- WCAG AA contrast of every text token in both themes, and glass/reduced-motion fallbacks in CSS

**End-to-end** (`e2e`):
- **Add expense:** the full mobile flow against real Supabase (amount + one tap, the database
  holds one balanced row), undo, and keyboard-only add on desktop.
- **Card styles:** Settings → Card style (Stacked default, all three switch, persisted, applied to
  Accounts, keyboard operation, selection kept across styles).
- **Cards:** manual add with only sanitized fields in the database.
- **Scanning:**
  - the camera is requested only after Scan, and only once
  - denied, unsupported, blurry, cancel and "no text" paths all reach manual entry
  - a full scan with real on-device OCR: fields pre-filled and editable, and no card number in the
    database or localStorage
- **Accessibility:** reduced motion, glass falling back to solid with reduced transparency, theme
  persistence, first screens visible without waiting on deferred animation code.
- **Assistant:** setup state without a key.
- **Visual pass:** `e2e/screenshots.spec.ts` writes Home, Add sheet, Accounts, Card style, Insights
  and Plans at mobile and desktop widths in both themes to `e2e/.artifacts/screens/`.

## Latest results (2026-10-10)

- Unit + DB: **119 tests passed**, 0 failed.
- Playwright: **all specs passed** on the mobile (Pixel 7) and desktop projects. Tests that only
  apply to one viewport are skipped on the other.

## Performance (production build, measured with Playwright)

| Metric | Result |
| --- | --- |
| JS requested before Home renders (gzip) | **193.2 KB** desktop · 196.1 KB at 4× CPU + 1.6 Mbps |
| All JS after idle (Home) | 233.0 KB gzip |
| Cumulative layout shift (Home) | 0.000 |
| LCP, local server | ~0.4–0.8 s · ~2.9–4.2 s at 4× CPU + 1.6 Mbps |
| Add sheet open, 4× CPU | p95 frame 16.7 ms, 2 frames > 25 ms (was 9 before opaque sheets) |
| Card expand / sheet close, 4× CPU | p95 16.8 ms, 1–2 frames > 25 ms |

Frame numbers come from headless Chromium with software rendering and CPU throttling. They are
indicative, not a device measurement.
