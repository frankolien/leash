// What only the owner decides: the kill switch, parked requests, proposals, and how long requests wait.

import { call, ownerAccount, view } from "../chain.js";
import { TGAS, loadConfig } from "../config.js";

export async function simple(method: "pause" | "resume") {
  const config = loadConfig();
  const { account } = ownerAccount(config);
  await call(account, config.contract, method, {});
  console.log(method === "pause" ? "paused: no agent key can pay" : "resumed");
}

export async function decide(method: "approve" | "deny", id: string, force = false) {
  const config = loadConfig();
  const { account, provider } = ownerAccount(config);
  if (method === "approve" && !force) {
    // An approved transfer to an account the token does not know fails on chain and costs gas for
    // nothing; the contract refunds, but the owner is better told before than after.
    const rows = await view<{ id: number; to: string }[]>(provider, config.contract, "get_requests", { owner: config.owner });
    const request = rows.find((r) => r.id === Number(id));
    if (!request) throw new Error(`no parked request #${id}`);
    const registered = await view<unknown>(provider, config.token, "storage_balance_of", { account_id: request.to });
    if (!registered) {
      throw new Error(`${request.to} is not registered on the token, so the transfer would fail. Run \`leash register ${request.to}\` first, or pass --force.`);
    }
  }
  const outcome = await call(account, config.contract, method, { request_id: Number(id) }, 0n, 60n * TGAS);
  console.log(method === "approve" ? JSON.stringify(outcome) : `denied ${id}`);
}

export async function dismiss(id: string) {
  const config = loadConfig();
  const { account } = ownerAccount(config);
  await call(account, config.contract, "dismiss_proposal", { proposal_id: Number(id) });
  console.log(`dismissed ${id}`);
}

export async function window(secs: string) {
  const config = loadConfig();
  const { account } = ownerAccount(config);
  await call(account, config.contract, "set_request_ttl", { secs: Number(secs) });
  console.log(`parked requests now wait ${secs} seconds for you`);
}

/// Puts an account on the shared reports list in the owner's name: blocked for this owner's agents
/// at once, and for every owner's once a second owner reports it.
export async function report(target: string, evidence: string | undefined) {
  if (!evidence?.trim()) throw new Error('say what happened: leash report <account> --evidence "what it did, a link or a tx"');
  const config = loadConfig();
  const { account, provider } = ownerAccount(config);
  await call(account, config.contract, "report", { account: target, evidence });
  const rep = await view<{ reported_by: number; blocked: boolean }>(provider, config.contract, "reputation", { account: target });
  console.log(`reported ${target}: your agents can no longer pay it; ${rep.reported_by} owner(s) have reported it${rep.blocked ? ", so it is blocked for every owner" : ""}`);
}

export async function retract(target: string) {
  const config = loadConfig();
  const { account } = ownerAccount(config);
  await call(account, config.contract, "retract", { account: target });
  console.log(`withdrew your report on ${target}`);
}

export async function reports(target: string) {
  const config = loadConfig();
  const { provider } = ownerAccount(config);
  const list = await view<{ owner: string; key: string | null; evidence: string; at: number }[]>(provider, config.contract, "get_reports", { account: target });
  if (!list.length) return console.log(`no reports on ${target}`);
  for (const r of list) console.log(`${new Date(r.at / 1e6).toISOString().slice(0, 16)}  ${r.owner}${r.key ? " (agent)" : ""}: ${r.evidence}`);
}
