-- Row Level Security on every user-owned table, plus least-privilege grants.
--
-- Money-bearing tables (transactions, ledger_entries, goal_contributions, recurring_occurrences,
-- card_statements) are READ-ONLY to clients: every write goes through a security-definer RPC
-- that validates, posts balanced entries atomically and honours idempotency keys.

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.payment_cards enable row level security;
alter table public.transactions enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.budgets enable row level security;
alter table public.savings_goals enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.recurring_occurrences enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credit_card_settings enable row level security;
alter table public.card_statements enable row level security;

-- Start from nothing, then grant precisely.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on schema private from anon, authenticated, public;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

-- Read access everywhere (RLS narrows to the owner).
grant select on
  public.profiles, public.accounts, public.categories, public.payment_cards, public.transactions,
  public.ledger_entries, public.budgets, public.savings_goals, public.goal_contributions,
  public.recurring_rules, public.recurring_occurrences, public.subscriptions,
  public.credit_card_settings, public.card_statements, public.account_balances
to authenticated;

-- Direct writes only where no money moves.
grant update (display_name) on public.profiles to authenticated;
grant update (name, institution, color, icon, sort_order, archived_at) on public.accounts to authenticated;
grant insert, update, delete on public.categories to authenticated;
grant insert, update, delete on public.payment_cards to authenticated;
grant insert, update, delete on public.budgets to authenticated;
grant update (name, target_paise, deadline, color, icon, archived_at), delete on public.savings_goals to authenticated;
grant insert, update, delete on public.recurring_rules to authenticated;
grant update (name, website), delete on public.subscriptions to authenticated;
grant insert, update, delete on public.credit_card_settings to authenticated;

-- Policies: owner-only. `(select auth.uid())` is evaluated once per statement.
create policy profiles_owner on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'categories', 'payment_cards', 'transactions', 'ledger_entries', 'budgets',
    'savings_goals', 'goal_contributions', 'recurring_rules', 'recurring_occurrences',
    'subscriptions', 'credit_card_settings', 'card_statements'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_owner', t
    );
  end loop;
end $$;

-- System accounts are managed by the server only.
create policy accounts_no_system_edit on public.accounts as restrictive for update to authenticated
  using (not is_system);

-- Payment cards may only be created against the caller's own non-system accounts and with
-- sanitized fields (the table checks also reject card-number-shaped text).
create policy payment_cards_valid_source on public.payment_cards as restrictive for insert to authenticated
  with check (source in ('manual', 'scan'));
