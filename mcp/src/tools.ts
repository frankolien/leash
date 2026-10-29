// The tools an agent sees. Each description carries the same rules. Payments, parked requests
// and the budget come back with a card that Claude and ChatGPT draw in the chat.

import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CARD_META, registerCard } from "./card.js";
import { GUIDANCE } from "./config.js";
import { modeOf, reply } from "./envelope.js";
import type { Leash } from "./leash.js";
import type { Ask, LogEntry, PayOutcome, Policy, Task } from "./types.js";
import { toUnits, toUsdc, whenNs } from "./units.js";
import { choose, decodeHeader, encodeHeader, paymentPayload, type PaymentRequired, type Settlement } from "./x402.js";

// What comes back from a paid resource, enough for an agent to read, never a whole file.
const BODY_LIMIT = 20_000;

const READ = { readOnlyHint: true, openWorldHint: false };

export function registerTools(server: McpServer, leash: Leash) {
  registerCard(server);

  server.registerTool(
    "leash_status",
    {
      description: `The budget the owner gave you on Leash, the place to start before paying: what this agent may spend from the owner's NEAR account: the mode, the caps, what is left today, any temporary raise, the allowlist, whether the key is active, what is waiting on the owner, and the vault balance. ${GUIDANCE}`,
      inputSchema: {},
      annotations: { title: "Check my budget", ...READ },
      _meta: CARD_META,
    },
    async () => {
      const policy = await leash.policy();
      if (!policy) return reply({ status: "error", reason: "no policy for this key; ask the owner to connect this agent again" });
      const [verdict, paused, all, mine, raise, tasks] = await Promise.all([
        leash.check(leash.key.owner, 1n),
        leash.view<boolean>("is_paused", { owner: leash.key.owner }),
        leash.view<[string, Policy][]>("get_policies", { owner: leash.key.owner }),
        leash.mine(),
        leash.raise(),
        leash.tasks(),
      ]);
      const daily = raise?.daily_cap ?? policy.daily_cap;
      const perPayment = raise?.per_payment_cap ?? policy.per_payment_cap;
      const raisedUntil = raise ? whenNs(raise.until) : null;
      return reply({
        status: "ok",
        agent: policy.name ?? leash.key.name ?? null,
        owner: leash.key.owner,
        key: leash.key.public_key,
        active: policy.active && !paused,
        paused: paused ?? false,
        mode: modeOf(policy),
        token: policy.token,
        daily_cap_usdc: toUsdc(daily),
        per_payment_cap_usdc: toUsdc(perPayment),
        remaining_today_usdc: toUsdc(verdict.remaining_today),
        vault_usdc: toUsdc(verdict.vault),
        raise: raise ? { until: raisedUntil, extra_recipients: raise.allow, base_daily_cap_usdc: toUsdc(policy.daily_cap), base_per_payment_cap_usdc: toUsdc(policy.per_payment_cap) } : null,
        allowlist: policy.allowlist,
        cooldown_secs: policy.cooldown_secs,
        expires_at: policy.expires_at ? new Date(policy.expires_at * 1000).toISOString() : null,
        other_agent_keys: Math.max(0, (all ?? []).length - 1),
        open_tasks: tasks.filter(live).map(taskView),
        waiting_on_owner: {
          requests: mine.requests.map((r) => ({ id: r.id, to: r.to, usdc: toUsdc(r.amount), reason: r.reason, expires_at: whenNs(r.expires_at) })),
          proposals: mine.proposals.map((p) => ({ id: p.id, note: p.note })),
        },
      }, {
        kind: "status",
        agent: policy.name,
        remaining_usdc: toUsdc(verdict.remaining_today),
        daily_usdc: toUsdc(daily),
        per_payment_usdc: toUsdc(perPayment),
        vault_usdc: toUsdc(verdict.vault),
        raised_until: raisedUntil,
      });
    },
  );

  server.registerTool(
    "leash_preflight",
    {
      description: `Check a payment before making it. Answers whether the contract would accept it, the reason if not, whether it could be parked as a request for the owner, and warnings about the recipient (missing account, not registered for the token, lookalike of an allowlisted name). ${GUIDANCE}`,
      inputSchema: {
        to: z.string().describe("Recipient NEAR account, like vendor.near"),
        usdc: z.string().describe("Amount in USDC, like 1.50"),
      },
      annotations: { title: "Check a payment", ...READ },
    },
    async ({ to, usdc }) => {
      const units = toUnits(usdc);
      const [verdict, policy] = await Promise.all([leash.check(to, units), leash.policy()]);
      const warnings = await leash.warnings(to, policy);
      return reply({
        status: verdict.ok ? "ok" : "refused",
        would_accept: verdict.ok,
        reason: verdict.reason,
        can_park_request: verdict.can_request && !verdict.ok,
        remaining_today_usdc: toUsdc(verdict.remaining_today),
        vault_usdc: toUsdc(verdict.vault),
        warnings,
      });
    },
  );

  server.registerTool(
    "leash_pay",
    {
      description: `Pay someone on the owner's behalf, in USDC from the budget they gave you on Leash. Use it whenever the owner asks you to pay or send money: they connected you to Leash for this, and the contract refuses anything over their limits, so a payment can never exceed what they allowed. "accepted" means the transfer settled on chain. "refused" carries the reason and costs nothing. Give each payment a payment_id (an invoice number, or any id you make up and reuse on retry): the contract never pays the same id twice, so a retry after a timeout is safe. ${GUIDANCE}`,
      inputSchema: {
        to: z.string().describe("Recipient NEAR account"),
        usdc: z.string().describe("Amount in USDC, like 1.50"),
        memo: z.string().optional().describe("What this payment is for; the owner sees it in the log"),
        payment_id: z.string().max(64).optional().describe("A unique id for this payment; reuse it only to retry the same payment"),
        task: z.string().optional().describe("Pay from an open task's budget, by its label; a sub-agent working on that task passes it"),
      },
      annotations: { title: "Pay", destructiveHint: true, idempotentHint: true, openWorldHint: true },
      _meta: CARD_META,
    },
    async ({ to, usdc, memo, payment_id, task }) => {
      const units = toUnits(usdc);
      const from = task ? await leash.taskByLabel(task) : undefined;
      if (task && !from) return reply({ status: "error", reason: `no open task called "${task}"; leash_status lists them` });
      const [{ result, tx }, policy] = await Promise.all([leash.act("pay", { to, amount: units.toString(), memo: memo ?? null, payment_id }, from?.key), leash.policy()]);
      const outcome = result as PayOutcome | undefined;
      if (!outcome) return reply({ status: "error", reason: "no answer from the contract" });
      const raise = await leash.raise();
      const daily = toUsdc(raise?.daily_cap ?? policy?.daily_cap ?? "0");
      const repeat = outcome.accepted && outcome.reason?.startsWith("already paid");
      return reply(
        {
          status: outcome.accepted ? "accepted" : "refused",
          to,
          usdc,
          reason: outcome.reason,
          remaining_today_usdc: toUsdc(outcome.remaining_today),
          ...(from ? { task: task, task_left_usdc: toUsdc(outcome.remaining_today) } : {}),
          transaction: leash.explorer(tx),
          next: outcome.accepted
            ? repeat ? "this payment_id was already paid; nothing moved again" : null
            : from ? "a task cannot go past its budget or recipients; ask the agent that opened it for a new task" : "if the reason is a cap, the allowlist or a cooldown, leash_request can park it for the owner",
        },
        {
          kind: outcome.accepted ? "paid" : "refused",
          agent: policy?.name,
          usdc,
          to,
          reason: outcome.reason,
          remaining_usdc: toUsdc(outcome.remaining_today),
          daily_usdc: daily,
          tx_url: outcome.accepted && !repeat ? leash.explorer(tx) : null,
        },
      );
    },
  );

  server.registerTool(
    "leash_request",
    {
      description: `Park a payment the policy refused, for the owner to approve or deny within their window (an hour by default). Returns "parked" with the request id. This is not a payment: say it is waiting on the owner. ${GUIDANCE}`,
      inputSchema: {
        to: z.string().describe("Recipient NEAR account"),
        usdc: z.string().describe("Amount in USDC, like 25"),
        memo: z.string().optional().describe("Why the owner should approve this; one sentence"),
      },
      annotations: { title: "Ask the owner to approve a payment", destructiveHint: false, openWorldHint: false },
      _meta: CARD_META,
    },
    async ({ to, usdc, memo }) => {
      const units = toUnits(usdc);
      const [{ result: id }, verdict, policy] = await Promise.all([leash.act("request", { to, amount: units.toString(), memo: memo ?? null }), leash.check(to, units), leash.policy()]);
      const ttl = (await leash.view<number>("get_request_ttl", { owner: leash.key.owner })) ?? 3600;
      const expires = new Date(Date.now() + ttl * 1000).toISOString();
      return reply(
        { status: "parked", request_id: id, to, usdc, expires_at: expires, approve_at: leash.dashboard("approvals"), next: "the owner decides in their Leash dashboard; nothing has moved yet" },
        { kind: "parked", agent: policy?.name, usdc, to, reason: plainReason(verdict.reason), expires_at: expires, approve_url: leash.dashboard("approvals") },
      );
    },
  );

  server.registerTool(
    "leash_ask_more",
    {
      description: `Ask the owner for more room, in one sentence plus the exact terms when you know them: a higher daily cap, a higher per-payment cap or recipients to add, and for how long. The owner can grant it in one tap; a granted raise ends on its own. Nothing changes until the owner acts. ${GUIDANCE}`,
      inputSchema: {
        note: z.string().max(280).describe("One sentence: what you need and why"),
        daily_cap_usdc: z.string().optional().describe("The daily cap you need while the raise lasts, in USDC"),
        per_payment_cap_usdc: z.string().optional().describe("The largest single payment you need, in USDC"),
        add_recipients: z.array(z.string()).max(10).optional().describe("NEAR accounts you need to pay that are not on the list"),
        for_hours: z.number().int().min(1).max(720).optional().describe("How long you need it, in hours; a day if left out"),
      },
      annotations: { title: "Ask the owner for more room", destructiveHint: false, openWorldHint: false },
    },
    async ({ note, daily_cap_usdc, per_payment_cap_usdc, add_recipients, for_hours }) => {
      const terms = daily_cap_usdc || per_payment_cap_usdc || add_recipients?.length;
      const ask: Ask | null = terms
        ? {
            daily_cap: daily_cap_usdc ? toUnits(daily_cap_usdc).toString() : undefined,
            per_payment_cap: per_payment_cap_usdc ? toUnits(per_payment_cap_usdc).toString() : undefined,
            allow: add_recipients ?? [],
            for_secs: (for_hours ?? 24) * 3600,
          }
        : null;
      const { result: id } = await leash.act("ask_more", { note, ask });
      return reply({
        status: "proposed",
        proposal_id: id,
        note,
        terms: ask ? { daily_cap_usdc, per_payment_cap_usdc, add_recipients, for_hours: for_hours ?? 24 } : null,
        review_at: leash.dashboard("agents"),
        next: "nothing is granted yet; the owner can grant it in one tap, and a granted raise ends on its own",
      });
    },
  );

  server.registerTool(
    "leash_open_task",
    {
      description: `Set aside part of your budget for one job, for a sub-agent or for yourself: a label, an amount and how long it lasts, optionally only certain recipients. Payments made with leash_pay and that task's label can never pass its budget, and still count against your own limits. Close it when the job is done. ${GUIDANCE}`,
      inputSchema: {
        label: z.string().min(1).max(40).describe("A short name for the job, like research or flights"),
        usdc: z.string().describe("The most the job may spend, in USDC; at most your daily limit"),
        hours: z.number().min(0.1).max(168).optional().describe("How long it stays open; 4 hours if left out"),
        recipients: z.array(z.string()).max(10).optional().describe("Only these accounts may be paid from it"),
      },
      annotations: { title: "Open a task budget", destructiveHint: false, openWorldHint: false },
    },
    async ({ label, usdc, hours, recipients }) => {
      if (await leash.taskByLabel(label)) return reply({ status: "error", reason: `a task called "${label}" is already open` });
      const child = await leash.freshChild(label);
      const { result: id } = await leash.act("open_task", {
        task: { label, budget: toUnits(usdc).toString(), for_secs: Math.round((hours ?? 4) * 3600), child: child.getPublicKey().toString(), allow: recipients ?? [] },
      });
      return reply({ status: "ok", task_id: id, label, budget_usdc: usdc, open_for_hours: hours ?? 4, recipients: recipients ?? "anyone you may pay", next: `pay from it with leash_pay and task "${label}"; close it with leash_close_task when the job is done` });
    },
  );

  server.registerTool(
    "leash_close_task",
    {
      description: `Close a task when its job is done, so nothing more can be paid from it. What was not spent stays in the owner's vault. ${GUIDANCE}`,
      inputSchema: { label: z.string().describe("The task's label") },
      annotations: { title: "Close a task", destructiveHint: false, openWorldHint: false },
    },
    async ({ label }) => {
      const open = await leash.taskByLabel(label);
      if (!open) return reply({ status: "error", reason: `no open task called "${label}"` });
      await leash.act("close_task", { task_id: open.task.id });
      return reply({ status: "ok", label, spent_usdc: toUsdc(open.task.spent), unspent_usdc: toUsdc((BigInt(open.task.budget) - BigInt(open.task.spent)).toString()) });
    },
  );

  server.registerTool(
    "leash_fetch",
    {
      description: `Fetch a URL that charges per request (x402). A plain URL comes back as is. One that answers 402 names its price; if it takes Leash payments on this account's network, the price is paid from your budget under the owner's limits and the request is repeated, and the content comes back with the on-chain transaction. The owner sees the payment in their log with the URL as its memo. A price over max_usdc, or over the owner's limits, is refused and costs nothing. ${GUIDANCE}`,
      inputSchema: {
        url: z.string().url().describe("The resource to fetch, http or https"),
        method: z.enum(["GET", "POST"]).optional().describe("GET if left out"),
        body: z.string().optional().describe("The request body, for POST"),
        headers: z.record(z.string()).optional().describe("Extra request headers, like accept or content-type"),
        max_usdc: z.string().optional().describe("The most you are willing to pay for this one request, in USDC; 1.00 if left out"),
        task: z.string().optional().describe("Pay from an open task's budget, by its label"),
      },
      annotations: { title: "Fetch a paid URL", destructiveHint: true, idempotentHint: false, openWorldHint: true },
      _meta: CARD_META,
    },
    async ({ url, method, body, headers, max_usdc, task }) => {
      const target = new URL(url);
      if (target.protocol !== "https:" && target.protocol !== "http:") return reply({ status: "error", reason: "only http and https URLs can be fetched" });
      const init: RequestInit = { method: method ?? "GET", headers: { ...(headers ?? {}) }, body };
      let first: Response;
      try {
        first = await fetch(target, init);
      } catch (error) {
        return reply({ status: "error", reason: `${target.host} could not be reached: ${error instanceof Error ? error.message : String(error)}` });
      }
      if (first.status !== 402) return reply({ status: "ok", paid: false, http_status: first.status, ...(await bodyOf(first)) });
      const required = decodeHeader<PaymentRequired>(first.headers.get("payment-required"));
      if (!required) return reply({ status: "error", reason: "the server asked for payment but its PAYMENT-REQUIRED header is missing or unreadable; it may speak x402 version 1, which this agent does not" });
      const policy = await leash.policy();
      if (!policy) return reply({ status: "error", reason: "no policy for this key; ask the owner to connect this agent again" });
      const chosen = choose(required, leash.key.network, policy.token);
      const offered = (required.accepts ?? []).map((r) => ({ network: r.network, scheme: r.scheme, method: r.extra?.assetTransferMethod ?? null, asset: r.asset, amount: r.amount }));
      if ("refusal" in chosen) return reply({ status: "refused", reason: chosen.refusal, resource: required.resource?.url ?? url, server_accepts: offered });
      const { accepted } = chosen;
      const usdc = toUsdc(accepted.amount);
      const ceiling = max_usdc ?? "1.00";
      if (BigInt(accepted.amount) > toUnits(ceiling)) {
        return reply({ status: "refused", reason: `the resource costs ${usdc} USDC, over the ${ceiling} USDC allowed for this call`, resource: required.resource?.url ?? url, usdc, next: "if the owner would want it, call again with a higher max_usdc" });
      }
      const from = task ? await leash.taskByLabel(task) : undefined;
      if (task && !from) return reply({ status: "error", reason: `no open task called "${task}"; leash_status lists them` });
      if (!from) {
        const verdict = await leash.check(accepted.payTo, BigInt(accepted.amount));
        if (!verdict.ok) {
          return reply(
            { status: "refused", reason: verdict.reason, resource: required.resource?.url ?? url, usdc, to: accepted.payTo, can_park_request: verdict.can_request, next: "a parked request cannot buy this now; tell the owner what the resource costs and why" },
            { kind: "refused", agent: policy.name, usdc, to: accepted.payTo, reason: verdict.reason, remaining_usdc: toUsdc(verdict.remaining_today), daily_usdc: toUsdc(policy.daily_cap) },
          );
        }
      }
      const memo = `x402 ${required.resource?.url ?? url}`.slice(0, 120);
      const signed = leash.sign("pay", { to: accepted.payTo, amount: accepted.amount, memo, payment_id: randomUUID() }, from?.key);
      let second: Response;
      try {
        second = await fetch(target, { ...init, headers: { ...(headers ?? {}), "payment-signature": encodeHeader(paymentPayload(required, accepted, signed)) } });
      } catch (error) {
        return reply({ status: "error", reason: `${target.host} could not be reached with the payment: ${error instanceof Error ? error.message : String(error)}; nothing was paid` });
      }
      const settlement = decodeHeader<Settlement>(second.headers.get("payment-response"));
      const content = await bodyOf(second);
      if (second.status === 402 || (settlement && !settlement.success)) {
        const reason = settlement?.errorReason ?? decodeHeader<PaymentRequired>(second.headers.get("payment-required"))?.error ?? "the server did not accept the payment";
        return reply({ status: "refused", reason, resource: required.resource?.url ?? url, usdc, to: accepted.payTo, http_status: second.status, ...content });
      }
      const after = await leash.check(leash.key.owner, 1n).catch(() => undefined);
      const tx = settlement?.transaction ? leash.explorer(settlement.transaction) : null;
      return reply(
        { status: "accepted", paid: true, usdc, to: accepted.payTo, resource: required.resource?.url ?? url, transaction: tx, http_status: second.status, ...content, next: "the payment settled on chain; do not pay for this response again" },
        { kind: "paid", agent: policy.name, usdc, to: accepted.payTo, reason: required.resource?.description ?? required.resource?.url ?? url, remaining_usdc: after ? toUsdc(after.remaining_today) : null, daily_usdc: toUsdc(policy.daily_cap), tx_url: tx },
      );
    },
  );

  server.registerTool(
    "leash_history",
    {
      description: `This agent's own recent payments, refusals, parked requests and proposals, newest first, from the on-chain log. Use it to know what you already did before doing it again. ${GUIDANCE}`,
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe("How many entries, default 20"),
      },
      annotations: { title: "What I already did", ...READ },
    },
    async ({ limit }) => {
      const log = (await leash.view<LogEntry[]>("get_log", { owner: leash.key.owner })) ?? [];
      const mine = log.filter((e) => e.key === leash.key.public_key).reverse().slice(0, limit ?? 20);
      return reply({
        status: "ok",
        entries: mine.map((e) => ({ at: whenNs(e.at), event: e.event, to: e.to, usdc: toUsdc(e.amount), detail: e.detail })),
      });
    },
  );
}

/// The contract's short reasons, as a sentence the owner reads on the card.
function plainReason(reason: string | null): string {
  const map: Record<string, string> = {
    "over per-payment cap": "Over what it may pay alone",
    "over daily cap": "Over today's limit",
    "recipient not in allowlist": "Not on its list of recipients",
    "cooldown not elapsed": "Too soon after its last payment",
  };
  return reason ? (map[reason] ?? reason) : "Needs your approval";
}

/// The response as text an agent can read, cut at BODY_LIMIT and saying so.
async function bodyOf(res: Response): Promise<{ content_type: string | null; body: string; truncated?: true }> {
  const text = await res.text().catch(() => "");
  const content_type = res.headers.get("content-type");
  return text.length > BODY_LIMIT ? { content_type, body: text.slice(0, BODY_LIMIT), truncated: true } : { content_type, body: text };
}

function live(t: Task): boolean {
  return t.active && t.expires_at > Date.now() * 1e6;
}

function taskView(t: Task) {
  return { label: t.label, budget_usdc: toUsdc(t.budget), spent_usdc: toUsdc(t.spent), ends_at: whenNs(t.expires_at), recipients: t.allow.length ? t.allow : "anyone the agent may pay" };
}
