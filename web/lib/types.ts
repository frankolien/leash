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

/// The exact terms an agent asked for beside its note; values are what the caps become for a while.
export type Ask = { daily_cap?: string | null; per_payment_cap?: string | null; allow: string[]; for_secs: number };
export type Proposal = { id: number; owner: string; key: string; note: string; created_at: number; ask?: Ask | null };
/// A budget an agent set aside for one job, spent by a sub-agent's key within the agent's own limits.
export type Task = { id: number; owner: string; parent: string; child: string; label: string; budget: string; spent: string; allow: string[]; created_at: number; expires_at: number; active: boolean };

/// A granted ask in force until `until` (nanoseconds); it lapses on its own.
export type Raise = { daily_cap: string | null; per_payment_cap: string | null; allow: string[]; until: number };

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
  raise?: Raise;
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
  tasks: Task[];
  log: LogEntry[];
  fetchedAt: number;
};

/// Agent names by public key: on chain from the policy, with any local name the owner gave winning.
export type Names = Record<string, string>;
