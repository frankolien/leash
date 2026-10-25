#!/usr/bin/env node
// leash-mcp: the tools an agent uses to pay from a Leash-bounded account.
//
// The server holds the agent's key and nothing else. That key is a function-call key on the owner's
// account restricted to the Leash contract, so even a compromised server can only do what the owner's
// policy allows, and only until the owner revokes the key.

import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Account, JsonRpcProvider, KeyPairSigner } from "near-api-js";
import { z } from "zod";

type KeyFile = {
  owner: string;
  public_key: string;
  private_key: string;
  contract: string;
  network: "testnet" | "mainnet";
  token?: string;
};

type Preflight = {
  ok: boolean;
  reason: string | null;
  can_request: boolean;
  remaining_today: string;
  vault: string;
};

type Policy = {
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

const DECIMALS = 6n;
const RPC: Record<string, string> = {
  testnet: "https://rpc.testnet.fastnear.com",
  mainnet: "https://rpc.mainnet.fastnear.com",
};

function loadKey(): KeyFile {
  const path = process.env.LEASH_KEY_FILE;
  if (!path) throw new Error("LEASH_KEY_FILE is not set; run `leash grant` to make one");
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
  const whole = BigInt(match[1]);
  const frac = BigInt((match[2] ?? "").padEnd(Number(DECIMALS), "0"));
  return whole * 10n ** DECIMALS + frac;
}

function toUsdc(units: string | bigint): string {
  const value = BigInt(units);
  const whole = value / 10n ** DECIMALS;
  const frac = (value % 10n ** DECIMALS).toString().padStart(Number(DECIMALS), "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
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

class Leash {
  readonly key: KeyFile;
  readonly provider: JsonRpcProvider;
  readonly account: Account;

  constructor(key: KeyFile) {
    this.key = key;
    this.provider = new JsonRpcProvider({ url: process.env.NEAR_RPC ?? RPC[key.network] });
    this.account = new Account(key.owner, this.provider, KeyPairSigner.fromSecretKey(key.private_key as `ed25519:${string}`));
  }

  async view<T>(method: string, args: Record<string, unknown>): Promise<T | undefined> {
    const result = await this.provider.callFunction({ contractId: this.key.contract, method, args });
    return result as unknown as T | undefined;
  }

  async policy(): Promise<Policy | undefined> {
    return this.view<Policy | null>("get_policy", { owner: this.key.owner, public_key: this.key.public_key }).then((p) => p ?? undefined);
  }

  async check(to: string, units: bigint): Promise<Preflight> {
    const verdict = await this.view<Preflight>("check", {
      owner: this.key.owner,
      public_key: this.key.public_key,
      to,
      amount: units.toString(),
    });
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
        const registered = (await this.provider.callFunction({
          contractId: policy.token,
          method: "storage_balance_of",
          args: { account_id: to },
        })) as unknown as { total: string } | null;
        if (!registered) out.push(`${to} is not registered on ${policy.token}; the transfer would fail until they register`);
      } catch {
        out.push(`could not check whether ${to} is registered on ${policy.token}`);
      }
      for (const name of policy.allowlist) {
        const distance = editDistance(name, to);
        if (distance > 0 && distance <= 2) out.push(`${to} looks like ${name} from the allowlist but is not it`);
      }
    }
    return out;
  }

  async pay(method: "pay" | "request", to: string, units: bigint, memo?: string): Promise<unknown> {
    return this.account.callFunction({
      contractId: this.key.contract,
      methodName: method,
      args: { to, amount: units.toString(), memo: memo ?? null },
      gas: 30_000_000_000_000n,
      deposit: 0n,
    });
  }
}

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

async function main() {
  const leash = new Leash(loadKey());
  const server = new McpServer({ name: "leash", version: "0.1.0" });

  server.registerTool(
    "leash_status",
    {
      description: "The spending policy for this agent's key: token, daily and per-payment caps, what is left today, allowlist, whether it is active, and the owner's vault balance.",
      inputSchema: {},
    },
    async () => {
      const policy = await leash.policy();
      if (!policy) return text({ active: false, reason: "no policy for this key; ask the owner to run `leash grant`" });
      const verdict = await leash.check(leash.key.owner, 1n);
      const paused = await leash.view<boolean>("is_paused", { owner: leash.key.owner });
      return text({
        owner: leash.key.owner,
        key: leash.key.public_key,
        token: policy.token,
        active: policy.active && !paused,
        paused: paused ?? false,
        daily_cap_usdc: toUsdc(policy.daily_cap),
        per_payment_cap_usdc: toUsdc(policy.per_payment_cap),
        remaining_today_usdc: toUsdc(verdict.remaining_today),
        vault_usdc: toUsdc(verdict.vault),
        allowlist: policy.allowlist,
        cooldown_secs: policy.cooldown_secs,
        expires_at: policy.expires_at || null,
      });
    },
  );

  server.registerTool(
    "leash_preflight",
    {
      description: "Check a payment before making it. Returns whether the contract would accept it, the reason if not, whether it could be parked as a request for the owner, and warnings about the recipient.",
      inputSchema: {
        to: z.string().describe("Recipient NEAR account, like vendor.near"),
        usdc: z.string().describe("Amount in USDC, like 1.50"),
      },
    },
    async ({ to, usdc }) => {
      const units = toUnits(usdc);
      const [verdict, policy] = await Promise.all([leash.check(to, units), leash.policy()]);
      const warnings = await leash.warnings(to, policy);
      return text({
        ok: verdict.ok,
        reason: verdict.reason,
        can_request: verdict.can_request,
        remaining_today_usdc: toUsdc(verdict.remaining_today),
        vault_usdc: toUsdc(verdict.vault),
        warnings,
      });
    },
  );

  server.registerTool(
    "leash_pay",
    {
      description: "Pay USDC from the owner's account within the policy. Refused payments return the reason and cost nothing. Run leash_preflight first when unsure.",
      inputSchema: {
        to: z.string().describe("Recipient NEAR account"),
        usdc: z.string().describe("Amount in USDC, like 1.50"),
        memo: z.string().optional().describe("What this payment is for; the owner sees it in the log"),
      },
    },
    async ({ to, usdc, memo }) => {
      const units = toUnits(usdc);
      const outcome = (await leash.pay("pay", to, units, memo)) as PayOutcome | undefined;
      if (!outcome) return text({ accepted: false, reason: "no answer from the contract" });
      return text({ accepted: outcome.accepted, reason: outcome.reason, remaining_today_usdc: toUsdc(outcome.remaining_today) });
    },
  );

  server.registerTool(
    "leash_request",
    {
      description: "Park a payment the policy would refuse, for the owner to approve or deny. Returns the request id. Use when leash_preflight says can_request is true.",
      inputSchema: {
        to: z.string().describe("Recipient NEAR account"),
        usdc: z.string().describe("Amount in USDC, like 25"),
        memo: z.string().optional().describe("Why the owner should approve this"),
      },
    },
    async ({ to, usdc, memo }) => {
      const units = toUnits(usdc);
      const id = await leash.pay("request", to, units, memo);
      return text({ parked: true, request_id: id, next: "the owner approves with `leash approve <id>`" });
    },
  );

  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
