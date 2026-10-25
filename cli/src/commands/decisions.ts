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
