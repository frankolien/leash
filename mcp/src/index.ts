#!/usr/bin/env node
// leash-mcp: the tools an agent uses to pay from a Leash-bounded account.
//
// The server holds the agent's key and nothing else. That key is a function-call key on the owner's
// account restricted to the Leash contract, so even a compromised server can only do what the owner's
// policy allows, and only until the owner revokes the key.
//
// Every tool answers in one envelope: { status, ... } where status is one of
// "ok", "accepted", "refused", "parked", "proposed", "error". An agent never has to guess the shape.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Account, JsonRpcProvider, KeyPairSigner } from "near-api-js";
import { z } from "zod";

type KeyFile = {
  name?: string;
  owner: string;
  public_key: string;
  private_key: string;
  contract: string;
  network: "testnet" | "mainnet";
  token?: string;
};

type Preflight = { ok: boolean; reason: string | null; can_request: boolean; remaining_today: string; vault: string };

type Policy = {
  name: string | null;
  token: string;
  daily_cap: string;
  per_payment_cap: string;
  allowlist: string[];
  cooldown_secs: number;
  expires_at: number;
  active: boolean;
  spent_today: string;
  day_started_at: number;
  last_paid_at: number;
};

type PayOutcome = { accepted: boolean; reason: string | null; remaining_today: string };
type Request = { id: number; key: string; to: string; amount: string; memo: string | null; reason: string; created_at: number; expires_at: number };
type Proposal = { id: number; key: string; note: string; created_at: number };
type LogEntry = { at: number; key: string | null; event: string; to: string | null; amount: string | null; detail: string | null };

const DECIMALS = 6n;
const RPC: Record<string, string> = {
  testnet: "https://rpc.testnet.fastnear.com",
  mainnet: "https://rpc.mainnet.fastnear.com",
};

const GUIDANCE = [
  "Rules: run leash_preflight before a payment you are not sure about.",
  "A refusal costs nothing and is logged; read the reason and tell the user.",
  "Never repeat leash_pay to finish a payment; an accepted answer means it settled on chain.",
  "A parked request is not a payment; say it is waiting for the owner and do not claim the money moved.",
  "Amounts are USDC as a decimal string, like 1.50.",
].join(" ");

function loadKey(): KeyFile {
  const raw = process.env.LEASH_KEY_FILE;
  if (!raw) throw new Error("LEASH_KEY_FILE is not set; create an agent in the dashboard or run `leash grant`");
  // Config files for Codex and Cursor do not expand ~, so the server does.
  const path = raw.replace(/^~(?=\/)/, homedir());
  const key = JSON.parse(readFileSync(path, "utf8")) as KeyFile;
  for (const field of ["owner", "public_key", "private_key", "contract", "network"] as const) {
    if (!key[field]) throw new Error(`key file is missing ${field}`);
  }
  return key;
}

// Dollars in, smallest units out. A string avoids floating point on money.
function toUnits(usdc: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(usdc.trim());
  if (!match) throw new Error(`amount must look like 12.50, got ${usdc}`);
  return BigInt(match[1]) * 10n ** DECIMALS + BigInt((match[2] ?? "").padEnd(Number(DECIMALS), "0"));
}

function toUsdc(units: string | bigint | null | undefined): string | null {
  if (units === null || units === undefined) return null;
  const value = BigInt(units);
  const frac = (value % 10n ** DECIMALS).toString().padStart(Number(DECIMALS), "0").replace(/0+$/, "");
  return frac ? `${value / 10n ** DECIMALS}.${frac}` : `${value / 10n ** DECIMALS}`;
}

function whenNs(ns: number | string): string {
  return new Date(Number(BigInt(ns) / 1_000_000n)).toISOString();
}

// Two names within two edits of each other but not equal is the shape of a lookalike attack:
// vendor.near against vend0r.near. Cheap to compute on a short allowlist.
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
    }
  }
  return rows[a.length][b.length];
}

