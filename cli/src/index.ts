#!/usr/bin/env node
// leash: the owner's side. Deploy a Leash contract, fund it, hand out bounded keys to agents, and
// decide what the agents could not decide for themselves.
//
// The owner's own key never leaves ~/.near-credentials. Agent keys are written to ~/.leash/<name>.json
// and are useless anywhere but the Leash contract.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from "near-api-js";

type Network = "testnet" | "mainnet";

type Config = {
  owner: string;
  contract: string;
  network: Network;
  token: string;
  owner_key_file: string;
};

type AgentKey = {
  name: string;
  owner: string;
  public_key: string;
  private_key: string;
  contract: string;
  network: Network;
  token: string;
};

const HOME = join(homedir(), ".leash");
const CONFIG = join(HOME, "config.json");
const RPC: Record<Network, string> = {
  testnet: "https://rpc.testnet.fastnear.com",
  mainnet: "https://rpc.mainnet.fastnear.com",
};
// Circle's native USDC on each network; the bridged USDC.e is not this.
const USDC: Record<Network, string> = {
  testnet: "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af",
  mainnet: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
};
const DECIMALS = 6n;
const NEAR = 10n ** 24n;
const TGAS = 10n ** 12n;
// Enough gas for the agent to make a few hundred calls before the owner tops the key up; the cap
// is on compute, the policy caps the money.
const KEY_ALLOWANCE = NEAR / 4n;
// What the token contract charges to register an account that will hold its tokens.
const STORAGE_DEPOSIT = 1_250_000_000_000_000_000_000n;

function usage(): never {
  console.log(`leash <command> [options]

  init      --owner <account> [--network testnet] [--wasm <path>] [--owner-key <file>]
            Create leash.<owner>, deploy the contract, register it on USDC, save ~/.leash/config.json
  deposit   <usdc>                      Move USDC from the owner into the Leash vault
  withdraw  <usdc>                      Move USDC from the vault back to the owner
  grant     --name <agent> --daily <usdc> --per-payment <usdc> [--to a.near,b.near] [--cooldown <secs>] [--ttl <2h|3d>]
            Make a key for an agent, add it to the owner's account, set its policy, write ~/.leash/<agent>.json
  revoke    <agent>                     Policy off and key deleted from the account
  pause | resume                        Kill switch for every agent key
  approve   <id> [--force] | deny <id>  Decide a parked request; approve refuses an unregistered recipient unless forced
  register  <account>                   Pay an account's registration on the token so it can receive USDC
  status | requests | log               What the agents can do, want to do, and did
`);
  process.exit(1);
}

function toUnits(usdc: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(usdc.trim());
  if (!match) throw new Error(`amount must look like 12.50, got ${usdc}`);
  return BigInt(match[1]) * 10n ** DECIMALS + BigInt((match[2] ?? "").padEnd(Number(DECIMALS), "0"));
}

function toUsdc(units: string | bigint): string {
  const value = BigInt(units);
  const frac = (value % 10n ** DECIMALS).toString().padStart(Number(DECIMALS), "0").replace(/0+$/, "");
  return frac ? `${value / 10n ** DECIMALS}.${frac}` : `${value / 10n ** DECIMALS}`;
}

function ttlToSeconds(ttl: string): number {
  const match = /^(\d+)([mhd])$/.exec(ttl);
  if (!match) throw new Error(`ttl must look like 30m, 2h or 3d, got ${ttl}`);
  const unit = { m: 60, h: 3600, d: 86400 }[match[2] as "m" | "h" | "d"];
  return Math.floor(Date.now() / 1000) + Number(match[1]) * unit;
}

function loadConfig(): Config {
  if (!existsSync(CONFIG)) throw new Error("no ~/.leash/config.json; run `leash init` first");
  return JSON.parse(readFileSync(CONFIG, "utf8")) as Config;
}

function ownerAccount(config: Pick<Config, "owner" | "network" | "owner_key_file">): { account: Account; provider: JsonRpcProvider; publicKey: string } {
  const credentials = JSON.parse(readFileSync(config.owner_key_file, "utf8")) as { public_key: string; private_key: string };
  const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC ?? RPC[config.network] });
  const signer = KeyPairSigner.fromSecretKey(credentials.private_key as `ed25519:${string}`);
  return { account: new Account(config.owner, provider, signer), provider, publicKey: credentials.public_key };
}

async function view<T>(provider: JsonRpcProvider, contractId: string, method: string, args: Record<string, unknown>): Promise<T> {
  return (await provider.callFunction({ contractId, method, args })) as unknown as T;
}

async function call(account: Account, contractId: string, methodName: string, args: Record<string, unknown>, deposit = 0n, gas = 30n * TGAS) {
  return account.callFunction({ contractId, methodName, args, deposit, gas });
}

