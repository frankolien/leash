// The agent's view of its Leash: its policy, the contract's verdicts, warnings, and its calls.

import { randomUUID } from "node:crypto";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions } from "near-api-js";
import { RPC } from "./config.js";
import { httpRelay, type Relay, type Relayed } from "./relay.js";
import { editDistance, skeleton } from "./safety.js";
import type { KeyFile, Policy, Preflight, Proposal, Raise, Request } from "./types.js";

export type LeashOptions = {
  /// Delivers signed instructions so the agent needs no NEAR for gas. Without one, the agent's own
  /// function-call key sends the transaction.
  relay?: Relay;
  /// The Leash website, for links to the owner's dashboard.
  site?: string;
};

type Action = "pay" | "request" | "ask_more";
const INTENT_LIFETIME_NS = 10n * 60n * 1_000_000_000n;

/// The value a transaction finally returned, through any promise chain.
function lastResult(out: { status: unknown }): unknown {
  const status = out.status as { SuccessValue?: string; Failure?: unknown };
  if (status.Failure) throw new Error(JSON.stringify(status.Failure));
  if (!status.SuccessValue) return undefined;
  return JSON.parse(Buffer.from(status.SuccessValue, "base64").toString("utf8"));
}

export class Leash {
  readonly key: KeyFile;
  readonly provider: JsonRpcProvider;
  readonly account: Account;
  readonly relay?: Relay;
  readonly site?: string;

  constructor(key: KeyFile, options: LeashOptions = {}) {
    this.key = key;
    this.relay = options.relay ?? (process.env.LEASH_RELAY_URL ? httpRelay(process.env.LEASH_RELAY_URL) : undefined);
    this.site = options.site ?? process.env.LEASH_SITE_URL;
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

  /// Runs an agent method: signed and relayed when there is a relay, otherwise sent by the agent's
  /// own key. Either way the contract applies this key's policy and answers the same.
  async act(action: Action, args: Record<string, unknown>): Promise<Relayed> {
    if (this.relay) {
      const payment_id = (args.payment_id as string | undefined) ?? randomUUID();
      return this.relay(`${action}_signed`, this.sign(action, { ...args, payment_id }));
    }
    const direct = action === "pay" ? args : Object.fromEntries(Object.entries(args).filter(([k]) => k !== "payment_id"));
    const out = await this.account.signAndSendTransaction({
      receiverId: this.key.contract,
      actions: [actions.functionCall(action, direct, 60_000_000_000_000n, 0n)],
    });
    return { result: lastResult(out), tx: out.transaction.hash };
  }

  /// The instruction as the exact JSON text the contract will parse, signed over a fixed prefix so
  /// the signature means nothing anywhere else. expires_at is written by hand because nanoseconds
  /// overflow a JavaScript number.
  sign(action: Action, args: Record<string, unknown>): { intent: string; signature: string } {
    const body = Object.fromEntries(
      Object.entries({ contract: this.key.contract, owner: this.key.owner, key: this.key.public_key, action, ...args }).filter(([, v]) => v !== undefined && v !== null),
    );
    const expires = BigInt(Date.now()) * 1_000_000n + INTENT_LIFETIME_NS;
    const intent = `${JSON.stringify(body).slice(0, -1)},"expires_at":${expires}}`;
    const { signature } = KeyPair.fromString(this.key.private_key as `ed25519:${string}`).sign(new TextEncoder().encode(`leash-intent:${intent}`));
    return { intent, signature: Buffer.from(signature).toString("base64") };
  }

  async raise(): Promise<Raise | undefined> {
    const raises = (await this.view<[string, Raise][]>("get_raises", { owner: this.key.owner }).catch(() => [])) ?? [];
    return raises.find(([k]) => k === this.key.public_key)?.[1];
  }

  explorer(tx: string | undefined): string | null {
    if (!tx) return null;
    return this.key.network === "mainnet" ? `https://nearblocks.io/txns/${tx}` : `https://testnet.nearblocks.io/txns/${tx}`;
  }

  dashboard(view: string): string | null {
    return this.site ? `${this.site.replace(/\/$/, "")}/${encodeURIComponent(this.key.owner)}#${view}` : null;
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
