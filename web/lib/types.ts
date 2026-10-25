// The shapes the contract's views return, as the dashboard reads them.

export type Network = "testnet" | "mainnet";

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

/// One read of everything the page shows, taken at `fetchedAt`.
export type Snapshot = {
  owner: string;
  contract: string;
  network: Network;
  token: string;
  vault: bigint;
  /// USDC in the owner's own account, ready to move into the vault.
  held: bigint;
  storage: bigint;
  paused: boolean;
  requestTtl: number;
  agents: Agent[];
  requests: Request[];
  proposals: Proposal[];
  log: LogEntry[];
  fetchedAt: number;
};

/// Agent names by public key: on chain from the policy, with any local name the owner gave winning.
export type Names = Record<string, string>;
