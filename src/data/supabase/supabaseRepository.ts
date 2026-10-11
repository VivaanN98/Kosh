import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { IsoDate } from '@/lib/dates';
import type { Paise } from '@/lib/money';
import { KoshError, toKoshError } from '@/domain/errors';
import { normalizeLast4, sanitizeArtwork } from '@/domain/cards/artwork';
import { hasCardLikeNumber } from '@/domain/ledger/engine';
import type {
  Account,
  Budget,
  CardStatement,
  Category,
  CreditCardSettings,
  GoalContribution,
  LedgerEntry,
  PaymentCard,
  Profile,
  RecurringOccurrence,
  RecurringRule,
  RecurringStatus,
  SavingsGoal,
  Subscription,
  Transaction,
  TransactionInput,
  Uuid,
} from '@/domain/types';
import type {
  AccountPatch,
  AssistantMessage,
  AssistantReply,
  BudgetInput,
  CategoryInput,
  ContributionInput,
  ContributionPatch,
  CreateAccountInput,
  CreditCardSettingsInput,
  GoalInput,
  GoalPatch,
  LedgerQuery,
  PaymentCardInput,
  PaymentCardPatch,
  ReconcileInput,
  RecurringRuleInput,
  Repository,
  SubscriptionInput,
  TransactionQuery,
} from '../repository';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const n = (v: unknown): number => (typeof v === 'string' ? Number(v) : (v as number));

const mapAccount = (r: Row): Account => ({
  id: r.id, name: r.name, kind: r.kind, isSystem: r.is_system, institution: r.institution, color: r.color, icon: r.icon,
  sortOrder: r.sort_order, archivedAt: r.archived_at, reconciledAt: r.reconciled_at,
  reconciledBalance: r.reconciled_balance_paise == null ? null : n(r.reconciled_balance_paise), seedKey: r.seed_key, createdAt: r.created_at,
});

const mapTransaction = (r: Row): Transaction => ({
  id: r.id, type: r.type, amount: n(r.amount_paise), occurredOn: r.occurred_on, accountId: r.account_id, toAccountId: r.to_account_id,
  categoryId: r.category_id, merchant: r.merchant, note: r.note, paymentCardId: r.payment_card_id, refundOf: r.refund_of,
  idempotencyKey: r.idempotency_key, deletedAt: r.deleted_at, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at,
});

const mapEntry = (r: Row): LedgerEntry => ({
  id: String(r.id), transactionId: r.transaction_id, accountId: r.account_id, categoryId: r.category_id, amount: n(r.amount_paise), occurredOn: r.occurred_on,
});

const mapCategory = (r: Row): Category => ({
  id: r.id, parentId: r.parent_id, kind: r.kind, name: r.name, icon: r.icon, color: r.color, sortOrder: r.sort_order, archivedAt: r.archived_at, seedKey: r.seed_key,
});

const mapBudget = (r: Row): Budget => ({ id: r.id, categoryId: r.category_id, amount: n(r.amount_paise), warnAtPct: r.warn_at_pct, createdAt: r.created_at });

const mapGoal = (r: Row): SavingsGoal => ({
  id: r.id, name: r.name, target: n(r.target_paise), deadline: r.deadline, mode: r.mode, accountId: r.account_id, color: r.color,
  icon: r.icon, archivedAt: r.archived_at, createdAt: r.created_at,
});

const mapContribution = (r: Row): GoalContribution => ({
  id: r.id, goalId: r.goal_id, amount: n(r.amount_paise), contributedOn: r.contributed_on, accountId: r.account_id,
  transactionId: r.transaction_id, note: r.note, createdAt: r.created_at,
});

const mapRule = (r: Row): RecurringRule => ({
  id: r.id, name: r.name, type: r.type, amount: n(r.amount_paise), accountId: r.account_id, toAccountId: r.to_account_id,
  categoryId: r.category_id, merchant: r.merchant, note: r.note, paymentCardId: r.payment_card_id, frequency: r.frequency,
  interval: r.interval_count, startOn: r.start_on, endOn: r.end_on, anchorDay: r.anchor_day, mode: r.mode, status: r.status,
  activeFrom: r.active_from, createdAt: r.created_at,
});

const mapOccurrence = (r: Row): RecurringOccurrence => ({
  id: r.id, ruleId: r.rule_id, dueOn: r.due_on, status: r.status, transactionId: r.transaction_id, createdAt: r.created_at, resolvedAt: r.resolved_at,
});

