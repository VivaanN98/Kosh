-- Read-only query functions for the AI assistant (Tier 3).
--
-- The assistant (supabase/functions/assistant) can ONLY call these functions, with the signed-in
-- user's JWT. They are SECURITY INVOKER, so row-level security applies: each returns the caller's
-- own data and nothing else. None of them writes, and none exposes payment-card details.
-- Every amount is computed here in SQL (paise) and also returned as a decimal rupee string so the
-- model never has to do arithmetic on money.

create or replace function private.inr(p bigint) returns text
language sql immutable set search_path = '' as $$
  select case when p < 0 then '-' else '' end || (abs(p) / 100)::text || '.' || lpad((abs(p) % 100)::text, 2, '0')
$$;

-- Balances, net worth, available cash and this month's totals.
create or replace function public.assistant_overview()
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with bal as (
    select a.id, a.name, a.kind, a.archived_at, coalesce(sum(e.amount_paise), 0)::bigint as balance
    from public.accounts a
    left join public.ledger_entries e on e.account_id = a.id
    where not a.is_system
    group by a.id
  ),
  month as (
    select date_trunc('month', private.today_ist())::date as start_on, private.today_ist() as today
  ),
  flows as (
    select
      coalesce(sum(e.amount_paise) filter (where a.kind = 'expense'), 0)::bigint as spending,
      coalesce(-sum(e.amount_paise) filter (where a.kind = 'income'), 0)::bigint as income
    from public.ledger_entries e
    join public.accounts a on a.id = e.account_id
    cross join month m
    where a.kind in ('expense', 'income') and e.occurred_on between m.start_on and m.today
  )
  select jsonb_build_object(
    'today', (select today from month),
    'net_worth_inr', private.inr((select coalesce(sum(balance), 0) from bal)::bigint),
    'available_cash_inr', private.inr((select coalesce(sum(balance) filter (where kind in ('cash', 'bank') and balance > 0), 0) from bal)::bigint),
    'card_debt_inr', private.inr((select coalesce(-sum(balance) filter (where kind = 'credit_card' and balance < 0), 0) from bal)::bigint),
    'this_month_spending_inr', private.inr((select spending from flows)),
    'this_month_income_inr', private.inr((select income from flows)),
    'accounts', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', name, 'kind', kind, 'archived', archived_at is not null,
        'balance_inr', private.inr(balance),
        'owed_inr', case when kind = 'credit_card' then private.inr(-balance) end
      ) order by kind, name), '[]'::jsonb)
      from bal
    )
  )
$$;

-- Spending (or income) in a date range, grouped by category, top-level category, month or merchant.
create or replace function public.assistant_spending(p_from date, p_to date, p_group_by text default 'category', p_kind text default 'expense')
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  result jsonb;
  total bigint;
begin
  if p_group_by not in ('category', 'parent_category', 'month', 'merchant') then
    raise exception 'group_by must be category, parent_category, month or merchant';
  end if;
  if p_kind not in ('expense', 'income') then
    raise exception 'kind must be expense or income';
  end if;
  if p_to < p_from or p_to - p_from > 3660 then
    raise exception 'date range must be between 0 and 10 years';
  end if;

  with rows as (
    select
      (case when p_kind = 'income' then -e.amount_paise else e.amount_paise end)::bigint as amount,
      e.occurred_on,
      c.name as category,
      coalesce(pc.name, c.name) as parent_category,
      coalesce(nullif(t.merchant, ''), '(no merchant)') as merchant
    from public.ledger_entries e
    join public.accounts a on a.id = e.account_id and a.kind = p_kind
    join public.transactions t on t.id = e.transaction_id
    left join public.categories c on c.id = e.category_id
    left join public.categories pc on pc.id = c.parent_id
    where e.occurred_on between p_from and p_to
  ),
  grouped as (
    select
      case p_group_by
        when 'category' then coalesce(category, 'Uncategorised')
        when 'parent_category' then coalesce(parent_category, 'Uncategorised')
        when 'month' then to_char(occurred_on, 'YYYY-MM')
        else merchant
      end as label,
      sum(amount)::bigint as amount,
      count(*) as entries
    from rows
    group by 1
  )
  select coalesce(sum(amount), 0)::bigint, coalesce(jsonb_agg(jsonb_build_object('label', label, 'amount_inr', private.inr(amount), 'entries', entries) order by amount desc), '[]'::jsonb)
  into total, result
  from (select * from grouped order by amount desc limit 40) g;

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'kind', p_kind, 'group_by', p_group_by,
    'total_inr', private.inr((
      select coalesce(sum(case when p_kind = 'income' then -e.amount_paise else e.amount_paise end), 0)::bigint
      from public.ledger_entries e join public.accounts a on a.id = e.account_id and a.kind = p_kind
      where e.occurred_on between p_from and p_to
    )),
    'groups', result
  );
end $$;

