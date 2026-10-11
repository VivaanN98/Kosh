-- New users start with no bank accounts or cards: they add their own. Only the hidden system
-- accounts and the default categories are seeded (mirror of src/domain/seed.ts).
--
-- Users who signed up before this migration keep whatever was seeded for them; seed_user() is
-- gated on profiles.seed_version, so it never runs twice for the same user.

create or replace function private.seed_user(p_user uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v int;
  parent uuid;
  c record;
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

  update public.profiles set seed_version = 1 where id = p_user;
end $$;