const mapSubscription = (r: Row): Subscription => ({ id: r.id, name: r.name, recurringRuleId: r.recurring_rule_id, website: r.website, createdAt: r.created_at });

const mapCard = (r: Row): PaymentCard => ({
  id: r.id, accountId: r.account_id, issuer: r.issuer, network: r.network, cardType: r.card_type, displayName: r.display_name,
  last4: r.last4, artwork: sanitizeArtwork(r.artwork), source: r.source, sortOrder: r.sort_order, seedKey: r.seed_key,
  archivedAt: r.archived_at, createdAt: r.created_at,
});

const mapSettings = (r: Row): CreditCardSettings => ({
  accountId: r.account_id, creditLimit: r.credit_limit_paise == null ? null : n(r.credit_limit_paise), statementDay: r.statement_day,
  dueDays: r.due_days, minDueBps: r.min_due_bps, minDueFloor: n(r.min_due_floor_paise),
});

const mapStatement = (r: Row): CardStatement => ({
  id: r.id, accountId: r.account_id, periodStart: r.period_start, periodEnd: r.period_end, dueOn: r.due_on,
  statementBalance: n(r.statement_balance_paise), minimumDue: n(r.minimum_due_paise), createdAt: r.created_at,
});

function txJson(input: TransactionInput) {
  return {
    type: input.type, amount: input.amount, occurred_on: input.occurredOn, account_id: input.accountId,
    to_account_id: input.toAccountId ?? null, category_id: input.categoryId ?? null, merchant: input.merchant ?? null,
    note: input.note ?? null, payment_card_id: input.paymentCardId ?? null, refund_of: input.refundOf ?? null,
  };
}

function ruleRow(input: Partial<RecurringRuleInput>): Row {
  const row: Row = {};
  const set = (k: string, v: unknown) => {
    if (v !== undefined) row[k] = v;
  };
  set('name', input.name?.trim());
  set('type', input.type);
  set('amount_paise', input.amount);
  set('account_id', input.accountId);
  set('to_account_id', input.toAccountId);
  set('category_id', input.categoryId);
  set('merchant', input.merchant);
  set('note', input.note);
  set('payment_card_id', input.paymentCardId);
  set('frequency', input.frequency);
  set('interval_count', input.interval);
  set('start_on', input.startOn);
  set('end_on', input.endOn);
  set('anchor_day', input.anchorDay);
  set('mode', input.mode);
  return row;
}

export class SupabaseRepository implements Repository {
  readonly mode = 'supabase' as const;
  private systemIds: Record<'income' | 'expense' | 'equity', Uuid> | null = null;

  constructor(readonly client: SupabaseClient) {}

  private async uid(): Promise<Uuid> {
    const { data } = await this.client.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new KoshError('UNAUTHENTICATED');
    return id;
  }

  private check(res: { data: unknown; error: PostgrestError | null }): any {
    if (res.error) throw toKoshError(res.error);
    return res.data;
  }

  private async rpc<T = Row>(fn: string, args: Row): Promise<T> {
    try {
      const res = await this.client.rpc(fn, args);
      return this.check(res) as T;
    } catch (err) {
      throw toKoshError(err);
    }
  }

