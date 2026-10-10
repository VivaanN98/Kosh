# Database

Postgres via Supabase. The schema is in `supabase/migrations/`:

| Migration | Contents |
| --- | --- |
| `…01_schema.sql` | tables, constraints, indexes, the balanced-ledger trigger, `account_balances` view |
| `…02_rls.sql` | row-level security and least-privilege grants |
| `…03_ledger_functions.sql` | validation, postings, every money-moving RPC, per-user seeding |
| `…04_assistant_queries.sql` | read-only query functions for the AI assistant |

## Tables

| Table | Purpose |
| --- | --- |
| `profiles` | one row per user (display name, currency INR, timezone, seed version) |
| `accounts` | cash, bank, credit_card, goal and the hidden income/expense/equity accounts |
| `categories` | two-level categories (category → subcategory), expense or income |
| `transactions` | one row per financial event; soft-deleted (`deleted_at`) so undo can restore |
| `ledger_entries` | balanced, debit-positive postings; the only source of balances and totals |
| `budgets` | monthly limit, overall (`category_id` null) or per category, with a warning % |
| `savings_goals` | target, deadline, mode `earmark` or `account` (dedicated goal account) |
| `goal_contributions` | earmark amounts, or links to the `goal_transfer` that moved the money |
| `recurring_rules` | schedule (frequency, interval, anchor day, start/end), mode reminder/automatic, status |
| `recurring_occurrences` | one per rule per due date (unique): pending, posted or skipped |
| `subscriptions` | name and website; owns exactly one recurring rule (charges only via the rule) |
| `payment_cards` | issuer, network, type, display name, optional last 4, template artwork JSON |
| `credit_card_settings` | statement day, days to pay, minimum due rule, credit limit |
| `card_statements` | statement snapshots: period, balance at statement date, minimum due, due date |

**Integrity:**
- Money columns are `bigint` paise.
- Every user-owned row has `user_id`, and every foreign key between user rows is composite
  `(id, user_id)`, so a row can never point at another user's data.
- Check constraints reject card-number-shaped text (12+ digits) in every free-text column.
- `payment_cards.artwork` is limited to 4 KB of JSON, so no images are stored.

## Writes go through RPC functions

The browser can read its own rows (RLS) but cannot insert into or update `transactions`,
`ledger_entries`, `goal_contributions`, `recurring_occurrences` or `card_statements`.

| Function | What it does |
| --- | --- |
| `post_transaction(p_input, p_idempotency_key)` | validate + insert + post entries; same key returns the existing row |
| `update_transaction(p_id, p_input, p_expected_version)` | re-validate and re-post atomically; optimistic concurrency |
| `delete_transaction(p_id)` / `restore_transaction(p_id)` | soft delete removes postings / re-validate and re-post |
| `create_account(p_input, key)` | account + opening balance (+ card settings) in one transaction |
| `reconcile_account(id, actual, as_of, key)` | posts the difference against equity (not income/expense) |
| `create_goal`, `add_goal_contribution`, `update_goal_contribution`, `delete_goal_contribution`, `withdraw_from_goal` | goals in both modes |
| `materialize_occurrence(rule, due)`, `confirm_occurrence`, `skip_occurrence` | recurring; unique per rule/date |
| `create_subscription(p_input)` | rule + subscription atomically |
| `close_card_statement(account, period_end)` | statement snapshot from the ledger |
| `ensure_user_setup()` | idempotent seeding (also run by a trigger on sign-up) |
| `category_totals(from, to)` | security-invoker report used to cross-check TypeScript metrics |

Errors are raised as `KOSH:<CODE>: message` and mapped to typed errors in the client.

## Seeding

Each new user gets the system accounts, the default categories, **SBI Savings** and **Indian Bank
Savings**, and the two cards (SBI Global International Visa Debit, Indian Bank Debit Platinum RuPay).
No numbers or expiry dates are seeded. Seeding runs once per user (`profiles.seed_version`), so a card
you delete is not re-created.

## CSV export

**Settings → Export all as CSV** exports every transaction. **Activity → download** exports the
current filtered view. The file is UTF-8 with a BOM (opens correctly in Excel) and CRLF line endings.

| Column | Meaning |
| --- | --- |
| `transaction_id` | stable id |
| `date` | calendar date, `YYYY-MM-DD` (Asia/Kolkata) |
| `type` | expense, income, transfer, card_payment, refund, opening_balance, adjustment, goal_transfer |
| `amount_inr` | plain decimal rupees, e.g. `1234.50` (positive, except signed opening balances/adjustments) |
| `direction` | `out`, `in` or `move` (between your own accounts) |
| `account` | paying / receiving / source account name |
| `to_account` | destination account for transfers, card payments and goal transfers |
| `category` | category as recorded (may be a subcategory) |
| `category_group` | top-level category |
| `merchant` | merchant or payer |
| `note` | note |
| `payment_card` | card used, if recorded |
| `refund_of` | id of the original expense for refunds |
| `created_at` | when it was recorded (UTC timestamp) |

Text cells starting with `= + - @` are prefixed with `'` so spreadsheets never run them as formulas.
Deleted transactions are excluded.
