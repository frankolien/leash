// Reads from the Leash contract and the token, straight over RPC. No server: a judge can open
// anyone's dashboard read-only, and the owner's wallet is the only thing that can change it.

import { JsonRpcProvider } from "near-api-js";
import { RPC, USDC, contractOf } from "./config";
import { phoneKeysOf, type PhoneKey } from "./device";
import type { LogEntry, Network, Policy, Proposal, Raise, Request, Snapshot, Task } from "./types";

export { contractOf, networkOf } from "./config";

export class LeashReader {
  readonly provider: JsonRpcProvider;

  constructor(readonly network: Network) {
    this.provider = new JsonRpcProvider({ url: RPC[network] });
  }

  async view<T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T> {
    const result = await this.provider.callFunction({ contractId, method, args });
    return result as unknown as T;
  }

  /// The owner's linked phones, from the access keys on their account.
  async phoneKeys(owner: string, contract = contractOf(owner), ownKey?: string): Promise<PhoneKey[]> {
    const res = await fetch(RPC[this.network], {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "leash", method: "query", params: { request_type: "view_access_key_list", finality: "optimistic", account_id: owner } }),
    });
    const body = (await res.json()) as { result?: { keys: Parameters<typeof phoneKeysOf>[0] } };
    return phoneKeysOf(body.result?.keys ?? [], contract, ownKey);
  }

  async snapshot(owner: string, contract = contractOf(owner)): Promise<Snapshot> {
    const [policies, requests, proposals, log, paused, storage, requestTtl, raises, tasks] = await Promise.all([
      this.view<[string, Policy][]>(contract, "get_policies", { owner }),
      this.view<Request[]>(contract, "get_requests", { owner }),
      this.view<Proposal[]>(contract, "get_proposals", { owner }),
      this.view<LogEntry[]>(contract, "get_log", { owner }),
      this.view<boolean>(contract, "is_paused", { owner }),
      this.view<string>(contract, "get_storage", { owner }),
      this.view<number>(contract, "get_request_ttl", { owner }),
      this.view<[string, Raise][]>(contract, "get_raises", { owner }).catch(() => [] as [string, Raise][]),
      this.view<Task[]>(contract, "get_tasks", { owner }).catch(() => [] as Task[]),
    ]);
    const raiseOf = new Map(raises);
    const token = policies[0]?.[1].token ?? USDC[this.network];
    const [vault, held, ...remaining] = await Promise.all([
      this.view<string>(contract, "get_vault", { owner, token }),
      this.view<string>(token, "ft_balance_of", { account_id: owner }).catch(() => "0"),
      ...policies.map(([key]) => this.view<{ remaining_today: string }>(contract, "check", { owner, public_key: key, to: owner, amount: "1" })),
    ]);
    return {
      owner,
      contract,
      network: this.network,
      token,
      vault: BigInt(vault ?? "0"),
      held: BigInt(held ?? "0"),
      storage: BigInt(storage ?? "0"),
      paused: paused ?? false,
      requestTtl: requestTtl ?? 3600,
      agents: policies.map(([key, policy], i) => ({ key, policy, remaining: BigInt(remaining[i]?.remaining_today ?? "0"), raise: raiseOf.get(key) })),
      requests: [...requests].sort((a, b) => a.id - b.id),
      proposals: [...proposals].sort((a, b) => a.id - b.id),
      tasks: [...tasks].sort((a, b) => b.id - a.id),
      log: [...log].reverse(),
      fetchedAt: Date.now(),
    };
  }
}
