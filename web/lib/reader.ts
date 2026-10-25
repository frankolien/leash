// Reads from the Leash contract and the token, straight over RPC. No server: a judge can open
// anyone's dashboard read-only, and the owner's wallet is the only thing that can change it.

import { JsonRpcProvider } from "near-api-js";
import type { LogEntry, Network, Policy, Proposal, Request, Snapshot } from "./types";

export const RPC: Record<Network, string> = {
  testnet: "https://rpc.testnet.fastnear.com",
  mainnet: "https://rpc.mainnet.fastnear.com",
};

export const USDC: Record<Network, string> = {
  testnet: "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af",
  mainnet: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
};

export function networkOf(owner: string): Network {
  return owner.endsWith(".testnet") ? "testnet" : "mainnet";
}

export function contractOf(owner: string): string {
  return `leash.${owner}`;
}

export class LeashReader {
  readonly provider: JsonRpcProvider;

  constructor(readonly network: Network) {
    this.provider = new JsonRpcProvider({ url: RPC[network] });
  }

  async view<T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T> {
    const result = await this.provider.callFunction({ contractId, method, args });
    return result as unknown as T;
  }

  async snapshot(owner: string, contract = contractOf(owner)): Promise<Snapshot> {
    const [policies, requests, proposals, log, paused, storage, requestTtl] = await Promise.all([
      this.view<[string, Policy][]>(contract, "get_policies", { owner }),
      this.view<Request[]>(contract, "get_requests", { owner }),
      this.view<Proposal[]>(contract, "get_proposals", { owner }),
      this.view<LogEntry[]>(contract, "get_log", { owner }),
      this.view<boolean>(contract, "is_paused", { owner }),
      this.view<string>(contract, "get_storage", { owner }),
      this.view<number>(contract, "get_request_ttl", { owner }),
    ]);
    const token = policies[0]?.[1].token ?? USDC[this.network];
    const [vault, ...remaining] = await Promise.all([
      this.view<string>(contract, "get_vault", { owner, token }),
      ...policies.map(([key]) => this.view<{ remaining_today: string }>(contract, "check", { owner, public_key: key, to: owner, amount: "1" })),
    ]);
    return {
      owner,
      contract,
      network: this.network,
      token,
      vault: BigInt(vault ?? "0"),
      storage: BigInt(storage ?? "0"),
      paused: paused ?? false,
      requestTtl: requestTtl ?? 3600,
      agents: policies.map(([key, policy], i) => ({ key, policy, remaining: BigInt(remaining[i]?.remaining_today ?? "0") })),
      requests: [...requests].sort((a, b) => a.id - b.id),
      proposals: [...proposals].sort((a, b) => a.id - b.id),
      log: [...log].reverse(),
      fetchedAt: Date.now(),
    };
  }
}
