// Joining Leash: the shared contract by default, or a private instance with --own-contract.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Account, JsonRpcProvider, KeyPairSigner } from "near-api-js";
import { call, ownerAccount, view } from "../chain.js";
import { CONFIG, HOME, NEAR, SHARED, STORAGE_DEPOSIT, USDC, type Config, type Network } from "../config.js";
import { usage } from "../usage.js";

async function deployOwn(o: { account: Account; provider: JsonRpcProvider; publicKey: string; contract: string; wasmPath: string; ownerKeyFile: string }) {
  const { account, provider, publicKey, contract, wasmPath, ownerKeyFile } = o;
  if (!existsSync(wasmPath)) throw new Error(`no contract at ${wasmPath}; build it with cargo first`);
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
}

export async function init(flags: Record<string, string | undefined>) {
  const owner = flags.owner ?? usage();
  const network = (flags.network ?? "testnet") as Network;
  const ownerKeyFile = flags["owner-key"] ?? join(homedir(), ".near-credentials", network, `${owner}.json`);
  // cargo-near's optimised binary is half the size of a plain cargo build, and storage is paid per byte.
  const candidates = [join(process.cwd(), "contract/target/near/leash.wasm"), join(process.cwd(), "contract/target/wasm32-unknown-unknown/release/leash.wasm")];
  const wasmPath = flags.wasm ?? candidates.find((p) => existsSync(p)) ?? candidates[0];
  if (!existsSync(ownerKeyFile)) throw new Error(`no owner key at ${ownerKeyFile}; log in with the near CLI first`);
  // Every owner shares one contract by default; --own-contract deploys a private instance at
  // leash.<owner>, which locks about 4 NEAR for the code.
  const own = flags["own-contract"] !== undefined;
  const contract = flags.contract ?? (own ? `leash.${owner}` : SHARED[network]);
  const { account, provider, publicKey } = ownerAccount({ owner, network, owner_key_file: ownerKeyFile });
  if (own) await deployOwn({ account, provider, publicKey, contract, wasmPath, ownerKeyFile });

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