-- Budget status for a month (category budgets include their subcategories).
create or replace function public.assistant_budgets(p_month date default null)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with m as (
    select date_trunc('month', coalesce(p_month, private.today_ist()))::date as start_on,
           (date_trunc('month', coalesce(p_month, private.today_ist())) + interval '1 month - 1 day')::date as end_on
  ),
  spend as (
    select e.category_id, sum(e.amount_paise)::bigint as amount
    from public.ledger_entries e
    join public.accounts a on a.id = e.account_id and a.kind = 'expense'
    cross join m
    where e.occurred_on between m.start_on and m.end_on
    group by e.category_id
  ),
  status as (
    select
      b.id,
      coalesce(c.name, 'Overall') as name,
      b.amount_paise as budget,
      b.warn_at_pct,
      coalesce((
        select sum(s.amount) from spend s
        left join public.categories sc on sc.id = s.category_id
        where b.category_id is null or s.category_id = b.category_id or sc.parent_id = b.category_id
      ), 0)::bigint as spent
    from public.budgets b
    left join public.categories c on c.id = b.category_id
  )
  select jsonb_build_object(
    'month', to_char((select start_on from m), 'YYYY-MM'),
    'budgets', coalesce(jsonb_agg(jsonb_build_object(
      'name', name,
      'budget_inr', private.inr(budget),
      'spent_inr', private.inr(spent),
      'remaining_inr', private.inr(budget - spent),
      'used_percent', round(100.0 * spent / budget, 1),
      'state', case when spent > budget then 'over' when spent * 100 >= budget * warn_at_pct then 'warning' else 'ok' end
    ) order by name), '[]'::jsonb)
  )
  from status
$$;

-- Transactions matching optional filters (max 50, newest first).
create or replace function public.assistant_find_transactions(
  p_from date default null, p_to date default null, p_text text default null, p_category text default null,
  p_type text default null, p_limit int default 20
)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('transactions', coalesce(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb))
  from (
    select
      t.occurred_on as date,
      t.type,
      private.inr(t.amount_paise) as amount_inr,
      t.merchant,
      t.note,
      c.name as category,
      pc.name as category_group,
      a.name as account,
      ta.name as to_account
    from public.transactions t
    join public.accounts a on a.id = t.account_id
    left join public.accounts ta on ta.id = t.to_account_id
    left join public.categories c on c.id = t.category_id
    left join public.categories pc on pc.id = c.parent_id
    where t.deleted_at is null
      and (p_from is null or t.occurred_on >= p_from)
      and (p_to is null or t.occurred_on <= p_to)
      and (p_type is null or t.type = p_type)
      and (p_category is null or c.name ilike p_category or pc.name ilike p_category)
      and (p_text is null or t.merchant ilike '%' || p_text || '%' or t.note ilike '%' || p_text || '%')
    order by t.occurred_on desc, t.created_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) x
$$;

-- Savings goals and progress (earmarks: contributions; goal pots: the pot's balance).
create or replace function public.assistant_goals()
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('goals', coalesce(jsonb_agg(jsonb_build_object(
    'name', g.name,
    'mode', g.mode,
    'target_inr', private.inr(g.target_paise),
    'saved_inr', private.inr(p.saved),
    'progress_percent', round(100.0 * p.saved / g.target_paise, 1),
    'deadline', g.deadline,
    'archived', g.archived_at is not null
  ) order by g.created_at), '[]'::jsonb))
  from public.savings_goals g
  cross join lateral (
    select case
      when g.mode = 'account' then greatest(0, coalesce((select sum(e.amount_paise) from public.ledger_entries e where e.account_id = g.account_id), 0))
      else coalesce((
        select sum(gc.amount_paise) from public.goal_contributions gc
        left join public.transactions t on t.id = gc.transaction_id
        where gc.goal_id = g.id and (gc.transaction_id is null or t.deleted_at is null)
      ), 0)
    end::bigint as saved
  ) p
$$;

-- Recurring items (incl. subscriptions) due in the next N days, using the same schedule rule as posting.
create or replace function public.assistant_upcoming(p_days int default 30)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('upcoming', coalesce(jsonb_agg(jsonb_build_object(
    'name', r.name, 'type', r.type, 'due_on', d.day, 'amount_inr', private.inr(r.amount_paise),
    'mode', r.mode, 'is_subscription', exists (select 1 from public.subscriptions s where s.recurring_rule_id = r.id)
  ) order by d.day), '[]'::jsonb))
  from public.recurring_rules r
  cross join lateral (
    select g::date as day
    from generate_series(private.today_ist(), private.today_ist() + least(greatest(coalesce(p_days, 30), 1), 120), interval '1 day') g
  ) d
  where r.status = 'active' and private.is_scheduled(r, d.day) and (r.active_from is null or d.day >= r.active_from)
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'assistant_overview()',
    'assistant_spending(date, date, text, text)',
    'assistant_budgets(date)',
    'assistant_find_transactions(date, date, text, text, text, int)',
    'assistant_goals()',
    'assistant_upcoming(int)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

grant execute on function private.inr(bigint), private.is_scheduled(public.recurring_rules, date) to authenticated;
