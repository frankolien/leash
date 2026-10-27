// The shapes the Leash contract speaks and the agent key file holds.

export type KeyFile = {
  name?: string;
  owner: string;
  public_key: string;
  private_key: string;
  contract: string;
  network: "testnet" | "mainnet";
  token?: string;
};

export type Preflight = { ok: boolean; reason: string | null; can_request: boolean; remaining_today: string; vault: string };

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

export type PayOutcome = { accepted: boolean; reason: string | null; remaining_today: string };
export type Request = { id: number; key: string; to: string; amount: string; memo: string | null; reason: string; created_at: number; expires_at: number };
export type Ask = { daily_cap?: string; per_payment_cap?: string; allow?: string[]; for_secs?: number };
export type Proposal = { id: number; key: string; note: string; created_at: number; ask?: Ask | null };
export type Raise = { daily_cap: string | null; per_payment_cap: string | null; allow: string[]; until: number };
export type LogEntry = { at: number; key: string | null; event: string; to: string | null; amount: string | null; detail: string | null };
