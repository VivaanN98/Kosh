# Contributing

Thanks for helping. Kosh is a single-user personal finance app where **correctness comes first**.
Read `CLAUDE.md` (it doubles as the project's rules): money is integer paise, dates are IST
calendar dates, and every financial operation is a balanced ledger transaction.

```bash
npm install
npm run lint && npm run typecheck && npm test      # must pass
npm run test:db     # needs `npm run db:start` (Docker); run it when you touch supabase/migrations
npm run test:e2e    # Playwright
```

- Ledger changes need a vector in `tests/vectors`; it runs against both the Demo and Postgres engines.
- Keep secrets out of commits. `.env.local`, `.env.native.local`, keystores and `dist-apk/` are gitignored.
- Keep the privacy rules for cards (docs/security.md) intact.
- Small, focused pull requests with a short description of what and why are easiest to review.
