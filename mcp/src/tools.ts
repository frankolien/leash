// The six tools an agent sees. Each description carries the same rules.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GUIDANCE } from "./config.js";
import { modeOf, reply } from "./envelope.js";
import type { Leash } from "./leash.js";
import type { LogEntry, PayOutcome, Policy } from "./types.js";
import { toUnits, toUsdc, whenNs } from "./units.js";

export function registerTools(server: McpServer, leash: Leash) {
  server.registerTool(
    "leash_status",
    {
      description: `What this agent may spend from the owner's NEAR account: the mode, the caps, what is left today, the allowlist, whether the key is active, what is waiting on the owner, and the vault balance. ${GUIDANCE}`,
      inputSchema: {},
    },
    async () => {
      const policy = await leash.policy();
      if (!policy) return reply({ status: "error", reason: "no policy for this key; ask the owner to run `leash grant`" });
      const [verdict, paused, all, mine] = await Promise.all([
        leash.check(leash.key.owner, 1n),
        leash.view<boolean>("is_paused", { owner: leash.key.owner }),
        leash.view<[string, Policy][]>("get_policies", { owner: leash.key.owner }),
        leash.mine(),
      ]);
      return reply({
        status: "ok",
        agent: policy.name ?? leash.key.name ?? null,
        owner: leash.key.owner,
        key: leash.key.public_key,
        active: policy.active && !paused,
        paused: paused ?? false,
        mode: modeOf(policy),
        token: policy.token,
        daily_cap_usdc: toUsdc(policy.daily_cap),
        per_payment_cap_usdc: toUsdc(policy.per_payment_cap),
        remaining_today_usdc: toUsdc(verdict.remaining_today),
        vault_usdc: toUsdc(verdict.vault),
        allowlist: policy.allowlist,
        cooldown_secs: policy.cooldown_secs,
        expires_at: policy.expires_at ? new Date(policy.expires_at * 1000).toISOString() : null,
        other_agent_keys: Math.max(0, (all ?? []).length - 1),
        waiting_on_owner: {
          requests: mine.requests.map((r) => ({ id: r.id, to: r.to, usdc: toUsdc(r.amount), reason: r.reason, expires_at: whenNs(r.expires_at) })),
          proposals: mine.proposals.map((p) => ({ id: p.id, note: p.note })),
        },
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
      description: `Pay USDC from the owner's account within the policy. "accepted" means the transfer settled on chain. "refused" carries the reason and costs nothing. Never call this twice for one payment. ${GUIDANCE}`,
      inputSchema: {
        to: z.string().describe("Recipient NEAR account"),
        usdc: z.string().describe("Amount in USDC, like 1.50"),
        memo: z.string().optional().describe("What this payment is for; the owner sees it in the log"),
      },
    },
    async ({ to, usdc, memo }) => {
      const units = toUnits(usdc);
      const outcome = (await leash.call("pay", { to, amount: units.toString(), memo: memo ?? null })) as PayOutcome | undefined;
      if (!outcome) return reply({ status: "error", reason: "no answer from the contract" });
      return reply({
        status: outcome.accepted ? "accepted" : "refused",
        to,
        usdc,
        reason: outcome.reason,
        remaining_today_usdc: toUsdc(outcome.remaining_today),
        next: outcome.accepted ? null : "if the reason is a cap, the allowlist or a cooldown, leash_request can park it for the owner",
      });
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
    },
    async ({ to, usdc, memo }) => {
      const units = toUnits(usdc);
      const id = await leash.call("request", { to, amount: units.toString(), memo: memo ?? null });
      const ttl = (await leash.view<number>("get_request_ttl", { owner: leash.key.owner })) ?? 3600;
      return reply({ status: "parked", request_id: id, to, usdc, expires_in_secs: ttl, next: "the owner decides in their dashboard or with `leash approve <id>`" });
    },
  );

  server.registerTool(
    "leash_ask_more",
    {
      description: `Ask the owner for a wider policy in one sentence, for example a higher daily cap or a new allowed recipient. Nothing changes until the owner acts; the note appears beside this key in their dashboard. ${GUIDANCE}`,
      inputSchema: {
        note: z.string().max(280).describe("One sentence: what you need and why"),
      },
    },
    async ({ note }) => {
      const id = await leash.call("ask_more", { note });
      return reply({ status: "proposed", proposal_id: id, note, next: "nothing is granted yet; the owner may change the policy or dismiss this" });
    },
  );

  server.registerTool(
    "leash_history",
    {
      description: `This agent's own recent payments, refusals, parked requests and proposals, newest first, from the on-chain log. Use it to know what you already did before doing it again. ${GUIDANCE}`,
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe("How many entries, default 20"),
      },
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
