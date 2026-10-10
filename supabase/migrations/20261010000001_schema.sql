-- Kosh schema: ledger-first personal finance.
-- Money is bigint paise. Dates are calendar dates in Asia/Kolkata.
-- Every user-owned row carries user_id; composite foreign keys (id, user_id) make
-- cross-user references impossible even for security-definer code.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function private.today_ist() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

create or replace function private.days_in_month(d date) returns int
language sql immutable set search_path = '' as $$
  select extract(day from (date_trunc('month', d) + interval '1 month - 1 day'))::int
$$;

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Rejects strings that contain something shaped like a card number (12+ digits, allowing
-- spaces/dashes between them). Used on every free-text column a card could leak into.
create or replace function private.has_card_like_number(t text) returns boolean
language sql immutable set search_path = '' as $$
  select t is not null and regexp_replace(t, '[\s-]', '', 'g') ~ '[0-9]{12,}'
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 80),
  currency text not null default 'INR' check (currency = 'INR'),
  timezone text not null default 'Asia/Kolkata',
  seed_version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Accounts (user accounts + hidden system accounts income/expense/equity)
-- ---------------------------------------------------------------------------

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  kind text not null check (kind in ('cash', 'bank', 'credit_card', 'goal', 'income', 'expense', 'equity')),
  is_system boolean generated always as (kind in ('income', 'expense', 'equity')) stored,
  institution text check (institution is null or char_length(institution) <= 60),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  icon text check (icon is null or char_length(icon) <= 40),
  sort_order int not null default 0,
  archived_at timestamptz,
  reconciled_at timestamptz,
  reconciled_balance_paise bigint,
  seed_key text,
  creation_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, seed_key),
  unique (user_id, creation_key),
  check (not private.has_card_like_number(name)),
  check (not private.has_card_like_number(institution))
);

create unique index accounts_one_system_kind on public.accounts (user_id, kind) where is_system;
create index accounts_user_idx on public.accounts (user_id, sort_order);

create trigger accounts_touch before update on public.accounts
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Categories (two levels: category → subcategory)
-- ---------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid,
  kind text not null check (kind in ('expense', 'income')),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  icon text check (icon is null or char_length(icon) <= 40),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order int not null default 0,
  archived_at timestamptz,
  seed_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, seed_key),
  unique nulls not distinct (user_id, kind, parent_id, name),
  foreign key (parent_id, user_id) references public.categories (id, user_id) on delete cascade,
  check (parent_id is null or parent_id <> id)
);

create index categories_user_idx on public.categories (user_id, kind, sort_order);

create or replace function private.categories_check_parent() returns trigger
language plpgsql set search_path = '' as $$
declare
  parent public.categories;
begin
  if new.parent_id is null then
    return new;
  end if;
  select * into parent from public.categories where id = new.parent_id and user_id = new.user_id;
  if parent.parent_id is not null then
    raise exception 'KOSH:INVALID_INPUT: subcategories cannot be nested' using errcode = 'P0001';
  end if;
  if parent.kind <> new.kind then
    raise exception 'KOSH:CATEGORY_KIND_MISMATCH: subcategory kind must match its parent' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger categories_check_parent before insert or update on public.categories
  for each row execute function private.categories_check_parent();
create trigger categories_touch before update on public.categories
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Payment cards (instruments linked to an account; never hold a balance)
-- ---------------------------------------------------------------------------

create table public.payment_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null,
  issuer text not null check (char_length(btrim(issuer)) between 1 and 60),
  network text not null check (network in ('visa', 'mastercard', 'rupay', 'amex', 'diners', 'discover', 'jcb', 'unionpay', 'other')),
  card_type text not null check (card_type in ('debit', 'credit', 'prepaid')),
  display_name text check (display_name is null or char_length(display_name) <= 60),
  last4 text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  artwork jsonb not null default '{}'::jsonb check (jsonb_typeof(artwork) = 'object' and octet_length(artwork::text) <= 4096),
  source text not null default 'manual' check (source in ('seed', 'manual', 'scan')),
  sort_order int not null default 0,
  seed_key text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, seed_key),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  -- Privacy: no card-number-shaped digits anywhere in stored card text or artwork.
  check (not private.has_card_like_number(issuer)),
  check (not private.has_card_like_number(display_name)),
  check (not private.has_card_like_number(artwork::text))
);

create index payment_cards_user_idx on public.payment_cards (user_id, sort_order);
create index payment_cards_account_idx on public.payment_cards (account_id);

create or replace function private.payment_cards_check_account() returns trigger
language plpgsql set search_path = '' as $$
declare
  k text;
begin
  select kind into k from public.accounts where id = new.account_id and user_id = new.user_id;
  if (new.card_type = 'credit' and k <> 'credit_card')
     or (new.card_type = 'debit' and k <> 'bank')
     or (new.card_type = 'prepaid' and k not in ('bank', 'cash')) then
    raise exception 'KOSH:INVALID_ACCOUNT_KIND: a % card cannot link to a % account', new.card_type, k using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger payment_cards_check_account before insert or update on public.payment_cards
  for each row execute function private.payment_cards_check_account();
