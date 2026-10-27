// The sign-up sponsor. A new embedded-wallet owner starts with nothing; the sponsor creates their
// named account (or funds their implicit one) with enough NEAR for gas and their agents' keys,
// registers it on USDC, and pays its Leash storage credit, so the first screen it sees is ready.

import { Account, JsonRpcProvider, KeyPairSigner } from "near-api-js";
import { CONTRACT, RPC, USDC } from "@/lib/config";
import { REGISTRAR, accountExists } from "@/lib/names";
import type { Network } from "@/lib/types";

const NEAR = BigInt(10) ** BigInt(24);
const MILLI = NEAR / BigInt(1000);
/// Gas for the owner's own calls and the allowance their agent keys draw from.
export const ONBOARD_NEAR = BigInt(300) * MILLI;
/// NEP-145 registration on the USDC contract.
export const USDC_STORAGE = BigInt(125) * (MILLI / BigInt(100));
/// Leash storage credit: enough for a handful of agents, their requests and the log.
export const LEASH_STORAGE = BigInt(100) * MILLI;
const TGAS = BigInt(10) ** BigInt(12);
const ONE_YOCTO = BigInt(1);
/// Test USDC handed to a new testnet owner, in the token's 6-decimal units: $5.
export const TEST_USDC = BigInt(5_000_000);
/// An account holding at least $1 already has something to try Leash with.
const ENOUGH_USDC = BigInt(1_000_000);

export type Readiness = { exists: boolean; usdcRegistered: boolean; storageCredit: bigint };

export function sponsorAccount(network: Network): Account {
  const id = process.env.SPONSOR_ACCOUNT_ID;
  const key = process.env.SPONSOR_PRIVATE_KEY;
  if (!id || !key) throw new Error("the sponsor is not configured");
  return new Account(id, new JsonRpcProvider({ url: RPC[network] }), KeyPairSigner.fromSecretKey(key as `ed25519:${string}`));
}

/// Creates accountId (a direct child of the registrar) with publicKey as its only full-access key,
/// funded with ONBOARD_NEAR, then readies it like any other owner.
export async function claimName(accountId: string, publicKey: string, network: Network): Promise<Readiness> {
  if (await accountExists(accountId, network)) throw new Error("that name is taken");
  const sponsor = sponsorAccount(network);
  const created = await sponsor.callFunction({ contractId: REGISTRAR[network], methodName: "create_account", args: { new_account_id: accountId, new_public_key: publicKey }, deposit: ONBOARD_NEAR, gas: BigInt(100) * TGAS });
  // The registrar refunds and answers false when it cannot create the account.
  if (created !== true) throw new Error("that name could not be created; try another");
  // Final state trails the receipt that made the account by a block or two.
  for (let tries = 0; !(await accountExists(accountId, network)); tries++) {
    if (tries === 10) throw new Error("the name was created but has not appeared yet; refresh in a moment");
    await new Promise((r) => setTimeout(r, 700));
  }
  return onboard(accountId, network);
}

export async function readiness(accountId: string, network: Network): Promise<Readiness> {
  const provider = new JsonRpcProvider({ url: RPC[network] });
  const exists = await provider.viewAccount({ accountId }).then(() => true, () => false);
  const usdc = await provider.callFunction({ contractId: USDC[network], method: "storage_balance_of", args: { account_id: accountId } }).catch(() => null);
  const credit = await provider.callFunction({ contractId: CONTRACT[network], method: "get_storage", args: { owner: accountId } }).catch(() => "0");
  return { exists, usdcRegistered: usdc !== null, storageCredit: BigInt((credit as string) ?? "0") };
}

/// Each step runs only if it is still missing, so a retry after a partial failure finishes the job
/// without paying twice.
export async function onboard(accountId: string, network: Network): Promise<Readiness> {
  const sponsor = sponsorAccount(network);
  const before = await readiness(accountId, network);
  if (!before.exists) await sponsor.transfer({ receiverId: accountId, amount: ONBOARD_NEAR });
  if (!before.usdcRegistered) {
    await sponsor.callFunction({ contractId: USDC[network], methodName: "storage_deposit", args: { account_id: accountId, registration_only: true }, deposit: USDC_STORAGE, gas: BigInt(30) * TGAS });
  }
  if (before.storageCredit === BigInt(0)) {
    await sponsor.callFunction({ contractId: CONTRACT[network], methodName: "deposit_storage", args: { account_id: accountId }, deposit: LEASH_STORAGE, gas: BigInt(30) * TGAS });
  }
  return readiness(accountId, network);
}

async function usdcBalance(provider: JsonRpcProvider, accountId: string): Promise<bigint> {
  const balance = await provider.callFunction({ contractId: USDC.testnet, method: "ft_balance_of", args: { account_id: accountId } });
  return BigInt((balance as string) ?? "0");
}

/// Whether the tap can pay out right now, so the page offers it only when it works.
export async function testUsdcInStock(): Promise<boolean> {
  const id = process.env.SPONSOR_ACCOUNT_ID;
  if (!id) return false;
  return (await usdcBalance(new JsonRpcProvider({ url: RPC.testnet }), id)) >= TEST_USDC;
}

/// Sends TEST_USDC from the sponsor's own stock, which is topped up from Circle's faucet. Refuses,
/// with a reason the owner can act on, when the account already holds some or the stock is out.
export async function giveTestUsdc(accountId: string): Promise<{ given: string; reason?: undefined } | { given: null; reason: string }> {
  const sponsor = sponsorAccount("testnet");
  const provider = new JsonRpcProvider({ url: RPC.testnet });
  if ((await usdcBalance(provider, accountId)) >= ENOUGH_USDC) return { given: null, reason: "your account already has test USDC" };
  if ((await usdcBalance(provider, sponsor.accountId)) < TEST_USDC) return { given: null, reason: "the test USDC tap is empty right now" };
  const ready = await readiness(accountId, "testnet");
  if (!ready.usdcRegistered) {
    await sponsor.callFunction({ contractId: USDC.testnet, methodName: "storage_deposit", args: { account_id: accountId, registration_only: true }, deposit: USDC_STORAGE, gas: BigInt(30) * TGAS });
  }
  await sponsor.callFunction({ contractId: USDC.testnet, methodName: "ft_transfer", args: { receiver_id: accountId, amount: TEST_USDC.toString(), memo: "Leash test USDC" }, deposit: ONE_YOCTO, gas: BigInt(30) * TGAS });
  return { given: TEST_USDC.toString() };
}