async function init(flags: Record<string, string | undefined>) {
  const owner = flags.owner ?? usage();
  const network = (flags.network ?? "testnet") as Network;
  const ownerKeyFile = flags["owner-key"] ?? join(homedir(), ".near-credentials", network, `${owner}.json`);
  // cargo-near's optimised binary is half the size of a plain cargo build, and storage is paid per byte.
  const candidates = [join(process.cwd(), "contract/target/near/leash.wasm"), join(process.cwd(), "contract/target/wasm32-unknown-unknown/release/leash.wasm")];
  const wasmPath = flags.wasm ?? candidates.find((p) => existsSync(p)) ?? candidates[0];
  if (!existsSync(ownerKeyFile)) throw new Error(`no owner key at ${ownerKeyFile}; log in with the near CLI first`);
  if (!existsSync(wasmPath)) throw new Error(`no contract at ${wasmPath}; build it with cargo first`);
  const contract = `leash.${owner}`;
  const { account, provider, publicKey } = ownerAccount({ owner, network, owner_key_file: ownerKeyFile });

  let exists = false;
  try {
    await provider.viewAccount({ accountId: contract });
    exists = true;
  } catch {
    exists = false;
  }
  // Four NEAR covers the optimised contract code plus the first few thousand policy and log entries.
  const FLOOR = 4n * NEAR;
  if (!exists) {
    await account.createSubAccount({ accountOrPrefix: "leash", publicKey, nearToTransfer: FLOOR });
    console.log(`created ${contract}`);
  } else {
    const { amount } = await provider.viewAccount({ accountId: contract });
    if (amount < FLOOR) {
      await account.transfer({ receiverId: contract, amount: FLOOR - amount });
      console.log(`topped ${contract} up to 4 NEAR for storage`);
    }
  }
  const contractAccount = new Account(contract, provider, KeyPairSigner.fromSecretKey(JSON.parse(readFileSync(ownerKeyFile, "utf8")).private_key));
  await contractAccount.deployContract(readFileSync(wasmPath));
  console.log(`deployed ${wasmPath}`);
  try {
    await call(contractAccount, contract, "new", {});
    console.log("initialised");
  } catch (error) {
    if (!String(error).includes("already")) throw error;
    console.log("already initialised");
  }
  const token = flags.token ?? USDC[network];
  // Both the vault and the owner must be registered on the token before either can hold it; a
  // faucet or a transfer to an unregistered account fails with no clear message.
  for (const who of [contract, owner]) {
    const registered = await view<unknown>(provider, token, "storage_balance_of", { account_id: who });
    if (!registered) {
      await call(account, token, "storage_deposit", { account_id: who }, STORAGE_DEPOSIT);
      console.log(`registered ${who} on ${token}`);
    }
  }
  // The contract charges the owner for every byte their policies, requests and log add; half a NEAR
  // covers thousands of entries and is refunded as entries are decided.
  const credit = BigInt((await view<string>(provider, contract, "get_storage", { owner })) ?? "0");
  if (credit < NEAR / 10n) {
    await call(account, contract, "deposit_storage", {}, NEAR / 2n);
    console.log(`put 0.5 NEAR down for ${owner}'s storage`);
  }
  mkdirSync(HOME, { recursive: true });
  const config: Config = { owner, contract, network, token, owner_key_file: ownerKeyFile };
  writeFileSync(CONFIG, JSON.stringify(config, null, 2));
  console.log(`saved ${CONFIG}`);
}

async function deposit(usdc: string) {
  const config = loadConfig();
  const { account, provider } = ownerAccount(config);
  const amount = toUnits(usdc);
  await call(account, config.token, "ft_transfer_call", { receiver_id: config.contract, amount: amount.toString(), msg: "" }, 1n, 60n * TGAS);
  const vault = await view<string>(provider, config.contract, "get_vault", { owner: config.owner, token: config.token });
  console.log(`vault: ${toUsdc(vault)} USDC`);
}

async function withdraw(usdc: string) {
  const config = loadConfig();
  const { account, provider } = ownerAccount(config);
  await call(account, config.contract, "withdraw", { token: config.token, amount: toUnits(usdc).toString() });
  const vault = await view<string>(provider, config.contract, "get_vault", { owner: config.owner, token: config.token });
  console.log(`vault: ${toUsdc(vault)} USDC`);
}