create trigger payment_cards_touch before update on public.payment_cards
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Transactions + ledger entries
-- ---------------------------------------------------------------------------

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('expense', 'income', 'transfer', 'card_payment', 'refund', 'opening_balance', 'adjustment', 'goal_transfer')),
  amount_paise bigint not null check (abs(amount_paise) <= 1000000000000000),
  occurred_on date not null,
  account_id uuid not null,
  to_account_id uuid,
  category_id uuid,
  merchant text check (merchant is null or char_length(merchant) <= 80),
  note text check (note is null or char_length(note) <= 500),
  payment_card_id uuid,
  refund_of uuid,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  deleted_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, idempotency_key),
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (to_account_id, user_id) references public.accounts (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id),
  foreign key (payment_card_id, user_id) references public.payment_cards (id, user_id) on delete set null (payment_card_id),
  foreign key (refund_of, user_id) references public.transactions (id, user_id),
  check ((type in ('opening_balance', 'adjustment') and amount_paise <> 0) or amount_paise > 0),
  check ((type in ('transfer', 'card_payment', 'goal_transfer')) = (to_account_id is not null)),
  check (to_account_id is null or to_account_id <> account_id),
  check (type in ('expense', 'income', 'refund') or category_id is null),
  check (refund_of is null or type = 'refund'),
  check (not private.has_card_like_number(merchant)),
  check (not private.has_card_like_number(note))
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc, created_at desc) where deleted_at is null;
create index transactions_account_idx on public.transactions (account_id);
create index transactions_to_account_idx on public.transactions (to_account_id) where to_account_id is not null;
create index transactions_category_idx on public.transactions (category_id) where category_id is not null;
create index transactions_refund_of_idx on public.transactions (refund_of) where refund_of is not null;
create index transactions_card_idx on public.transactions (payment_card_id) where payment_card_id is not null;

create trigger transactions_touch before update on public.transactions
  for each row execute function private.touch_updated_at();

create table public.ledger_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid not null,
  account_id uuid not null,
  category_id uuid,
  amount_paise bigint not null check (amount_paise <> 0),
  occurred_on date not null,
  created_at timestamptz not null default now(),
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade,
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id)
);

create index ledger_entries_tx_idx on public.ledger_entries (transaction_id);
create index ledger_entries_account_date_idx on public.ledger_entries (account_id, occurred_on);
create index ledger_entries_user_date_idx on public.ledger_entries (user_id, occurred_on);

-- Double-entry invariant: each transaction's entries sum to zero at commit time.
create or replace function private.ledger_check_balanced() returns trigger
language plpgsql set search_path = '' as $$
declare
  tx uuid := coalesce(new.transaction_id, old.transaction_id);
  total bigint;
begin
  select coalesce(sum(amount_paise), 0) into total from public.ledger_entries where transaction_id = tx;
  if total <> 0 then
    raise exception 'KOSH:UNBALANCED: transaction % entries sum to %', tx, total using errcode = 'P0001';
  end if;
  return null;
end $$;

create constraint trigger ledger_entries_balanced
  after insert or update or delete on public.ledger_entries
  deferrable initially deferred
  for each row execute function private.ledger_check_balanced();

-- Balances derived from the ledger. security_invoker keeps RLS in force for callers.
create view public.account_balances with (security_invoker = true) as
  select a.id as account_id, a.user_id, coalesce(sum(e.amount_paise), 0)::bigint as balance_paise
  from public.accounts a
  left join public.ledger_entries e on e.account_id = a.id
  group by a.id, a.user_id;

-- ---------------------------------------------------------------------------
-- Budgets
-- ---------------------------------------------------------------------------

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid,
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 1000000000000000),
  warn_at_pct int not null default 80 check (warn_at_pct between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (user_id, category_id),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

create trigger budgets_touch before update on public.budgets
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Savings goals
-- ---------------------------------------------------------------------------

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  target_paise bigint not null check (target_paise > 0 and target_paise <= 1000000000000000),
  deadline date,
  mode text not null check (mode in ('earmark', 'account')),
  account_id uuid,
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  icon text check (icon is null or char_length(icon) <= 40),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  check (mode <> 'account' or account_id is not null)
);

create unique index savings_goals_one_per_goal_account on public.savings_goals (account_id) where mode = 'account';

create trigger savings_goals_touch before update on public.savings_goals
  for each row execute function private.touch_updated_at();

create or replace function private.savings_goals_check() returns trigger
language plpgsql set search_path = '' as $$
declare
  k text;