/// Folds the characters scammers swap for each other, so vend0r and vendor read the same.
function skeleton(account: string): string {
  return account.toLowerCase().replace(/rn/g, "m").replace(/vv/g, "w").replace(/[0]/g, "o").replace(/[1il|]/g, "l").replace(/[5]/g, "s").replace(/[-_]/g, "");
}

class Leash {
  readonly key: KeyFile;
  readonly provider: JsonRpcProvider;
  readonly account: Account;

  constructor(key: KeyFile) {
    this.key = key;
    this.provider = new JsonRpcProvider({ url: process.env.NEAR_RPC ?? RPC[key.network] });
    this.account = new Account(key.owner, this.provider, KeyPairSigner.fromSecretKey(key.private_key as `ed25519:${string}`));
  }

  async view<T>(method: string, args: Record<string, unknown>, contractId = this.key.contract): Promise<T | undefined> {
    const result = await this.provider.callFunction({ contractId, method, args });
    return result as unknown as T | undefined;
  }

  async policy(): Promise<Policy | undefined> {
    return this.view<Policy | null>("get_policy", { owner: this.key.owner, public_key: this.key.public_key }).then((p) => p ?? undefined);
  }

  async check(to: string, units: bigint): Promise<Preflight> {
    const verdict = await this.view<Preflight>("check", { owner: this.key.owner, public_key: this.key.public_key, to, amount: units.toString() });
    if (!verdict) throw new Error("the contract did not answer the preflight");
    return verdict;
  }

  async warnings(to: string, policy: Policy | undefined): Promise<string[]> {
    const out: string[] = [];
    try {
      const view = await this.provider.viewAccount({ accountId: to });
      if (view.code_hash && view.code_hash !== "11111111111111111111111111111111") {
        out.push(`${to} is a contract, not a person; make sure that is intended`);
      }
    } catch {
      out.push(`${to} does not exist on ${this.key.network}; the transfer would fail`);
    }
    if (policy) {
      try {
        const registered = await this.view<{ total: string } | null>("storage_balance_of", { account_id: to }, policy.token);
        if (!registered) out.push(`${to} is not registered on the token; the transfer would fail until they register`);
      } catch {
        out.push(`could not check whether ${to} is registered on ${policy.token}`);
      }
      // Trusted names are the allowlist plus every account the owner's agents have paid.
      const log = (await this.view<{ event: string; to: string | null }[]>("get_log", { owner: this.key.owner }).catch(() => [])) ?? [];
      const paid = log.filter((e) => (e.event === "pay" || e.event === "request_approved") && e.to).map((e) => e.to as string);
      for (const name of new Set([...policy.allowlist, ...paid])) {
        if (name === to) continue;
        if (skeleton(name) === skeleton(to) || editDistance(name, to) <= 2) {
          out.push(`${to} looks like ${name}, which the owner trusts, but it is a different account; do not pay it without asking`);
          break;
        }
      }
    }
    return out;
  }

  async call(method: "pay" | "request" | "ask_more", args: Record<string, unknown>): Promise<unknown> {
    return this.account.callFunction({ contractId: this.key.contract, methodName: method, args, gas: 30_000_000_000_000n, deposit: 0n });
  }

  async mine(): Promise<{ requests: Request[]; proposals: Proposal[] }> {
    const [requests, proposals] = await Promise.all([
      this.view<Request[]>("get_requests", { owner: this.key.owner }),
      this.view<Proposal[]>("get_proposals", { owner: this.key.owner }),
    ]);
    return {
      requests: (requests ?? []).filter((r) => r.key === this.key.public_key),
      proposals: (proposals ?? []).filter((p) => p.key === this.key.public_key),
    };
  }
}

function reply(value: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function modeOf(policy: Policy): string {
  if (BigInt(policy.per_payment_cap) === 0n) return "ask every time";
  if (BigInt(policy.per_payment_cap) < BigInt(policy.daily_cap)) return "autonomous below a limit, ask above it";
  return "autonomous within limits";
}

async function main() {
  const leash = new Leash(loadKey());
  const server = new McpServer({ name: "leash", version: "0.2.0" });

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

  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
