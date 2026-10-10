-- Ledger functions. The ONLY way money moves in Supabase mode.
--
-- Mirrors src/domain/ledger/engine.ts. Shared vectors (tests/vectors) run against both.
-- Error messages start with "KOSH:<CODE>:" so clients map them to typed errors.

-- ---------------------------------------------------------------------------
-- Plumbing
-- ---------------------------------------------------------------------------

create or replace function private.fail(code text, msg text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  raise exception 'KOSH:%: %', code, msg using errcode = 'P0001';
end $$;

create or replace function private.require_user() returns uuid
language plpgsql stable set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    perform private.fail('UNAUTHENTICATED', 'sign in required');
  end if;
  return uid;
end $$;

create or replace function private.check_key(k text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if k is null or char_length(k) not between 8 and 200 then
    perform private.fail('INVALID_INPUT', 'idempotency key must be 8-200 characters');
  end if;
end $$;

create or replace function private.check_date(d date) returns void
language plpgsql stable set search_path = '' as $$
begin
  if d is null or d < date '2000-01-01' or d > private.today_ist() + 366 then
    perform private.fail('INVALID_DATE', 'date must be between 2000-01-01 and one year from today');
  end if;
end $$;

create or replace function private.system_account(p_user uuid, p_kind text) returns uuid
language plpgsql stable set search_path = '' as $$
declare
  a uuid;
begin
  select id into a from public.accounts where user_id = p_user and kind = p_kind and is_system;
  if a is null then
    perform private.fail('SETUP_REQUIRED', 'system accounts missing; call ensure_user_setup');
  end if;
  return a;
end $$;

-- Build a transactions row from client JSON. Unknown/invalid casts become INVALID_INPUT.
create or replace function private.tx_from_json(p jsonb, p_user uuid) returns public.transactions
language plpgsql stable set search_path = '' as $$
declare
  t public.transactions;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    perform private.fail('INVALID_INPUT', 'input must be an object');
  end if;
  begin
    t.user_id := p_user;
    t.type := p ->> 'type';
    t.amount_paise := (p ->> 'amount')::bigint;
    t.occurred_on := (p ->> 'occurred_on')::date;
    t.account_id := (p ->> 'account_id')::uuid;
    t.to_account_id := (p ->> 'to_account_id')::uuid;
    t.category_id := (p ->> 'category_id')::uuid;
    t.merchant := p ->> 'merchant';
    t.note := p ->> 'note';
    t.payment_card_id := (p ->> 'payment_card_id')::uuid;
    t.refund_of := (p ->> 'refund_of')::uuid;
  exception when others then
    perform private.fail('INVALID_INPUT', 'malformed transaction input');
  end;
  return t;
end $$;

-- ---------------------------------------------------------------------------
-- Validation (mirror of engine.validateTransaction)
-- ---------------------------------------------------------------------------

create or replace function private.validate_tx(t public.transactions, old_t public.transactions)
returns public.transactions
language plpgsql stable set search_path = '' as $$
declare
  is_new boolean := old_t.id is null;
  acct public.accounts;
  to_acct public.accounts;
  cat public.categories;
  card public.payment_cards;
  orig public.transactions;
  refunded bigint;
begin
  t.merchant := nullif(btrim(t.merchant), '');
  t.note := nullif(btrim(t.note), '');

  if t.type is null or t.type not in ('expense', 'income', 'transfer', 'card_payment', 'refund', 'opening_balance', 'adjustment', 'goal_transfer') then
    perform private.fail('INVALID_INPUT', 'unknown transaction type');
  end if;
  if t.amount_paise is null or abs(t.amount_paise) > 1000000000000000 then
    perform private.fail('INVALID_AMOUNT', 'amount is missing or too large');
  end if;
  if t.type in ('opening_balance', 'adjustment') then
    if t.amount_paise = 0 then
      perform private.fail('INVALID_AMOUNT', 'amount cannot be zero');
    end if;
  elsif t.amount_paise <= 0 then
    perform private.fail('INVALID_AMOUNT', 'amount must be positive');
  end if;
  perform private.check_date(t.occurred_on);

  if not is_new and old_t.type <> t.type
     and (old_t.type in ('opening_balance', 'adjustment', 'goal_transfer') or t.type in ('opening_balance', 'adjustment', 'goal_transfer')) then
    perform private.fail('INVALID_INPUT', 'this transaction type cannot be changed');
  end if;
  if not is_new and old_t.type = 'goal_transfer'
     and (t.account_id <> old_t.account_id or t.to_account_id is distinct from old_t.to_account_id) then
    perform private.fail('INVALID_INPUT', 'edit goal contributions from the goal');
  end if;

  select * into acct from public.accounts where id = t.account_id and user_id = t.user_id and not is_system;
  if acct.id is null then
    perform private.fail('ACCOUNT_NOT_FOUND', 'account not found');
  end if;
  if acct.archived_at is not null and (is_new or old_t.account_id <> t.account_id) then
    perform private.fail('ACCOUNT_ARCHIVED', 'account is archived');
  end if;

  if t.type in ('transfer', 'card_payment', 'goal_transfer') then
    if t.to_account_id is null then
      perform private.fail('INVALID_INPUT', 'destination account required');
    end if;
    if t.to_account_id = t.account_id then
      perform private.fail('SAME_ACCOUNT', 'source and destination must differ');
    end if;
    select * into to_acct from public.accounts where id = t.to_account_id and user_id = t.user_id and not is_system;
    if to_acct.id is null then
      perform private.fail('ACCOUNT_NOT_FOUND', 'destination account not found');
    end if;
    if to_acct.archived_at is not null and (is_new or old_t.to_account_id is distinct from t.to_account_id) then
      perform private.fail('ACCOUNT_ARCHIVED', 'destination account is archived');
    end if;
  elsif t.to_account_id is not null then
    perform private.fail('INVALID_INPUT', 'only transfers have a destination account');
  end if;

  if t.type in ('expense', 'income', 'refund') then
    if acct.kind not in ('cash', 'bank', 'credit_card') then
      perform private.fail('INVALID_ACCOUNT_KIND', 'use a cash, bank or credit card account');
    end if;
  elsif t.type = 'transfer' then
    if acct.kind not in ('cash', 'bank', 'credit_card') or to_acct.kind not in ('cash', 'bank', 'credit_card') then
      perform private.fail('INVALID_ACCOUNT_KIND', 'transfers move money between cash, bank and card accounts');
    end if;
    if to_acct.kind = 'credit_card' and acct.kind in ('cash', 'bank') then
      perform private.fail('USE_CARD_PAYMENT', 'paying a credit card is a card payment');
    end if;
  elsif t.type = 'card_payment' then
    if acct.kind not in ('cash', 'bank') or to_acct.kind <> 'credit_card' then
      perform private.fail('INVALID_ACCOUNT_KIND', 'card payments go from cash or bank to a credit card');
    end if;
  elsif t.type = 'goal_transfer' then
    if not ((acct.kind in ('cash', 'bank') and to_acct.kind = 'goal') or (acct.kind = 'goal' and to_acct.kind in ('cash', 'bank'))) then
      perform private.fail('INVALID_ACCOUNT_KIND', 'goal transfers move money between a goal account and cash or bank');
    end if;
  end if;

  if t.refund_of is not null then
    if t.type <> 'refund' then
      perform private.fail('INVALID_INPUT', 'only refunds link to an original expense');
    end if;
    select * into orig from public.transactions where id = t.refund_of and user_id = t.user_id;
    if orig.id is null or orig.type <> 'expense' or orig.deleted_at is not null then
      perform private.fail('REFUND_TARGET_INVALID', 'refunds must link to an existing expense');
    end if;
    t.category_id := orig.category_id;
    select coalesce(sum(amount_paise), 0) into refunded
      from public.transactions
      where refund_of = orig.id and deleted_at is null and id <> t.id;
    if refunded + t.amount_paise > orig.amount_paise then
      perform private.fail('REFUND_EXCEEDS_ORIGINAL', 'refunds cannot exceed the original expense');
    end if;
  end if;

  if not is_new and old_t.type = 'expense' then
    select coalesce(sum(amount_paise), 0) into refunded
      from public.transactions where refund_of = t.id and deleted_at is null;
    if refunded > 0 and t.type <> 'expense' then
      perform private.fail('HAS_REFUNDS', 'this expense has refunds');
    end if;
    if refunded > t.amount_paise then
      perform private.fail('REFUND_EXCEEDS_ORIGINAL', 'amount is below what was already refunded');
    end if;
  end if;

  if t.type in ('expense', 'income', 'refund') then
    if t.category_id is null then
      perform private.fail('CATEGORY_REQUIRED', 'choose a category');
    end if;
    select * into cat from public.categories where id = t.category_id and user_id = t.user_id;
    if cat.id is null then
      perform private.fail('CATEGORY_NOT_FOUND', 'category not found');
    end if;
    if (t.type in ('expense', 'refund') and cat.kind <> 'expense') or (t.type = 'income' and cat.kind <> 'income') then
      perform private.fail('CATEGORY_KIND_MISMATCH', 'category kind does not match the transaction');
    end if;
  elsif t.category_id is not null then
    perform private.fail('INVALID_INPUT', 'this transaction type has no category');
  end if;

  if t.payment_card_id is not null then
    select * into card from public.payment_cards where id = t.payment_card_id and user_id = t.user_id;
    if card.id is null then
      perform private.fail('CARD_NOT_FOUND', 'card not found');
    end if;
    if card.account_id <> t.account_id then
      perform private.fail('CARD_ACCOUNT_MISMATCH', 'card is not linked to this account');
    end if;
  end if;

  if private.has_card_like_number(t.merchant) or private.has_card_like_number(t.note) then
    perform private.fail('SENSITIVE_DATA', 'text looks like a card number');
  end if;
  return t;
end $$;

-- ---------------------------------------------------------------------------
-- Postings (mirror of engine.buildPostings). Debit-positive.
-- ---------------------------------------------------------------------------

create or replace function private.post_entries(t public.transactions) returns void
language plpgsql set search_path = '' as $$
declare
  nominal uuid;
begin
  delete from public.ledger_entries where transaction_id = t.id;
  if t.deleted_at is not null then
    return;
  end if;

  if t.type in ('expense', 'refund') then
    nominal := private.system_account(t.user_id, 'expense');
  elsif t.type = 'income' then
    nominal := private.system_account(t.user_id, 'income');
  elsif t.type in ('opening_balance', 'adjustment') then
    nominal := private.system_account(t.user_id, 'equity');
  end if;

  insert into public.ledger_entries (user_id, transaction_id, account_id, category_id, amount_paise, occurred_on)
  select t.user_id, t.id, x.account_id, x.category_id, x.amount, t.occurred_on
  from (
    values
      -- expense: money leaves the paying account (or card debt grows); expense account debited
      (case t.type when 'expense' then t.account_id end, null::uuid, -t.amount_paise),
      (case t.type when 'expense' then nominal end, t.category_id, t.amount_paise),
      -- refund: money returns (or card debt shrinks); expense account credited
      (case t.type when 'refund' then t.account_id end, null::uuid, t.amount_paise),
      (case t.type when 'refund' then nominal end, t.category_id, -t.amount_paise),
      -- income: receiving account debited; income account credited
      (case t.type when 'income' then t.account_id end, null::uuid, t.amount_paise),
      (case t.type when 'income' then nominal end, t.category_id, -t.amount_paise),
      -- transfer-like: two of the user's accounts, nothing nominal
      (case when t.type in ('transfer', 'card_payment', 'goal_transfer') then t.account_id end, null::uuid, -t.amount_paise),
      (case when t.type in ('transfer', 'card_payment', 'goal_transfer') then t.to_account_id end, null::uuid, t.amount_paise),
      -- opening balance / adjustment: signed delta against equity
      (case when t.type in ('opening_balance', 'adjustment') then t.account_id end, null::uuid, t.amount_paise),
      (case when t.type in ('opening_balance', 'adjustment') then nominal end, null::uuid, -t.amount_paise)
  ) as x (account_id, category_id, amount)
  where x.account_id is not null;
end $$;

-- Insert a fully-validated new transaction and its postings. Returns the existing row when the
-- idempotency key was already used (including by a concurrent request).
create or replace function private.insert_tx(t public.transactions) returns public.transactions
language plpgsql set search_path = '' as $$
declare
  saved public.transactions;
begin
  select * into saved from public.transactions where user_id = t.user_id and idempotency_key = t.idempotency_key;
  if saved.id is not null then
    return saved;
  end if;
  t.id := coalesce(t.id, gen_random_uuid());
  t := private.validate_tx(t, null);
  t.version := 1;
  t.deleted_at := null;
  t.created_at := now();
  t.updated_at := now();
  insert into public.transactions select (t).* on conflict (user_id, idempotency_key) do nothing returning * into saved;
  if saved.id is null then
    select * into saved from public.transactions where user_id = t.user_id and idempotency_key = t.idempotency_key;
    return saved;
  end if;
  perform private.post_entries(saved);
  return saved;
end $$;

create or replace function private.apply_update(old_t public.transactions, t public.transactions)
returns public.transactions
language plpgsql set search_path = '' as $$
declare
  saved public.transactions;
begin
  t.id := old_t.id;
  t.user_id := old_t.user_id;
  t.idempotency_key := old_t.idempotency_key;
  t := private.validate_tx(t, old_t);
  update public.transactions set
    type = t.type,
    amount_paise = t.amount_paise,
    occurred_on = t.occurred_on,
    account_id = t.account_id,
    to_account_id = t.to_account_id,
    category_id = t.category_id,
    merchant = t.merchant,
    note = t.note,
    payment_card_id = t.payment_card_id,
    refund_of = t.refund_of,
    version = old_t.version + 1
  where id = old_t.id
  returning * into saved;
  perform private.post_entries(saved);
  if saved.type = 'goal_transfer' then
    update public.goal_contributions
      set amount_paise = saved.amount_paise, contributed_on = saved.occurred_on
      where transaction_id = saved.id;
  end if;
  return saved;
end $$;

create or replace function private.soft_delete_tx(old_t public.transactions) returns void
language plpgsql set search_path = '' as $$
begin
  if old_t.deleted_at is not null then
    return;
  end if;
  if exists (select 1 from public.transactions where refund_of = old_t.id and deleted_at is null) then
    perform private.fail('HAS_REFUNDS', 'delete the refunds first');
  end if;
  update public.transactions set deleted_at = now(), version = version + 1 where id = old_t.id;
  delete from public.ledger_entries where transaction_id = old_t.id;
end $$;

-- ---------------------------------------------------------------------------
-- Seeding (mirror of src/domain/seed.ts)
-- ---------------------------------------------------------------------------

create or replace function private.seed_user(p_user uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v int;
  parent uuid;
  c record;
  sbi uuid;
  ib uuid;
begin
  insert into public.profiles (id) values (p_user) on conflict (id) do nothing;
  select seed_version into v from public.profiles where id = p_user for update;
  if v >= 1 then
    return;
  end if;

  insert into public.accounts (user_id, name, kind, sort_order) values
    (p_user, 'Income', 'income', 0), (p_user, 'Expenses', 'expense', 0), (p_user, 'Equity', 'equity', 0)
  on conflict (user_id, kind) where is_system do nothing;

  for c in
    select * from (values
      (1, 'food', 'expense', 'Food & Dining', 'utensils', '#f2a65a', null::text),
      (2, 'food.groceries', 'expense', 'Groceries', 'shopping-basket', null, 'food'),
      (3, 'food.restaurants', 'expense', 'Restaurants', 'utensils-crossed', null, 'food'),
      (4, 'food.delivery', 'expense', 'Food Delivery', 'bike', null, 'food'),
      (5, 'food.cafe', 'expense', 'Coffee & Snacks', 'coffee', null, 'food'),
      (6, 'transport', 'expense', 'Transport', 'car', '#7aa2f7', null),
      (7, 'transport.fuel', 'expense', 'Fuel', 'fuel', null, 'transport'),
      (8, 'transport.cab', 'expense', 'Cab & Auto', 'car-taxi-front', null, 'transport'),
      (9, 'transport.transit', 'expense', 'Metro & Bus', 'train-front', null, 'transport'),
      (10, 'transport.parking', 'expense', 'Parking & Tolls', 'square-parking', null, 'transport'),
      (11, 'shopping', 'expense', 'Shopping', 'shopping-bag', '#e98bb7', null),
      (12, 'shopping.clothing', 'expense', 'Clothing', 'shirt', null, 'shopping'),
      (13, 'shopping.electronics', 'expense', 'Electronics', 'smartphone', null, 'shopping'),
      (14, 'shopping.home', 'expense', 'Home & Kitchen', 'sofa', null, 'shopping'),
      (15, 'bills', 'expense', 'Bills & Utilities', 'receipt', '#8bd5ca', null),
      (16, 'bills.rent', 'expense', 'Rent', 'house', null, 'bills'),
      (17, 'bills.electricity', 'expense', 'Electricity', 'zap', null, 'bills'),
      (18, 'bills.mobile', 'expense', 'Mobile & Internet', 'wifi', null, 'bills'),
      (19, 'bills.water', 'expense', 'Water', 'droplet', null, 'bills'),
      (20, 'bills.gas', 'expense', 'Gas / LPG', 'flame', null, 'bills'),
      (21, 'health', 'expense', 'Health', 'heart-pulse', '#f28b82', null),
      (22, 'health.doctor', 'expense', 'Doctor', 'stethoscope', null, 'health'),
      (23, 'health.pharmacy', 'expense', 'Pharmacy', 'pill', null, 'health'),
      (24, 'health.fitness', 'expense', 'Fitness', 'dumbbell', null, 'health'),
      (25, 'entertainment', 'expense', 'Entertainment', 'clapperboard', '#b4a7f5', null),
      (26, 'entertainment.streaming', 'expense', 'Streaming', 'tv', null, 'entertainment'),
      (27, 'entertainment.movies', 'expense', 'Movies & Events', 'ticket', null, 'entertainment'),
      (28, 'entertainment.games', 'expense', 'Games', 'gamepad-2', null, 'entertainment'),
      (29, 'travel', 'expense', 'Travel', 'plane', '#6cc3e0', null),
      (30, 'travel.flights', 'expense', 'Flights', 'plane-takeoff', null, 'travel'),
      (31, 'travel.trains', 'expense', 'Trains', 'train-track', null, 'travel'),
      (32, 'travel.stays', 'expense', 'Hotels & Stays', 'bed-double', null, 'travel'),
      (33, 'education', 'expense', 'Education', 'graduation-cap', '#e5c07b', null),
      (34, 'personal', 'expense', 'Personal Care', 'sparkles', '#d7a6e8', null),
      (35, 'gifts', 'expense', 'Gifts & Donations', 'gift', '#f5a3a3', null),
      (36, 'insurance', 'expense', 'Insurance', 'shield-check', '#9ccfd8', null),
      (37, 'taxes', 'expense', 'Taxes', 'landmark', '#c0b8a8', null),
      (38, 'fees', 'expense', 'Fees & Charges', 'badge-percent', '#d4a373', null),
      (39, 'fees.bank', 'expense', 'Bank Charges', 'building-2', null, 'fees'),
      (40, 'fees.card', 'expense', 'Card Fees', 'credit-card', null, 'fees'),
      (41, 'fees.interest', 'expense', 'Interest', 'percent', null, 'fees'),
      (42, 'other', 'expense', 'Other', 'circle-ellipsis', '#a0a4ab', null),
      (43, 'income.salary', 'income', 'Salary', 'briefcase', '#7fd1ae', null),
      (44, 'income.freelance', 'income', 'Freelance', 'laptop', '#8fd3c3', null),
      (45, 'income.interest', 'income', 'Interest & Dividends', 'trending-up', '#9bd6a5', null),
      (46, 'income.cashback', 'income', 'Cashback & Rewards', 'coins', '#c3e88d', null),
      (47, 'income.gifts', 'income', 'Gifts Received', 'gift', '#a6e3a1', null),
      (48, 'income.other', 'income', 'Other Income', 'plus-circle', '#94e2d5', null)
    ) as s (ord, key, kind, name, icon, color, parent_key)
    order by ord
  loop
    parent := null;
    if c.parent_key is not null then
      select id into parent from public.categories where user_id = p_user and seed_key = c.parent_key;
    end if;
    insert into public.categories (user_id, parent_id, kind, name, icon, color, sort_order, seed_key)
    values (p_user, parent, c.kind, c.name, c.icon, c.color, c.ord, c.key)
    on conflict do nothing;
  end loop;

  insert into public.accounts (user_id, name, kind, institution, color, sort_order, seed_key) values
    (p_user, 'SBI Savings', 'bank', 'State Bank of India', '#2a5bd7', 1, 'acct.sbi'),
    (p_user, 'Indian Bank Savings', 'bank', 'Indian Bank', '#1f6f8b', 2, 'acct.indianbank')
  on conflict (user_id, seed_key) do nothing;
  select id into sbi from public.accounts where user_id = p_user and seed_key = 'acct.sbi';
  select id into ib from public.accounts where user_id = p_user and seed_key = 'acct.indianbank';

  insert into public.payment_cards (user_id, account_id, issuer, network, card_type, display_name, artwork, source, sort_order, seed_key)
  values
    (p_user, sbi, 'State Bank of India', 'visa', 'debit', 'SBI Global International',
     '{"version":1,"template":"gradient","colors":["#1d3f8f","#2f6fd6","#7fb2ff"],"textTone":"light","chip":"left","chipStyle":"gold","networkPosition":"bottom-right","issuerPosition":"top-left","contactless":true,"pattern":"waves","finish":"gloss"}'::jsonb,
     'seed', 1, 'card.sbi.global'),
    (p_user, ib, 'Indian Bank', 'rupay', 'debit', 'Debit Platinum',
     '{"version":1,"template":"metal","colors":["#3a3f47","#8c939c","#d9dde2"],"textTone":"light","chip":"left","chipStyle":"silver","networkPosition":"bottom-right","issuerPosition":"top-left","contactless":true,"pattern":"arcs","finish":"matte"}'::jsonb,
     'seed', 2, 'card.indianbank.platinum')
  on conflict (user_id, seed_key) do nothing;

  update public.profiles set seed_version = 1 where id = p_user;
end $$;

create or replace function private.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.seed_user(new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.on_auth_user_created();

-- ---------------------------------------------------------------------------
-- Public RPC: setup
-- ---------------------------------------------------------------------------

create or replace function public.ensure_user_setup() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.seed_user(private.require_user());
end $$;

-- ---------------------------------------------------------------------------
-- Public RPC: transactions
-- ---------------------------------------------------------------------------

create or replace function public.post_transaction(p_input jsonb, p_idempotency_key text)
returns public.transactions
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  t public.transactions;
begin
  perform private.check_key(p_idempotency_key);
  t := private.tx_from_json(p_input, uid);
  if t.type in ('opening_balance', 'adjustment', 'goal_transfer') then
    perform private.fail('INVALID_INPUT', 'use create_account, reconcile_account or goal contributions');
  end if;
  t.idempotency_key := p_idempotency_key;
  return private.insert_tx(t);
end $$;

create or replace function public.update_transaction(p_id uuid, p_input jsonb, p_expected_version int default null)
returns public.transactions
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  old_t public.transactions;
begin
  select * into old_t from public.transactions where id = p_id and user_id = uid for update;
  if old_t.id is null or old_t.deleted_at is not null then
    perform private.fail('NOT_FOUND', 'transaction not found');
  end if;
  if p_expected_version is not null and old_t.version <> p_expected_version then
    perform private.fail('VERSION_CONFLICT', 'transaction changed elsewhere; reload and retry');
  end if;
  return private.apply_update(old_t, private.tx_from_json(p_input, uid));
end $$;

create or replace function public.delete_transaction(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  old_t public.transactions;
begin
  select * into old_t from public.transactions where id = p_id and user_id = uid for update;
  if old_t.id is null then
    perform private.fail('NOT_FOUND', 'transaction not found');
  end if;
  perform private.soft_delete_tx(old_t);
end $$;

create or replace function public.restore_transaction(p_id uuid) returns public.transactions
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  t public.transactions;
  saved public.transactions;
begin
  select * into t from public.transactions where id = p_id and user_id = uid for update;
  if t.id is null then
    perform private.fail('NOT_FOUND', 'transaction not found');
  end if;
  if t.deleted_at is null then
    return t;
  end if;
  t := private.validate_tx(t, null);
  update public.transactions set deleted_at = null, version = version + 1 where id = t.id returning * into saved;
  perform private.post_entries(saved);
  return saved;
end $$;

-- ---------------------------------------------------------------------------
-- Public RPC: accounts
-- ---------------------------------------------------------------------------

create or replace function public.create_account(p_input jsonb, p_idempotency_key text) returns public.accounts
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  a public.accounts;
  opening bigint;
  opening_on date;
  t public.transactions;
begin
  perform private.check_key(p_idempotency_key);
  perform private.seed_user(uid);
  select * into a from public.accounts where user_id = uid and creation_key = p_idempotency_key;
  if a.id is not null then
    return a;
  end if;
  if (p_input ->> 'kind') is null or (p_input ->> 'kind') not in ('cash', 'bank', 'credit_card', 'goal') then
    perform private.fail('INVALID_ACCOUNT_KIND', 'kind must be cash, bank, credit_card or goal');
  end if;
  begin
    opening := coalesce((p_input ->> 'opening_balance')::bigint, 0);
    opening_on := coalesce((p_input ->> 'opening_on')::date, private.today_ist());
  exception when others then
    perform private.fail('INVALID_INPUT', 'malformed opening balance');
  end;

  insert into public.accounts (user_id, name, kind, institution, color, icon, sort_order, creation_key)
  values (
    uid, btrim(p_input ->> 'name'), p_input ->> 'kind', nullif(btrim(p_input ->> 'institution'), ''),
    p_input ->> 'color', p_input ->> 'icon',
    coalesce((select max(sort_order) + 1 from public.accounts where user_id = uid and not is_system), 1),
    p_idempotency_key
  )
  returning * into a;

  if opening <> 0 then
    t.user_id := uid;
    t.type := 'opening_balance';
    t.amount_paise := opening;
    t.occurred_on := opening_on;
    t.account_id := a.id;
    t.note := 'Opening balance';
    t.idempotency_key := 'open:' || a.id;
    perform private.insert_tx(t);
  end if;

  if a.kind = 'credit_card' and (p_input ->> 'statement_day') is not null then
    insert into public.credit_card_settings (account_id, user_id, credit_limit_paise, statement_day, due_days)
    values (a.id, uid, (p_input ->> 'credit_limit')::bigint, (p_input ->> 'statement_day')::smallint,
            coalesce((p_input ->> 'due_days')::smallint, 20));
  end if;
  return a;
end $$;

create or replace function public.reconcile_account(p_account_id uuid, p_actual_balance bigint, p_as_of date, p_idempotency_key text)
returns public.transactions
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  a public.accounts;
  current_balance bigint;
  t public.transactions;
  existing public.transactions;
begin
  perform private.check_key(p_idempotency_key);
  select * into existing from public.transactions where user_id = uid and idempotency_key = p_idempotency_key;
  if existing.id is not null then
    return existing;
  end if;
  select * into a from public.accounts where id = p_account_id and user_id = uid and not is_system for update;
  if a.id is null then
    perform private.fail('ACCOUNT_NOT_FOUND', 'account not found');
  end if;
  if p_actual_balance is null or abs(p_actual_balance) > 1000000000000000 then
    perform private.fail('INVALID_AMOUNT', 'balance is missing or too large');
  end if;
  perform private.check_date(p_as_of);
  select coalesce(sum(amount_paise), 0) into current_balance
    from public.ledger_entries where account_id = a.id and occurred_on <= p_as_of;
  update public.accounts set reconciled_at = now(), reconciled_balance_paise = p_actual_balance where id = a.id;
  if p_actual_balance = current_balance then
    return null;
  end if;
  t.user_id := uid;
  t.type := 'adjustment';
  t.amount_paise := p_actual_balance - current_balance;
  t.occurred_on := p_as_of;
  t.account_id := a.id;
  t.note := 'Reconciliation adjustment';
  t.idempotency_key := p_idempotency_key;
  return private.insert_tx(t);
end $$;

-- ---------------------------------------------------------------------------
-- Public RPC: savings goals
-- ---------------------------------------------------------------------------

create or replace function public.create_goal(p_input jsonb) returns public.savings_goals
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  g public.savings_goals;
  acct uuid;
  m text := p_input ->> 'mode';
begin
  perform private.seed_user(uid);
  if m is null or m not in ('earmark', 'account') then
    perform private.fail('INVALID_INPUT', 'mode must be earmark or account');
  end if;
  begin
    acct := (p_input ->> 'account_id')::uuid;
  exception when others then
    perform private.fail('INVALID_INPUT', 'malformed account id');
  end;
  if m = 'account' and acct is null then
    insert into public.accounts (user_id, name, kind, color, icon, sort_order)
    values (uid, left(btrim(p_input ->> 'name'), 60), 'goal', p_input ->> 'color', p_input ->> 'icon',
            coalesce((select max(sort_order) + 1 from public.accounts where user_id = uid and not is_system), 1))
    returning id into acct;
  end if;
  begin
    insert into public.savings_goals (user_id, name, target_paise, deadline, mode, account_id, color, icon)
    values (uid, btrim(p_input ->> 'name'), (p_input ->> 'target')::bigint, (p_input ->> 'deadline')::date,
            m, acct, p_input ->> 'color', p_input ->> 'icon')
    returning * into g;
  exception when check_violation or invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
    perform private.fail('INVALID_INPUT', 'invalid goal');
  end;
  return g;
end $$;

create or replace function public.add_goal_contribution(p_input jsonb, p_idempotency_key text)
returns public.goal_contributions
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  g public.savings_goals;
  c public.goal_contributions;
  src public.accounts;
  amt bigint;
  on_date date;
  src_id uuid;
  v_note text;
  t public.transactions;
begin
  perform private.check_key(p_idempotency_key);
  select * into c from public.goal_contributions where user_id = uid and idempotency_key = p_idempotency_key;
  if c.id is not null then
    return c;
  end if;
  begin
    amt := (p_input ->> 'amount')::bigint;
    on_date := coalesce((p_input ->> 'contributed_on')::date, private.today_ist());
    src_id := (p_input ->> 'account_id')::uuid;
    v_note := nullif(btrim(p_input ->> 'note'), '');
    select * into g from public.savings_goals where id = (p_input ->> 'goal_id')::uuid and user_id = uid for update;
  exception when others then
    perform private.fail('INVALID_INPUT', 'malformed contribution');
  end;
  if g.id is null then
    perform private.fail('NOT_FOUND', 'goal not found');
  end if;
  if g.archived_at is not null then
    perform private.fail('GOAL_ARCHIVED', 'goal is archived');
  end if;
  if amt is null or amt <= 0 or amt > 1000000000000000 then
    perform private.fail('INVALID_AMOUNT', 'amount must be positive');
  end if;
  perform private.check_date(on_date);
  if src_id is not null then
    select * into src from public.accounts where id = src_id and user_id = uid and not is_system;
    if src.id is null then
      perform private.fail('ACCOUNT_NOT_FOUND', 'account not found');
    end if;
    if src.kind not in ('cash', 'bank') then
      perform private.fail('INVALID_ACCOUNT_KIND', 'contribute from a cash or bank account');
    end if;
  end if;

  if g.mode = 'account' then
    if src_id is null then
      perform private.fail('INVALID_INPUT', 'choose the account the money comes from');
    end if;
    t.user_id := uid;
    t.type := 'goal_transfer';
    t.amount_paise := amt;
    t.occurred_on := on_date;
    t.account_id := src_id;
    t.to_account_id := g.account_id;
    t.note := coalesce(v_note, 'Saved towards ' || g.name);
    t.idempotency_key := 'goal:' || p_idempotency_key;
    t := private.insert_tx(t);
  end if;

  insert into public.goal_contributions (user_id, goal_id, amount_paise, contributed_on, account_id, transaction_id, note, idempotency_key)
  values (uid, g.id, amt, on_date, src_id, t.id, v_note, p_idempotency_key)
  on conflict (user_id, idempotency_key) do nothing
  returning * into c;
  if c.id is null then
    select * into c from public.goal_contributions where user_id = uid and idempotency_key = p_idempotency_key;
  end if;
  return c;
end $$;

create or replace function public.update_goal_contribution(p_id uuid, p_input jsonb) returns public.goal_contributions
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  c public.goal_contributions;
  g public.savings_goals;
  old_t public.transactions;
  t public.transactions;
  amt bigint;
  on_date date;
  src_id uuid;
  v_note text;
  src public.accounts;
begin
  select * into c from public.goal_contributions where id = p_id and user_id = uid for update;
  if c.id is null then
    perform private.fail('NOT_FOUND', 'contribution not found');
  end if;
  select * into g from public.savings_goals where id = c.goal_id;
  begin
    amt := coalesce((p_input ->> 'amount')::bigint, c.amount_paise);
    on_date := coalesce((p_input ->> 'contributed_on')::date, c.contributed_on);
    src_id := case when p_input ? 'account_id' then (p_input ->> 'account_id')::uuid else c.account_id end;
    v_note := case when p_input ? 'note' then nullif(btrim(p_input ->> 'note'), '') else c.note end;
  exception when others then
    perform private.fail('INVALID_INPUT', 'malformed contribution');
  end;
  if amt <= 0 or amt > 1000000000000000 then
    perform private.fail('INVALID_AMOUNT', 'amount must be positive');
  end if;
  perform private.check_date(on_date);
  if src_id is not null then
    select * into src from public.accounts where id = src_id and user_id = uid and not is_system;
    if src.id is null then
      perform private.fail('ACCOUNT_NOT_FOUND', 'account not found');
    end if;
    if src.kind not in ('cash', 'bank') then
      perform private.fail('INVALID_ACCOUNT_KIND', 'contribute from a cash or bank account');
    end if;
  end if;

  if g.mode = 'account' then
    if src_id is null then
      perform private.fail('INVALID_INPUT', 'choose the account the money comes from');
    end if;
    select * into old_t from public.transactions where id = c.transaction_id for update;
    if old_t.id is null or old_t.deleted_at is not null then
      perform private.fail('NOT_FOUND', 'contribution transfer was deleted');
    end if;
    t := old_t;
    t.amount_paise := amt;
    t.occurred_on := on_date;
    t.account_id := src_id;
    -- Bypass the "edit from the goal" guard by validating against a copy with the new source.
    old_t.account_id := src_id;
    t := private.apply_update(old_t, t);
  end if;

  update public.goal_contributions
    set amount_paise = amt, contributed_on = on_date, account_id = src_id, note = v_note
    where id = c.id
    returning * into c;
  return c;
end $$;

create or replace function public.delete_goal_contribution(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  c public.goal_contributions;
  t public.transactions;
begin
  select * into c from public.goal_contributions where id = p_id and user_id = uid for update;
  if c.id is null then
    perform private.fail('NOT_FOUND', 'contribution not found');
  end if;
  if c.transaction_id is not null then
    select * into t from public.transactions where id = c.transaction_id for update;
    perform private.soft_delete_tx(t);
  end if;
  delete from public.goal_contributions where id = c.id;
end $$;

-- Move money out of an account-backed goal (not a contribution; lowers the goal account balance).
create or replace function public.withdraw_from_goal(p_goal_id uuid, p_amount bigint, p_to_account_id uuid, p_on date, p_idempotency_key text)
returns public.transactions
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  g public.savings_goals;
  t public.transactions;
begin
  perform private.check_key(p_idempotency_key);
  select * into g from public.savings_goals where id = p_goal_id and user_id = uid;
  if g.id is null then
    perform private.fail('NOT_FOUND', 'goal not found');
  end if;
  if g.mode <> 'account' then
    perform private.fail('INVALID_INPUT', 'earmarked goals release money by removing contributions');
  end if;
  t.user_id := uid;
  t.type := 'goal_transfer';
  t.amount_paise := p_amount;
  t.occurred_on := coalesce(p_on, private.today_ist());
  t.account_id := g.account_id;
  t.to_account_id := p_to_account_id;
  t.note := 'Withdrawn from ' || g.name;
  t.idempotency_key := p_idempotency_key;
  return private.insert_tx(t);
end $$;

-- ---------------------------------------------------------------------------
-- Recurring rules
-- ---------------------------------------------------------------------------

create or replace function private.recurring_rules_check() returns trigger
language plpgsql set search_path = '' as $$
declare
  ak text;
  tk text;
  ck text;
begin
  select kind into ak from public.accounts where id = new.account_id and user_id = new.user_id;
  if new.to_account_id is not null then
    select kind into tk from public.accounts where id = new.to_account_id and user_id = new.user_id;
  end if;
  if new.type in ('expense', 'income') and ak not in ('cash', 'bank', 'credit_card') then
    perform private.fail('INVALID_ACCOUNT_KIND', 'use a cash, bank or credit card account');
  end if;
  if new.type = 'transfer' and (ak not in ('cash', 'bank', 'credit_card') or tk not in ('cash', 'bank', 'credit_card') or (tk = 'credit_card' and ak in ('cash', 'bank'))) then
    perform private.fail('INVALID_ACCOUNT_KIND', 'invalid transfer accounts');
  end if;
  if new.type = 'card_payment' and (ak not in ('cash', 'bank') or tk <> 'credit_card') then
    perform private.fail('INVALID_ACCOUNT_KIND', 'card payments go from cash or bank to a credit card');
  end if;
  if new.type in ('expense', 'income') then
    if new.category_id is null then
      perform private.fail('CATEGORY_REQUIRED', 'choose a category');
    end if;
    select kind into ck from public.categories where id = new.category_id and user_id = new.user_id;
    if ck <> new.type then
      perform private.fail('CATEGORY_KIND_MISMATCH', 'category kind does not match');
    end if;
  end if;
  if new.frequency in ('monthly', 'yearly') and new.anchor_day is null then
    new.anchor_day := extract(day from new.start_on)::smallint;
  end if;
  if tg_op = 'UPDATE' and old.status = 'paused' and new.status = 'active' then
    -- Resuming never back-fills the paused window.
    new.active_from := greatest(new.start_on, private.today_ist());
  end if;
  if tg_op = 'UPDATE' and old.status = 'cancelled' and new.status <> 'cancelled' then
    perform private.fail('RULE_INACTIVE', 'cancelled rules cannot be reactivated');
  end if;
  return new;
end $$;

create trigger recurring_rules_check before insert or update on public.recurring_rules
  for each row execute function private.recurring_rules_check();

-- Mirror of domain/recurring.ts isScheduled(): is `d` an occurrence date of rule `r`?
create or replace function private.is_scheduled(r public.recurring_rules, d date) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  months int;
  anchor int := coalesce(r.anchor_day, extract(day from r.start_on)::int);
begin
  if d < r.start_on or (r.end_on is not null and d > r.end_on) then
    return false;
  end if;
  if r.frequency = 'daily' then
    return (d - r.start_on) % r.interval_count = 0;
  elsif r.frequency = 'weekly' then
    return (d - r.start_on) % (7 * r.interval_count) = 0;
  elsif r.frequency = 'monthly' then
    months := (extract(year from d)::int * 12 + extract(month from d)::int)
            - (extract(year from r.start_on)::int * 12 + extract(month from r.start_on)::int);
    return months % r.interval_count = 0
       and extract(day from d)::int = least(anchor, private.days_in_month(d));
  elsif r.frequency = 'yearly' then
    return extract(month from d) = extract(month from r.start_on)
       and (extract(year from d)::int - extract(year from r.start_on)::int) % r.interval_count = 0
       and extract(day from d)::int = least(anchor, private.days_in_month(d));
  end if;
  return false;
end $$;

create or replace function private.post_occurrence(r public.recurring_rules, o public.recurring_occurrences, p_amount bigint, p_on date)
returns public.recurring_occurrences
language plpgsql set search_path = '' as $$
declare
  t public.transactions;
  saved public.recurring_occurrences;
begin
  t.user_id := r.user_id;
  t.type := r.type;
  t.amount_paise := coalesce(p_amount, r.amount_paise);
  t.occurred_on := coalesce(p_on, o.due_on);
  t.account_id := r.account_id;
  t.to_account_id := r.to_account_id;
  t.category_id := r.category_id;
  t.merchant := coalesce(r.merchant, r.name);
  t.note := r.note;
  t.payment_card_id := r.payment_card_id;
  t.idempotency_key := 'rec:' || r.id || ':' || o.due_on;
  t := private.insert_tx(t);
  update public.recurring_occurrences
    set status = 'posted', transaction_id = t.id, resolved_at = now()
    where id = o.id
    returning * into saved;
  return saved;
end $$;

create or replace function public.materialize_occurrence(p_rule_id uuid, p_due_on date)
returns public.recurring_occurrences
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  r public.recurring_rules;
  o public.recurring_occurrences;
begin
  -- Row lock serialises concurrent materialisation of the same rule (two tabs, two devices).
  select * into r from public.recurring_rules where id = p_rule_id and user_id = uid for update;
  if r.id is null then
    perform private.fail('NOT_FOUND', 'rule not found');
  end if;
  select * into o from public.recurring_occurrences where rule_id = r.id and due_on = p_due_on;
  if o.id is not null then
    return o;
  end if;
  if r.status <> 'active' then
    perform private.fail('RULE_INACTIVE', 'rule is not active');
  end if;
  if p_due_on > private.today_ist() or not private.is_scheduled(r, p_due_on)
     or (r.active_from is not null and p_due_on < r.active_from) then
    perform private.fail('NOT_DUE', 'not an occurrence date of this rule');
  end if;
  insert into public.recurring_occurrences (user_id, rule_id, due_on)
  values (uid, r.id, p_due_on)
  on conflict (rule_id, due_on) do nothing
  returning * into o;
  if o.id is null then
    select * into o from public.recurring_occurrences where rule_id = r.id and due_on = p_due_on;
    return o;
  end if;
  if r.mode = 'automatic' then
    begin
      o := private.post_occurrence(r, o, null, null);
    exception when others then
      -- Could not post (e.g. account archived): leave it pending for the user to resolve.
      null;
    end;
  end if;
  return o;
end $$;

create or replace function public.confirm_occurrence(p_id uuid, p_amount bigint default null, p_occurred_on date default null)
returns public.recurring_occurrences
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  o public.recurring_occurrences;
  r public.recurring_rules;
begin
  select * into o from public.recurring_occurrences where id = p_id and user_id = uid for update;
  if o.id is null then
    perform private.fail('NOT_FOUND', 'occurrence not found');
  end if;
  if o.status = 'posted' then
    return o;
  end if;
  if o.status = 'skipped' then
    perform private.fail('OCCURRENCE_RESOLVED', 'occurrence was skipped');
  end if;
  select * into r from public.recurring_rules where id = o.rule_id;
  return private.post_occurrence(r, o, p_amount, p_occurred_on);
end $$;

create or replace function public.skip_occurrence(p_id uuid) returns public.recurring_occurrences
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  o public.recurring_occurrences;
begin
  select * into o from public.recurring_occurrences where id = p_id and user_id = uid for update;
  if o.id is null then
    perform private.fail('NOT_FOUND', 'occurrence not found');
  end if;
  if o.status = 'posted' then
    perform private.fail('OCCURRENCE_RESOLVED', 'occurrence already posted');
  end if;
  update public.recurring_occurrences set status = 'skipped', resolved_at = now() where id = o.id returning * into o;
  return o;
end $$;

-- ---------------------------------------------------------------------------
-- Subscriptions: a subscription owns exactly one recurring rule; only the rule posts.
-- ---------------------------------------------------------------------------

create or replace function public.create_subscription(p_input jsonb) returns public.subscriptions
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  r public.recurring_rules;
  s public.subscriptions;
begin
  perform private.seed_user(uid);
  begin
    insert into public.recurring_rules (
      user_id, name, type, amount_paise, account_id, category_id, merchant, note, payment_card_id,
      frequency, interval_count, start_on, end_on, anchor_day, mode
    ) values (
      uid, btrim(p_input ->> 'name'), 'expense', (p_input ->> 'amount')::bigint, (p_input ->> 'account_id')::uuid,
      (p_input ->> 'category_id')::uuid, coalesce(nullif(btrim(p_input ->> 'merchant'), ''), btrim(p_input ->> 'name')),
      nullif(btrim(p_input ->> 'note'), ''), (p_input ->> 'payment_card_id')::uuid,
      coalesce(p_input ->> 'frequency', 'monthly'), coalesce((p_input ->> 'interval')::int, 1),
      (p_input ->> 'start_on')::date, (p_input ->> 'end_on')::date, (p_input ->> 'anchor_day')::smallint,
      coalesce(p_input ->> 'mode', 'reminder')
    ) returning * into r;
  exception
    when raise_exception then raise;
    when others then perform private.fail('INVALID_INPUT', 'invalid subscription: ' || sqlerrm);
  end;
  insert into public.subscriptions (user_id, name, recurring_rule_id, website)
  values (uid, btrim(p_input ->> 'name'), r.id, nullif(btrim(p_input ->> 'website'), ''))
  returning * into s;
  return s;
end $$;

-- ---------------------------------------------------------------------------
-- Credit card statements: a snapshot of debt at the statement date.
-- Current debt is always the live ledger balance; the two are deliberately distinct.
-- ---------------------------------------------------------------------------

create or replace function public.close_card_statement(p_account_id uuid, p_period_end date) returns public.card_statements
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  s public.credit_card_settings;
  st public.card_statements;
  prev_end date;
  p_start date;
  bal bigint;
  min_due bigint;
begin
  select * into s from public.credit_card_settings where account_id = p_account_id and user_id = uid;
  if s.account_id is null then
    perform private.fail('CARD_SETTINGS_REQUIRED', 'set the statement day first');
  end if;
  select * into st from public.card_statements where account_id = p_account_id and period_end = p_period_end;
  if st.id is not null then
    return st;
  end if;
  if p_period_end > private.today_ist()
     or extract(day from p_period_end)::int <> least(s.statement_day, private.days_in_month(p_period_end)) then
    perform private.fail('NOT_DUE', 'not a closed statement date');
  end if;
  select max(period_end) into prev_end from public.card_statements where account_id = p_account_id and period_end < p_period_end;
  if prev_end is not null then
    p_start := prev_end + 1;
  else
    p_start := (date_trunc('month', p_period_end) - interval '1 month')::date;
    p_start := (p_start + (least(s.statement_day, private.days_in_month(p_start)) - 1))::date + 1;
  end if;
  select -coalesce(sum(amount_paise), 0) into bal
    from public.ledger_entries where account_id = p_account_id and occurred_on <= p_period_end;
  if bal <= 0 then
    min_due := 0;
  else
    min_due := least(bal, greatest(s.min_due_floor_paise, (bal * s.min_due_bps + 5000) / 10000));
  end if;
  insert into public.card_statements (user_id, account_id, period_start, period_end, due_on, statement_balance_paise, minimum_due_paise)
  values (uid, p_account_id, p_start, p_period_end, p_period_end + s.due_days, bal, min_due)
  on conflict (account_id, period_end) do nothing
  returning * into st;
  if st.id is null then
    select * into st from public.card_statements where account_id = p_account_id and period_end = p_period_end;
  end if;
  return st;
end $$;

-- ---------------------------------------------------------------------------
-- Read helpers (security invoker → RLS applies)
-- ---------------------------------------------------------------------------

create or replace function public.category_totals(p_from date, p_to date)
returns table (category_id uuid, kind text, total_paise bigint)
language sql stable security invoker set search_path = '' as $$
  select e.category_id, a.kind,
         case when a.kind = 'income' then -sum(e.amount_paise) else sum(e.amount_paise) end::bigint
  from public.ledger_entries e
  join public.accounts a on a.id = e.account_id
  where a.kind in ('income', 'expense') and e.occurred_on between p_from and p_to
  group by e.category_id, a.kind
$$;

-- ---------------------------------------------------------------------------
-- Execute grants: only the public RPCs, only for signed-in users.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema private from public, anon, authenticated;
-- Check constraints and triggers on directly-writable tables run as the caller, so the caller needs
-- these pure helpers. The private schema is not exposed through the API.
grant usage on schema private to authenticated;
grant execute on function
  private.has_card_like_number(text), private.fail(text, text), private.today_ist(), private.days_in_month(date),
  private.touch_updated_at(), private.categories_check_parent(), private.payment_cards_check_account(),
  private.savings_goals_check(), private.credit_card_settings_check(), private.recurring_rules_check()
to authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'ensure_user_setup()',
    'post_transaction(jsonb, text)',
    'update_transaction(uuid, jsonb, int)',
    'delete_transaction(uuid)',
    'restore_transaction(uuid)',
    'create_account(jsonb, text)',
    'reconcile_account(uuid, bigint, date, text)',
    'create_goal(jsonb)',
    'add_goal_contribution(jsonb, text)',
    'update_goal_contribution(uuid, jsonb)',
    'delete_goal_contribution(uuid)',
    'withdraw_from_goal(uuid, bigint, uuid, date, text)',
    'materialize_occurrence(uuid, date)',
    'confirm_occurrence(uuid, bigint, date)',
    'skip_occurrence(uuid)',
    'create_subscription(jsonb)',
    'close_card_statement(uuid, date)',
    'category_totals(date, date)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