begin
  if tg_op = 'UPDATE' and (new.mode <> old.mode or new.account_id is distinct from old.account_id) and old.mode = 'account' then
    raise exception 'KOSH:INVALID_INPUT: an account-backed goal cannot change its account' using errcode = 'P0001';
  end if;
  if new.account_id is not null then
    select kind into k from public.accounts where id = new.account_id and user_id = new.user_id;
    if new.mode = 'account' and k <> 'goal' then
      raise exception 'KOSH:INVALID_ACCOUNT_KIND: account-backed goals need a goal account' using errcode = 'P0001';
    end if;
    if new.mode = 'earmark' and k not in ('cash', 'bank') then
      raise exception 'KOSH:INVALID_ACCOUNT_KIND: earmarks sit in a cash or bank account' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger savings_goals_check before insert or update on public.savings_goals
  for each row execute function private.savings_goals_check();

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid not null,
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 1000000000000000),
  contributed_on date not null,
  account_id uuid,
  transaction_id uuid unique,
  note text check (note is null or char_length(note) <= 200),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  foreign key (goal_id, user_id) references public.savings_goals (id, user_id) on delete cascade,
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete set null (transaction_id)
);

create index goal_contributions_goal_idx on public.goal_contributions (goal_id, contributed_on);

create trigger goal_contributions_touch before update on public.goal_contributions
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Recurring rules + occurrences
-- ---------------------------------------------------------------------------

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  type text not null check (type in ('expense', 'income', 'transfer', 'card_payment')),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 1000000000000000),
  account_id uuid not null,
  to_account_id uuid,
  category_id uuid,
  merchant text check (merchant is null or char_length(merchant) <= 80),
  note text check (note is null or char_length(note) <= 500),
  payment_card_id uuid,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  interval_count int not null default 1 check (interval_count between 1 and 365),
  start_on date not null,
  end_on date,
  anchor_day smallint check (anchor_day is null or anchor_day between 1 and 31),
  -- Set when a paused rule resumes, so the paused window is never back-filled.
  active_from date,
  mode text not null default 'reminder' check (mode in ('reminder', 'automatic')),
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  foreign key (to_account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id),
  foreign key (payment_card_id, user_id) references public.payment_cards (id, user_id) on delete set null (payment_card_id),
  check (end_on is null or end_on >= start_on),
  check ((type in ('transfer', 'card_payment')) = (to_account_id is not null)),
  check (type in ('expense', 'income') or category_id is null),
  check (not private.has_card_like_number(name)),
  check (not private.has_card_like_number(merchant)),
  check (not private.has_card_like_number(note))
);

create index recurring_rules_user_idx on public.recurring_rules (user_id, status);

create trigger recurring_rules_touch before update on public.recurring_rules
  for each row execute function private.touch_updated_at();

create table public.recurring_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  rule_id uuid not null,
  due_on date not null,
  status text not null default 'pending' check (status in ('pending', 'posted', 'skipped')),
  transaction_id uuid unique,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  -- Duplicate prevention: one occurrence per rule per due date, ever.
  unique (rule_id, due_on),
  foreign key (rule_id, user_id) references public.recurring_rules (id, user_id) on delete cascade,
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete set null (transaction_id)
);

create index recurring_occurrences_user_idx on public.recurring_occurrences (user_id, status, due_on);

-- ---------------------------------------------------------------------------
-- Subscriptions (charges only ever come from the linked recurring rule)
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  recurring_rule_id uuid not null unique,
  website text check (website is null or char_length(website) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (recurring_rule_id, user_id) references public.recurring_rules (id, user_id) on delete cascade
);

create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Credit card settings + statements
-- ---------------------------------------------------------------------------

create table public.credit_card_settings (
  account_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  credit_limit_paise bigint check (credit_limit_paise is null or credit_limit_paise > 0),
  statement_day smallint not null check (statement_day between 1 and 31),
  due_days smallint not null default 20 check (due_days between 1 and 60),
  min_due_bps int not null default 500 check (min_due_bps between 0 and 10000),
  min_due_floor_paise bigint not null default 20000 check (min_due_floor_paise >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade
);

create or replace function private.credit_card_settings_check() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select kind from public.accounts where id = new.account_id and user_id = new.user_id) <> 'credit_card' then
    raise exception 'KOSH:INVALID_ACCOUNT_KIND: settings apply to credit card accounts only' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger credit_card_settings_check before insert or update on public.credit_card_settings
  for each row execute function private.credit_card_settings_check();
create trigger credit_card_settings_touch before update on public.credit_card_settings
  for each row execute function private.touch_updated_at();

create table public.card_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null,
  period_start date not null,
  period_end date not null,
  due_on date not null,
  statement_balance_paise bigint not null,
  minimum_due_paise bigint not null check (minimum_due_paise >= 0),
  created_at timestamptz not null default now(),
  unique (account_id, period_end),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  check (period_end >= period_start and due_on > period_end)
);

create index card_statements_account_idx on public.card_statements (account_id, period_end desc);