  private async selectAll(build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: PostgrestError | null }>): Promise<Row[]> {
    const page = 1000;
    const out: Row[] = [];
    for (let from = 0; ; from += page) {
      let res;
      try {
        res = await build(from, from + page - 1);
      } catch (err) {
        throw toKoshError(err);
      }
      const rows = this.check(res) ?? [];
      out.push(...rows);
      if (rows.length < page) return out;
    }
  }

  async ensureSetup(): Promise<void> {
    await this.rpc('ensure_user_setup', {});
  }

  async getProfile(): Promise<Profile> {
    const uid = await this.uid();
    const r = this.check(await this.client.from('profiles').select('*').eq('id', uid).single());
    return { id: r.id, displayName: r.display_name, currency: 'INR', timezone: r.timezone };
  }

  async updateProfile(patch: { displayName?: string | null }): Promise<void> {
    const uid = await this.uid();
    this.check(await this.client.from('profiles').update({ display_name: patch.displayName?.trim() || null }).eq('id', uid));
  }

  async listAccounts(): Promise<Account[]> {
    const rows = this.check(await this.client.from('accounts').select('*').eq('is_system', false).order('sort_order').order('created_at'));
    return rows.map(mapAccount);
  }

  async getSystemAccounts() {
    if (this.systemIds) return this.systemIds;
    const rows = this.check(await this.client.from('accounts').select('id, kind').eq('is_system', true));
    const find = (k: string) => {
      const r = rows.find((x: Row) => x.kind === k);
      if (!r) throw new KoshError('SETUP_REQUIRED');
      return r.id as Uuid;
    };
    this.systemIds = { income: find('income'), expense: find('expense'), equity: find('equity') };
    return this.systemIds;
  }

  async createAccount(input: CreateAccountInput, key: string): Promise<Account> {
    const r = await this.rpc('create_account', {
      p_input: {
        name: input.name, kind: input.kind, institution: input.institution ?? null, color: input.color ?? null, icon: input.icon ?? null,
        opening_balance: input.openingBalance ?? 0, opening_on: input.openingOn ?? null, statement_day: input.statementDay ?? null,
        due_days: input.dueDays ?? null, credit_limit: input.creditLimit ?? null,
      },
      p_idempotency_key: key,
    });
    return mapAccount(r);
  }

  async updateAccount(id: Uuid, patch: AccountPatch): Promise<void> {
    const row: Row = {};
    if (patch.name !== undefined) row.name = patch.name.trim();
    if (patch.institution !== undefined) row.institution = patch.institution?.trim() || null;
    if (patch.color !== undefined) row.color = patch.color;
    if (patch.icon !== undefined) row.icon = patch.icon;
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    this.check(await this.client.from('accounts').update(row).eq('id', id));
  }

  async setAccountArchived(id: Uuid, archived: boolean): Promise<void> {
    this.check(await this.client.from('accounts').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id));
  }

  async reconcileAccount(input: ReconcileInput, key: string): Promise<Transaction | null> {
    const r = await this.rpc<Row | null>('reconcile_account', {
      p_account_id: input.accountId, p_actual_balance: input.actualBalance, p_as_of: input.asOf, p_idempotency_key: key,
    });
    return r && r.id ? mapTransaction(r) : null;
  }

  async listTransactions(q: TransactionQuery = {}): Promise<Transaction[]> {
    const rows = await this.selectAll((from, to) => {
      let query = this.client.from('transactions').select('*');
      if (!q.includeDeleted) query = query.is('deleted_at', null);
      if (q.from) query = query.gte('occurred_on', q.from);
      if (q.to) query = query.lte('occurred_on', q.to);
      if (q.accountId) query = query.or(`account_id.eq.${q.accountId},to_account_id.eq.${q.accountId}`);
      if (q.categoryId) query = query.eq('category_id', q.categoryId);
      if (q.types) query = query.in('type', q.types);
      return query.order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).order('id').range(from, to);
    });
    return rows.map(mapTransaction);
  }

  async getTransaction(id: Uuid): Promise<Transaction | null> {
    const r = this.check(await this.client.from('transactions').select('*').eq('id', id).maybeSingle());
    return r ? mapTransaction(r) : null;
  }

  async postTransaction(input: TransactionInput, key: string): Promise<Transaction> {
    return mapTransaction(await this.rpc('post_transaction', { p_input: txJson(input), p_idempotency_key: key }));
  }

  async updateTransaction(id: Uuid, input: TransactionInput, expectedVersion?: number): Promise<Transaction> {
    return mapTransaction(
      await this.rpc('update_transaction', { p_id: id, p_input: txJson(input), p_expected_version: expectedVersion ?? null }),
    );
  }

  async deleteTransaction(id: Uuid): Promise<void> {
    await this.rpc('delete_transaction', { p_id: id });
  }

  async restoreTransaction(id: Uuid): Promise<Transaction> {
    return mapTransaction(await this.rpc('restore_transaction', { p_id: id }));
  }

  async listLedgerEntries(q: LedgerQuery = {}): Promise<LedgerEntry[]> {
    const rows = await this.selectAll((from, to) => {
      let query = this.client.from('ledger_entries').select('id, transaction_id, account_id, category_id, amount_paise, occurred_on');
      if (q.from) query = query.gte('occurred_on', q.from);
      if (q.to) query = query.lte('occurred_on', q.to);
      if (q.accountId) query = query.eq('account_id', q.accountId);
      return query.order('id').range(from, to);
    });
    return rows.map(mapEntry);
  }

  async listCategories(): Promise<Category[]> {
    return this.check(await this.client.from('categories').select('*').order('sort_order').order('name')).map(mapCategory);
  }

  async createCategory(input: CategoryInput): Promise<Category> {
    if (hasCardLikeNumber(input.name)) throw new KoshError('SENSITIVE_DATA');
    const uid = await this.uid();
    const { data: maxRow } = await this.client.from('categories').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
    const r = this.check(
      await this.client
        .from('categories')
        .insert({
          user_id: uid, name: input.name.trim(), kind: input.kind, parent_id: input.parentId ?? null, icon: input.icon ?? null,
          color: input.color ?? null, sort_order: (maxRow?.sort_order ?? 0) + 1,
        })
        .select('*')
        .single(),
    );
    return mapCategory(r);
  }

  async updateCategory(id: Uuid, patch: Partial<Omit<CategoryInput, 'kind'>> & { archived?: boolean }): Promise<void> {
    const row: Row = {};
    if (patch.name !== undefined) row.name = patch.name.trim();
    if (patch.parentId !== undefined) row.parent_id = patch.parentId;
    if (patch.icon !== undefined) row.icon = patch.icon;
    if (patch.color !== undefined) row.color = patch.color;
    if (patch.archived !== undefined) row.archived_at = patch.archived ? new Date().toISOString() : null;
    this.check(await this.client.from('categories').update(row).eq('id', id));
  }

  async listBudgets(): Promise<Budget[]> {
    return this.check(await this.client.from('budgets').select('*')).map(mapBudget);
  }

  async upsertBudget(input: BudgetInput): Promise<Budget> {
    const uid = await this.uid();
    const row = { user_id: uid, category_id: input.categoryId, amount_paise: input.amount, warn_at_pct: input.warnAtPct ?? 80 };
    let query = this.client.from('budgets').select('id');
    query = input.categoryId ? query.eq('category_id', input.categoryId) : query.is('category_id', null);
    const existing = this.check(await query.maybeSingle());
    const res = existing
      ? await this.client.from('budgets').update(row).eq('id', existing.id).select('*').single()
      : await this.client.from('budgets').insert(row).select('*').single();
    return mapBudget(this.check(res));
  }

  async deleteBudget(id: Uuid): Promise<void> {
    this.check(await this.client.from('budgets').delete().eq('id', id));
  }

  async listGoals(): Promise<SavingsGoal[]> {
    return this.check(await this.client.from('savings_goals').select('*').order('created_at')).map(mapGoal);
  }

  async createGoal(input: GoalInput): Promise<SavingsGoal> {
    return mapGoal(
      await this.rpc('create_goal', {
        p_input: {
          name: input.name, target: input.target, deadline: input.deadline ?? null, mode: input.mode,
          account_id: input.accountId ?? null, color: input.color ?? null, icon: input.icon ?? null,
        },
      }),
    );
  }

  async updateGoal(id: Uuid, patch: GoalPatch): Promise<void> {
    const row: Row = {};
    if (patch.name !== undefined) row.name = patch.name.trim();
    if (patch.target !== undefined) row.target_paise = patch.target;
    if (patch.deadline !== undefined) row.deadline = patch.deadline;
    if (patch.color !== undefined) row.color = patch.color;
    if (patch.icon !== undefined) row.icon = patch.icon;
    if (patch.archived !== undefined) row.archived_at = patch.archived ? new Date().toISOString() : null;
    this.check(await this.client.from('savings_goals').update(row).eq('id', id));
  }

  async deleteGoal(id: Uuid): Promise<void> {
    this.check(await this.client.from('savings_goals').delete().eq('id', id));
  }

  async listGoalContributions(goalId?: Uuid): Promise<GoalContribution[]> {
    let query = this.client.from('goal_contributions').select('*, transactions(deleted_at)');
    if (goalId) query = query.eq('goal_id', goalId);
    const rows = this.check(await query.order('contributed_on', { ascending: false }).order('created_at', { ascending: false }));
    return rows.filter((r: Row) => !r.transaction_id || !r.transactions?.deleted_at).map(mapContribution);
  }

  async addGoalContribution(input: ContributionInput, key: string): Promise<GoalContribution> {
    return mapContribution(
      await this.rpc('add_goal_contribution', {
        p_input: {
          goal_id: input.goalId, amount: input.amount, contributed_on: input.contributedOn ?? null,
          account_id: input.accountId ?? null, note: input.note ?? null,
        },
        p_idempotency_key: key,
      }),
    );
  }

  async updateGoalContribution(id: Uuid, patch: ContributionPatch): Promise<GoalContribution> {
    const p: Row = {};
    if (patch.amount !== undefined) p.amount = patch.amount;
    if (patch.contributedOn !== undefined) p.contributed_on = patch.contributedOn;
    if (patch.accountId !== undefined) p.account_id = patch.accountId;
    if (patch.note !== undefined) p.note = patch.note;
    return mapContribution(await this.rpc('update_goal_contribution', { p_id: id, p_input: p }));
  }

  async deleteGoalContribution(id: Uuid): Promise<void> {
    await this.rpc('delete_goal_contribution', { p_id: id });
  }

  async withdrawFromGoal(input: { goalId: Uuid; amount: Paise; toAccountId: Uuid; on?: IsoDate }, key: string): Promise<Transaction> {
    return mapTransaction(
      await this.rpc('withdraw_from_goal', {
        p_goal_id: input.goalId, p_amount: input.amount, p_to_account_id: input.toAccountId, p_on: input.on ?? null, p_idempotency_key: key,
      }),
    );
  }

  async listRecurringRules(): Promise<RecurringRule[]> {
    return this.check(await this.client.from('recurring_rules').select('*').order('created_at')).map(mapRule);
  }

  async createRecurringRule(input: RecurringRuleInput): Promise<RecurringRule> {
    const uid = await this.uid();
    return mapRule(this.check(await this.client.from('recurring_rules').insert({ ...ruleRow(input), user_id: uid }).select('*').single()));
  }

  async updateRecurringRule(id: Uuid, patch: Partial<RecurringRuleInput>): Promise<void> {
    this.check(await this.client.from('recurring_rules').update(ruleRow(patch)).eq('id', id));
  }

  async setRecurringStatus(id: Uuid, status: RecurringStatus): Promise<void> {
    try {
      this.check(await this.client.from('recurring_rules').update({ status }).eq('id', id));
    } catch (err) {
      throw toKoshError(err);
    }
  }

  async deleteRecurringRule(id: Uuid): Promise<void> {
    this.check(await this.client.from('recurring_rules').delete().eq('id', id));
  }

  async listOccurrences(q: { ruleId?: Uuid; status?: RecurringOccurrence['status'] } = {}): Promise<RecurringOccurrence[]> {
    const rows = await this.selectAll((from, to) => {
      let query = this.client.from('recurring_occurrences').select('*');
      if (q.ruleId) query = query.eq('rule_id', q.ruleId);
      if (q.status) query = query.eq('status', q.status);
      return query.order('due_on').order('id').range(from, to);
    });
    return rows.map(mapOccurrence);
  }

  async materializeOccurrence(ruleId: Uuid, dueOn: IsoDate): Promise<RecurringOccurrence> {
    return mapOccurrence(await this.rpc('materialize_occurrence', { p_rule_id: ruleId, p_due_on: dueOn }));
  }

  async confirmOccurrence(id: Uuid, overrides: { amount?: Paise; occurredOn?: IsoDate } = {}): Promise<RecurringOccurrence> {
    return mapOccurrence(
      await this.rpc('confirm_occurrence', { p_id: id, p_amount: overrides.amount ?? null, p_occurred_on: overrides.occurredOn ?? null }),
    );
  }

  async skipOccurrence(id: Uuid): Promise<RecurringOccurrence> {
    return mapOccurrence(await this.rpc('skip_occurrence', { p_id: id }));
  }

  async listSubscriptions(): Promise<Subscription[]> {
    return this.check(await this.client.from('subscriptions').select('*').order('created_at')).map(mapSubscription);
  }

  async createSubscription(input: SubscriptionInput): Promise<Subscription> {
    return mapSubscription(
      await this.rpc('create_subscription', {
        p_input: {
          name: input.name, amount: input.amount, account_id: input.accountId, category_id: input.categoryId,
          payment_card_id: input.paymentCardId ?? null, frequency: input.frequency, interval: input.interval ?? 1,
          start_on: input.startOn, end_on: input.endOn ?? null, anchor_day: input.anchorDay ?? null, mode: input.mode,
          website: input.website ?? null, merchant: input.merchant ?? null, note: input.note ?? null,
        },
      }),
    );
  }

  async updateSubscription(id: Uuid, patch: { name?: string; website?: string | null }): Promise<void> {
    const row: Row = {};
    if (patch.name !== undefined) row.name = patch.name.trim();
    if (patch.website !== undefined) row.website = patch.website?.trim() || null;
    this.check(await this.client.from('subscriptions').update(row).eq('id', id));
  }

  async deleteSubscription(id: Uuid): Promise<void> {
    const s = this.check(await this.client.from('subscriptions').select('recurring_rule_id').eq('id', id).maybeSingle());
    if (!s) throw new KoshError('NOT_FOUND');
    await this.deleteRecurringRule(s.recurring_rule_id);
  }

  async listPaymentCards(): Promise<PaymentCard[]> {
    return this.check(await this.client.from('payment_cards').select('*').order('sort_order').order('created_at')).map(mapCard);
  }

  private cardRow(input: Partial<PaymentCardInput>): Row {
    const row: Row = {};
    if (input.accountId !== undefined) row.account_id = input.accountId;
    if (input.issuer !== undefined) row.issuer = input.issuer.trim();
    if (input.network !== undefined) row.network = input.network;
    if (input.cardType !== undefined) row.card_type = input.cardType;
    if (input.displayName !== undefined) row.display_name = input.displayName?.trim() || null;
    if (input.last4 !== undefined) row.last4 = normalizeLast4(input.last4);
    if (input.artwork !== undefined) row.artwork = sanitizeArtwork(input.artwork);
    for (const v of [row.issuer, row.display_name]) if (hasCardLikeNumber(v)) throw new KoshError('SENSITIVE_DATA');
    return row;
  }

  async createPaymentCard(input: PaymentCardInput): Promise<PaymentCard> {
    const uid = await this.uid();
    const { data: maxRow } = await this.client.from('payment_cards').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
    const row = { ...this.cardRow(input), user_id: uid, source: input.source, sort_order: (maxRow?.sort_order ?? 0) + 1 };
    return mapCard(this.check(await this.client.from('payment_cards').insert(row).select('*').single()));
  }

  async updatePaymentCard(id: Uuid, patch: PaymentCardPatch): Promise<void> {
    const row = this.cardRow(patch);
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    if (patch.archived !== undefined) row.archived_at = patch.archived ? new Date().toISOString() : null;
    this.check(await this.client.from('payment_cards').update(row).eq('id', id));
  }

  async deletePaymentCard(id: Uuid): Promise<void> {
    this.check(await this.client.from('payment_cards').delete().eq('id', id));
  }

  async listCreditCardSettings(): Promise<CreditCardSettings[]> {
    return this.check(await this.client.from('credit_card_settings').select('*')).map(mapSettings);
  }

  async upsertCreditCardSettings(input: CreditCardSettingsInput): Promise<CreditCardSettings> {
    const uid = await this.uid();
    const row = {
      account_id: input.accountId, user_id: uid, credit_limit_paise: input.creditLimit ?? null, statement_day: input.statementDay,
      due_days: input.dueDays ?? 20, min_due_bps: input.minDueBps ?? 500, min_due_floor_paise: input.minDueFloor ?? 20000,
    };
    return mapSettings(this.check(await this.client.from('credit_card_settings').upsert(row).select('*').single()));
  }

  async listCardStatements(accountId?: Uuid): Promise<CardStatement[]> {
    let query = this.client.from('card_statements').select('*');
    if (accountId) query = query.eq('account_id', accountId);
    return this.check(await query.order('period_end', { ascending: false })).map(mapStatement);
  }

  async closeCardStatement(accountId: Uuid, periodEnd: IsoDate): Promise<CardStatement> {
    return mapStatement(await this.rpc('close_card_statement', { p_account_id: accountId, p_period_end: periodEnd }));
  }

  async askAssistant(messages: AssistantMessage[]): Promise<AssistantReply> {
    const { data, error } = await this.client.functions.invoke<{ reply?: string }>('assistant', { body: { messages } });
    if (error) {
      if ((error as { context?: Response }).context?.status === 503) return { status: 'not_configured' };
      throw error;
    }
    return { status: 'ok', reply: data?.reply ?? 'No answer.' };
  }
}
