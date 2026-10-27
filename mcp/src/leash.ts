// The agent's view of its Leash: its policy, the contract's verdicts, warnings, and its calls.

import { createHash, createPrivateKey, createPublicKey, randomUUID } from "node:crypto";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, baseDecode, baseEncode } from "near-api-js";
import { RPC } from "./config.js";
import { httpRelay, type Relay, type Relayed } from "./relay.js";
import { editDistance, skeleton } from "./safety.js";
import type { KeyFile, Policy, Preflight, Proposal, Raise, Request, Task } from "./types.js";

export type LeashOptions = {
  /// Delivers signed instructions so the agent needs no NEAR for gas. Without one, the agent's own
  /// function-call key sends the transaction.
  relay?: Relay;
  /// The Leash website, for links to the owner's dashboard.
  site?: string;
};

type Action = "pay" | "request" | "ask_more" | "open_task" | "close_task";
const ED25519_PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");
// Labels map to child keys deterministically; a closed task's key is never reused, so a label can be
// opened again this many times.
const TASK_SLOTS = 20;

/// A task's child key, derived from the parent's secret and the task's label and slot. Nothing is
/// stored: the hosted server and a laptop both arrive at the same key, and only the parent can.
export function childKey(parentSecret: string, label: string, slot: number): KeyPair {
  const seed = createHash("sha256").update(baseDecode(parentSecret.replace(/^ed25519:/, ""))).update(`leash-task:${label}:${slot}`).digest();
  const pub = createPublicKey(createPrivateKey({ key: Buffer.concat([ED25519_PKCS8, seed]), format: "der", type: "pkcs8" })).export({ format: "der", type: "spki" }).subarray(-32);
  return KeyPair.fromString(`ed25519:${baseEncode(Buffer.concat([seed, pub]))}` as `ed25519:${string}`);
}
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
  async act(action: Action, args: Record<string, unknown>, signer?: KeyPair): Promise<Relayed> {
    if (this.relay) {
      const payment_id = (args.payment_id as string | undefined) ?? randomUUID();
      return this.relay(`${action}_signed`, this.sign(action, { ...args, payment_id }, signer));
    }
    // A task's child key is no access key on the owner's account, so only a relay can deliver it.
    if (signer) throw new Error("paying from a task needs a relay; set LEASH_RELAY_URL");
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
  sign(action: Action, args: Record<string, unknown>, signer?: KeyPair): { intent: string; signature: string } {
    const pair = signer ?? KeyPair.fromString(this.key.private_key as `ed25519:${string}`);
    const body = Object.fromEntries(
      Object.entries({ contract: this.key.contract, owner: this.key.owner, key: pair.getPublicKey().toString(), action, ...args }).filter(([, v]) => v !== undefined && v !== null),
    );
    const expires = BigInt(Date.now()) * 1_000_000n + INTENT_LIFETIME_NS;
    const intent = `${JSON.stringify(body).slice(0, -1)},"expires_at":${expires}}`;
    const { signature } = pair.sign(new TextEncoder().encode(`leash-intent:${intent}`));
    return { intent, signature: Buffer.from(signature).toString("base64") };
  }

  /// This agent's tasks, newest first.
  async tasks(): Promise<Task[]> {
    const all = (await this.view<Task[]>("get_tasks", { owner: this.key.owner }).catch(() => [])) ?? [];
    return all.filter((t) => t.parent === this.key.public_key).sort((a, b) => b.id - a.id);
  }

  /// The open task with this label and the child key that spends it.
  async taskByLabel(label: string): Promise<{ task: Task; key: KeyPair } | undefined> {
    const now = Date.now() * 1e6;
    const open = (await this.tasks()).filter((t) => t.active && t.expires_at > now && t.label === label);
    for (let slot = 0; slot < TASK_SLOTS; slot++) {
      const key = childKey(this.key.private_key, label, slot);
      const task = open.find((t) => t.child === key.getPublicKey().toString());
      if (task) return { task, key };
    }
    return undefined;
  }

  /// The first child key for this label that has never held a task.
  async freshChild(label: string): Promise<KeyPair> {
    const used = new Set((await this.tasks()).map((t) => t.child));
    for (let slot = 0; slot < TASK_SLOTS; slot++) {
      const key = childKey(this.key.private_key, label, slot);
      if (!used.has(key.getPublicKey().toString())) return key;
    }
    throw new Error(`the label "${label}" has been used ${TASK_SLOTS} times; pick another`);
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
