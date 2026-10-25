// Reads from the Leash contract and the token, straight over RPC. No server: a judge can open
// anyone's dashboard read-only, and the owner's wallet is the only thing that can change it.

import { JsonRpcProvider } from "near-api-js";

export type Network = "testnet" | "mainnet";

export const RPC: Record<Network, string> = {
  testnet: "https://rpc.testnet.fastnear.com",
  mainnet: "https://rpc.mainnet.fastnear.com",
};

export const USDC: Record<Network, string> = {
  testnet: "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af",
  mainnet: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
};

export type Policy = {
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

export type Request = {
  id: number;
  owner: string;
  key: string;
  token: string;
  to: string;
  amount: string;
  memo: string | null;
  reason: string;
  created_at: number;
  expires_at: number;
};

export type Proposal = { id: number; owner: string; key: string; note: string; created_at: number };

export type LogEntry = {
  at: number;
  key: string | null;
  event: string;
  to: string | null;
  amount: string | null;
  detail: string | null;
};

export type Agent = {
  key: string;
  policy: Policy;
  remaining: bigint;
};

export type Snapshot = {
  owner: string;
  contract: string;
  network: Network;
  token: string;
  vault: bigint;
  storage: bigint;
  paused: boolean;
  requestTtl: number;
  agents: Agent[];
  requests: Request[];
  proposals: Proposal[];
  log: LogEntry[];
  fetchedAt: number;
};

const DECIMALS = BigInt(6);

export function networkOf(owner: string): Network {
  return owner.endsWith(".testnet") ? "testnet" : "mainnet";
}

export function contractOf(owner: string): string {
  return `leash.${owner}`;
}

export function toUsdc(units: bigint | string | null | undefined): string {
  if (units === null || units === undefined) return "0";
  const value = BigInt(units);
  const whole = value / BigInt(10) ** DECIMALS;
  const frac = (value % BigInt(10) ** DECIMALS).toString().padStart(Number(DECIMALS), "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function toUnits(usdc: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(usdc.trim());
  if (!match) throw new Error(`amount must look like 12.50, got ${usdc}`);
  return BigInt(match[1]) * BigInt(10) ** DECIMALS + BigInt((match[2] ?? "").padEnd(Number(DECIMALS), "0"));
}

/// Dollars split for the big numeral: whole and cents, so the cents can sit small like a bank app.
export function splitUsdc(units: bigint): { whole: string; cents: string } {
  const whole = (units / BigInt(10) ** DECIMALS).toLocaleString("en-US");
  const cents = ((units % BigInt(10) ** DECIMALS) / BigInt(10_000)).toString().padStart(2, "0");
  return { whole, cents };
}

export function nearOf(yocto: bigint): string {
  return (Number(yocto / BigInt(10) ** BigInt(20)) / 10_000).toFixed(3);
}

export function msOf(ns: number | string): number {
  return Number(BigInt(ns) / BigInt(1_000_000));
}

export function modeOf(policy: Policy): string {
  const per = BigInt(policy.per_payment_cap);
  const daily = BigInt(policy.daily_cap);
  if (per === BigInt(0)) return "Asks every time";
  if (per < daily) return "Autonomous below a limit, asks above it";
  return "Autonomous within limits";
}

export function shortKey(key: string): string {
  const body = key.replace(/^ed25519:/, "");
  return `${body.slice(0, 6)}…${body.slice(-4)}`;
}

/// A small stable name for a key so the owner is not reading base58: the first letters of its
/// public key, which the CLI's key file also carries as `name` when the owner has it.
export function agentLabel(key: string, names: Record<string, string>): string {
  return names[key] ?? `agent ${key.replace(/^ed25519:/, "").slice(0, 4).toLowerCase()}`;
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

  async exists(accountId: string): Promise<boolean> {
    try {
      await this.provider.viewAccount({ accountId });
      return true;
    } catch {
      return false;
    }
  }
}
