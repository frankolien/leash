// Handing an agent a bounded key, and taking it back.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { KeyPair } from "near-api-js";
import { call, ownerAccount } from "../chain.js";
import { HOME, KEY_ALLOWANCE, loadConfig, type AgentKey } from "../config.js";
import { toUnits, ttlToSeconds } from "../units.js";
import { usage } from "../usage.js";

export async function grant(flags: Record<string, string | undefined>) {
  const config = loadConfig();
  const name = flags.name ?? usage();
  const daily = flags.daily ?? usage();
  const perPayment = flags["per-payment"] ?? daily;
  const { account } = ownerAccount(config);
  const keyFile = join(HOME, `${name}.json`);
  if (existsSync(keyFile)) throw new Error(`${keyFile} exists; revoke it first or pick another name`);

  const pair = KeyPair.fromRandom("ed25519");
  const publicKey = pair.getPublicKey().toString();
  await account.addFunctionCallAccessKey({ publicKey, contractId: config.contract, methodNames: ["pay", "request", "ask_more"], allowance: KEY_ALLOWANCE });
  await call(account, config.contract, "set_policy", {
    public_key: publicKey,
    policy: {
      name,
      token: config.token,
      daily_cap: toUnits(daily).toString(),
      per_payment_cap: toUnits(perPayment).toString(),
      allowlist: flags.to ? flags.to.split(",").map((s) => s.trim()).filter(Boolean) : [],
      cooldown_secs: Number(flags.cooldown ?? 0),
      expires_at: flags.ttl ? ttlToSeconds(flags.ttl) : 0,
    },
  });
  const agent: AgentKey = {
    name,
    owner: config.owner,
    public_key: publicKey,
    private_key: pair.toString(),
    contract: config.contract,
    network: config.network,
    token: config.token,
  };
  mkdirSync(HOME, { recursive: true });
  writeFileSync(keyFile, JSON.stringify(agent, null, 2), { mode: 0o600 });
  console.log(`granted ${name}: ${publicKey}`);
  console.log(`key file: ${keyFile}`);
  console.log(`agent: export LEASH_KEY_FILE=${keyFile}`);
}

export async function revoke(name: string) {
  const config = loadConfig();
  const keyFile = join(HOME, `${name}.json`);
  const agent = JSON.parse(readFileSync(keyFile, "utf8")) as AgentKey;
  const { account } = ownerAccount(config);
  await call(account, config.contract, "revoke", { public_key: agent.public_key });
  try {
    await account.deleteKey(agent.public_key);
    console.log(`revoked ${name}: policy off, key deleted from ${config.owner}`);
  } catch (error) {
    console.log(`revoked ${name}: policy off; key delete failed (${String(error).slice(0, 80)})`);
  }
  // The file stays for the record, under a name that frees `grant` to issue a fresh key.
  renameSync(keyFile, join(HOME, `${name}.revoked.${Date.now()}.json`));
}