async function grant(flags: Record<string, string | undefined>) {
  const config = loadConfig();
  const name = flags.name ?? usage();
  const daily = flags.daily ?? usage();
  const perPayment = flags["per-payment"] ?? daily;
  const { account } = ownerAccount(config);
  const keyFile = join(HOME, `${name}.json`);
  if (existsSync(keyFile)) throw new Error(`${keyFile} exists; revoke it first or pick another name`);

  const pair = KeyPair.fromRandom("ed25519");
  const publicKey = pair.getPublicKey().toString();
  await account.addFunctionCallAccessKey({ publicKey, contractId: config.contract, methodNames: ["pay", "request"], allowance: KEY_ALLOWANCE });
  await call(account, config.contract, "set_policy", {
    public_key: publicKey,
    policy: {
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

async function revoke(name: string) {
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

async function simple(method: "pause" | "resume") {
  const config = loadConfig();
  const { account } = ownerAccount(config);
  await call(account, config.contract, method, {});
  console.log(method === "pause" ? "paused: no agent key can pay" : "resumed");
}

async function decide(method: "approve" | "deny", id: string, force = false) {
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

async function register(who: string) {
  const config = loadConfig();
  const { account, provider } = ownerAccount(config);
  const registered = await view<unknown>(provider, config.token, "storage_balance_of", { account_id: who });
  if (registered) return console.log(`${who} is already registered on the token`);
  await call(account, config.token, "storage_deposit", { account_id: who }, STORAGE_DEPOSIT);
  console.log(`registered ${who} on the token; it can receive USDC now`);
}

async function status() {
  const config = loadConfig();
  const { provider } = ownerAccount(config);
  const [vault, paused, policies, storage] = await Promise.all([
    view<string>(provider, config.contract, "get_vault", { owner: config.owner, token: config.token }),
    view<boolean>(provider, config.contract, "is_paused", { owner: config.owner }),
    view<[string, { daily_cap: string; per_payment_cap: string; active: boolean; allowlist: string[]; expires_at: number }][]>(provider, config.contract, "get_policies", { owner: config.owner }),
    view<string>(provider, config.contract, "get_storage", { owner: config.owner }),
  ]);
  console.log(`${config.contract} on ${config.network}${paused ? "  PAUSED" : ""}`);
  console.log(`vault: ${toUsdc(vault)} USDC, storage credit: ${(Number(BigInt(storage ?? "0") / 10n ** 20n) / 10_000).toFixed(4)} NEAR`);
  for (const [key, policy] of policies) {
    const check = await view<{ remaining_today: string }>(provider, config.contract, "check", { owner: config.owner, public_key: key, to: config.owner, amount: "1" });
    const until = policy.expires_at ? ` until ${new Date(policy.expires_at * 1000).toISOString()}` : "";
    console.log(`  ${policy.active ? "on " : "off"} ${key}  ${toUsdc(check.remaining_today)} of ${toUsdc(policy.daily_cap)} left today, ${toUsdc(policy.per_payment_cap)} per payment${policy.allowlist.length ? `, to ${policy.allowlist.join(", ")}` : ""}${until}`);
  }
}

async function requests() {
  const config = loadConfig();
  const { provider } = ownerAccount(config);
  const rows = await view<{ id: number; to: string; amount: string; memo: string | null; reason: string }[]>(provider, config.contract, "get_requests", { owner: config.owner });
  if (!rows.length) return console.log("no parked requests");
  for (const r of rows) console.log(`#${r.id}  ${toUsdc(r.amount)} USDC to ${r.to}  (${r.reason})${r.memo ? `  ${r.memo}` : ""}`);
}

async function log() {
  const config = loadConfig();
  const { provider } = ownerAccount(config);
  const rows = await view<{ at: number; event: string; to: string | null; amount: string | null; detail: string | null; key: string | null }[]>(provider, config.contract, "get_log", { owner: config.owner });
  for (const r of rows) {
    const when = new Date(Number(BigInt(r.at) / 1_000_000n)).toISOString().replace("T", " ").slice(0, 19);
    console.log(`${when}  ${r.event.padEnd(16)} ${r.amount ? toUsdc(r.amount).padStart(10) : "".padStart(10)}  ${r.to ?? ""}${r.detail ? `  ${r.detail}` : ""}`);
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      owner: { type: "string" },
      network: { type: "string" },
      wasm: { type: "string" },
      token: { type: "string" },
      "owner-key": { type: "string" },
      name: { type: "string" },
      daily: { type: "string" },
      "per-payment": { type: "string" },
      to: { type: "string" },
      cooldown: { type: "string" },
      ttl: { type: "string" },
      force: { type: "boolean" },
    },
  });
  const [command, arg] = positionals;
  const flags = values as unknown as Record<string, string | undefined>;
  switch (command) {
    case "init": return init(flags);
    case "deposit": return deposit(arg ?? usage());
    case "withdraw": return withdraw(arg ?? usage());
    case "grant": return grant(flags);
    case "revoke": return revoke(arg ?? usage());
    case "pause": return simple("pause");
    case "resume": return simple("resume");
    case "approve": return decide("approve", arg ?? usage(), values.force === true);
    case "deny": return decide("deny", arg ?? usage());
    case "register": return register(arg ?? usage());
    case "status": return status();
    case "requests": return requests();
    case "log": return log();
    default: usage();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
