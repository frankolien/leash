// The agent's view of its Leash: its policy, the contract's verdicts, warnings, and its calls.

import { Account, JsonRpcProvider, KeyPairSigner } from "near-api-js";
import { RPC } from "./config.js";
import { editDistance, skeleton } from "./safety.js";
import type { KeyFile, Policy, Preflight, Proposal, Request } from "./types.js";

export class Leash {
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
