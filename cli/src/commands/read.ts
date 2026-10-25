// What the agents can do, want to do, and did.

import { ownerAccount, view } from "../chain.js";
import { loadConfig } from "../config.js";
import { toUsdc } from "../units.js";

export async function status() {
  const config = loadConfig();
  const { provider } = ownerAccount(config);
  const [vault, paused, policies, storage] = await Promise.all([
    view<string>(provider, config.contract, "get_vault", { owner: config.owner, token: config.token }),
    view<boolean>(provider, config.contract, "is_paused", { owner: config.owner }),
    view<[string, { name: string | null; daily_cap: string; per_payment_cap: string; active: boolean; allowlist: string[]; expires_at: number }][]>(provider, config.contract, "get_policies", { owner: config.owner }),
    view<string>(provider, config.contract, "get_storage", { owner: config.owner }),
  ]);
  console.log(`${config.contract} on ${config.network}${paused ? "  PAUSED" : ""}`);
  console.log(`vault: ${toUsdc(vault)} USDC, storage credit: ${(Number(BigInt(storage ?? "0") / 10n ** 20n) / 10_000).toFixed(4)} NEAR`);
  for (const [key, policy] of policies) {
    const check = await view<{ remaining_today: string }>(provider, config.contract, "check", { owner: config.owner, public_key: key, to: config.owner, amount: "1" });
    const until = policy.expires_at ? ` until ${new Date(policy.expires_at * 1000).toISOString()}` : "";
    console.log(`  ${policy.active ? "on " : "off"} ${(policy.name ?? "").padEnd(10)} ${key.slice(0, 20)}…  ${toUsdc(check.remaining_today)} of ${toUsdc(policy.daily_cap)} left today, ${toUsdc(policy.per_payment_cap)} per payment${policy.allowlist.length ? `, to ${policy.allowlist.join(", ")}` : ""}${until}`);
  }
}

export async function requests() {
  const config = loadConfig();
  const { provider } = ownerAccount(config);
  const rows = await view<{ id: number; to: string; amount: string; memo: string | null; reason: string; expires_at: number }[]>(provider, config.contract, "get_requests", { owner: config.owner });
  if (!rows.length) return console.log("no parked requests");
  for (const r of rows) {
    const left = Math.max(0, Math.round((Number(BigInt(r.expires_at) / 1_000_000_000n) - Date.now() / 1000) / 60));
    console.log(`#${r.id}  ${toUsdc(r.amount)} USDC to ${r.to}  (${r.reason})${r.memo ? `  ${r.memo}` : ""}  expires in ${left} min`);
  }
}

export async function proposals() {
  const config = loadConfig();
  const { provider } = ownerAccount(config);
  const rows = await view<{ id: number; key: string; note: string }[]>(provider, config.contract, "get_proposals", { owner: config.owner });
  if (!rows.length) return console.log("no proposals");
  for (const r of rows) console.log(`#${r.id}  ${r.key.slice(0, 16)}...  ${r.note}`);
}

export async function log() {
  const config = loadConfig();
  const { provider } = ownerAccount(config);
  const rows = await view<{ at: number; event: string; to: string | null; amount: string | null; detail: string | null; key: string | null }[]>(provider, config.contract, "get_log", { owner: config.owner });
  for (const r of rows) {
    const when = new Date(Number(BigInt(r.at) / 1_000_000n)).toISOString().replace("T", " ").slice(0, 19);
    console.log(`${when}  ${r.event.padEnd(16)} ${r.amount ? toUsdc(r.amount).padStart(10) : "".padStart(10)}  ${r.to ?? ""}${r.detail ? `  ${r.detail}` : ""}`);
  }
}
