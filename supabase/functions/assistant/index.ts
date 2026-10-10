/**
 * Kosh read-only finance assistant (Supabase Edge Function, Deno).
 *
 * - The OpenAI API key lives only here (OPENAI_API_KEY secret); the browser never sees it.
 * - The model can ONLY call the fixed, read-only tools below. Each runs one SQL function with the
 *   caller's JWT, so row-level security limits it to the caller's own data. No tool writes, no
 *   arbitrary SQL, and no tool returns card details (cards, numbers, images are never sent).
 * - If the key is not configured, returns 503 { error: "not_configured" } and the app shows setup steps.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

const MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-5.4-mini';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_TOOL_ROUNDS = 6;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SYSTEM = `You are Kosh's read-only money assistant for one person in India.
Answer questions about their own finances using ONLY the tools provided. Every number you state must come from a tool result — never estimate, invent or do your own arithmetic on money when a tool can give the figure.
Currency is INR. Write amounts like ₹1,23,456.50 (Indian digit grouping). Dates are in Asia/Kolkata; today's date is in assistant_overview.
You cannot change anything: you cannot add, edit or delete transactions, budgets, goals or accounts. If asked to, say so briefly and tell them where in the app to do it.
Never ask for or discuss card numbers, CVV, PINs, passwords or bank credentials.
Keep answers short and concrete: a direct answer first, then at most a few supporting figures. Use plain sentences or a short list.`;

type ToolInput = Record<string, unknown>;

const dateField = { type: 'string', description: 'Calendar date YYYY-MM-DD' };
const TOOL_DEFS = [
  {
    name: 'assistant_overview',
    description: "Net worth, available cash, card debt, this month's spending and income, and every account balance. Also returns today's date.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'assistant_spending',
    description: 'Total spending (or income) between two dates, grouped by category, parent_category, month or merchant (top 40 groups, largest first).',
    input_schema: {
      type: 'object',
      properties: {
        from: dateField,
        to: dateField,
        group_by: { type: 'string', enum: ['category', 'parent_category', 'month', 'merchant'] },
        kind: { type: 'string', enum: ['expense', 'income'] },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'assistant_budgets',
    description: 'Monthly budgets with spent, remaining, percent used and state (ok / warning / over). Category budgets include subcategories.',
    input_schema: { type: 'object', properties: { month: { type: 'string', description: 'Any date in the month, YYYY-MM-DD; default this month' } } },
  },
  {
    name: 'assistant_find_transactions',
    description: 'Find transactions (newest first, max 50) by date range, text in merchant/note, category name or type.',
    input_schema: {
      type: 'object',
      properties: {
        from: dateField,
        to: dateField,
        text: { type: 'string' },
        category: { type: 'string', description: 'Category or category group name' },
        type: { type: 'string', enum: ['expense', 'income', 'transfer', 'card_payment', 'refund', 'goal_transfer', 'opening_balance', 'adjustment'] },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: 'assistant_goals',
    description: 'Savings goals with target, saved amount, progress and deadline.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'assistant_upcoming',
    description: 'Recurring items and subscriptions due in the next N days (1-120).',
    input_schema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 120 } } },
  },
];

const TOOLS = TOOL_DEFS.map((t) => ({
  type: 'function' as const,
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}));

type ChatMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };
type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, max = 80) => (typeof v === 'string' && v.length <= max ? v : undefined);
const date = (v: unknown) => (typeof v === 'string' && ISO.test(v) ? v : undefined);
const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : undefined);

/** Map a tool call to its SQL function arguments (validated). */
function toRpc(name: string, input: ToolInput): { fn: string; args: Record<string, unknown> } {
  switch (name) {
    case 'assistant_overview':
    case 'assistant_goals':
      return { fn: name, args: {} };
    case 'assistant_spending': {
      const from = date(input.from);
      const to = date(input.to);
      if (!from || !to) throw new Error('from and to must be YYYY-MM-DD dates');
      return { fn: name, args: { p_from: from, p_to: to, p_group_by: str(input.group_by) ?? 'category', p_kind: str(input.kind) ?? 'expense' } };
    }
    case 'assistant_budgets':
      return { fn: name, args: { p_month: date(input.month) ?? null } };
    case 'assistant_find_transactions':
      return {
        fn: name,
        args: {
          p_from: date(input.from) ?? null,
          p_to: date(input.to) ?? null,
          p_text: str(input.text) ?? null,
          p_category: str(input.category) ?? null,
          p_type: str(input.type, 20) ?? null,
          p_limit: int(input.limit) ?? 20,
        },
      };
    case 'assistant_upcoming':
      return { fn: name, args: { p_days: int(input.days) ?? 30 } };
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return json({ error: 'not_configured' }, 503);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthenticated' }, 401);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return json({ error: 'unauthenticated' }, 401);

  // Only plain text turns are accepted from the client; earlier tool calls are not replayed.
  let body: { messages?: { role?: string; content?: string }[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const history = (body.messages ?? []).slice(-20);
  if (
    history.length === 0 ||
    history.some((m) => (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || m.content.length === 0 || m.content.length > 4000) ||
    history[history.length - 1]!.role !== 'user'
  ) {
    return json({ error: 'bad_request' }, 400);
  }
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content! })),
  ];

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          max_completion_tokens: 4000,
          messages,
          // The last round offers no tools, forcing a final text answer.
          ...(round < MAX_TOOL_ROUNDS ? { tools: TOOLS } : {}),
        }),
      });
      if (res.status === 401) return json({ error: 'not_configured' }, 503);
      if (res.status === 429) return json({ error: 'rate_limited' }, 429);
      if (!res.ok) {
        console.error('assistant upstream', res.status, await res.text());
        return json({ error: 'upstream_error' }, 502);
      }
      const data = await res.json();
      const choice = data.choices?.[0];
      const msg = choice?.message as { content?: string | null; refusal?: string | null; tool_calls?: ToolCall[] } | undefined;
      if (!msg) return json({ error: 'upstream_error' }, 502);
      if (msg.refusal) {
        return json({ reply: "I can't help with that one. Try asking about your spending, budgets, balances or goals." });
      }

      const calls = msg.tool_calls ?? [];
      if (calls.length === 0) {
        return json({ reply: msg.content?.trim() || 'I could not find an answer to that.' });
      }
      messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: calls });

      const results = await Promise.all(
        calls.map(async (call): Promise<ChatMessage> => {
          try {
            const input = JSON.parse(call.function.arguments || '{}') as ToolInput;
            const { fn, args } = toRpc(call.function.name, input);
            const { data: rows, error } = await supabase.rpc(fn, args);
            if (error) throw new Error(error.message);
            return { role: 'tool', tool_call_id: call.id, content: JSON.stringify(rows) };
          } catch (err) {
            return { role: 'tool', tool_call_id: call.id, content: `Error: ${(err as Error).message}` };
          }
        }),
      );
      messages.push(...results);
    }
    return json({ reply: 'That needed too many steps. Try a narrower question.' });
  } catch (err) {
    console.error('assistant error', err);
    return json({ error: 'upstream_error' }, 502);
  }
});
