// The sign-up sponsor. A new embedded-wallet owner starts with an account that holds nothing; the
// sponsor sends it enough NEAR for gas and its agents' keys, registers it on USDC, and pays its
// Leash storage credit, so the first screen it sees is ready to use.

import { Account, JsonRpcProvider, KeyPairSigner } from "near-api-js";
import { CONTRACT, RPC, USDC } from "@/lib/config";
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

export type Readiness = { exists: boolean; usdcRegistered: boolean; storageCredit: bigint };

function sponsorAccount(network: Network): Account {
  const id = process.env.SPONSOR_ACCOUNT_ID;
  const key = process.env.SPONSOR_PRIVATE_KEY;
  if (!id || !key) throw new Error("the sponsor is not configured");
  return new Account(id, new JsonRpcProvider({ url: RPC[network] }), KeyPairSigner.fromSecretKey(key as `ed25519:${string}`));
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
