// The owner's account, signed with the key the near CLI keeps, and the two ways to reach a contract.

import { readFileSync } from "node:fs";
import { Account, JsonRpcProvider, KeyPairSigner } from "near-api-js";
import { RPC, TGAS, type Config } from "./config.js";

export function ownerAccount(config: Pick<Config, "owner" | "network" | "owner_key_file">): { account: Account; provider: JsonRpcProvider; publicKey: string } {
  const credentials = JSON.parse(readFileSync(config.owner_key_file, "utf8")) as { public_key: string; private_key: string };
  const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC ?? RPC[config.network] });
  const signer = KeyPairSigner.fromSecretKey(credentials.private_key as `ed25519:${string}`);
  return { account: new Account(config.owner, provider, signer), provider, publicKey: credentials.public_key };
}

export async function view<T>(provider: JsonRpcProvider, contractId: string, method: string, args: Record<string, unknown>): Promise<T> {
  return (await provider.callFunction({ contractId, method, args })) as unknown as T;
}

export async function call(account: Account, contractId: string, methodName: string, args: Record<string, unknown>, deposit = 0n, gas = 30n * TGAS) {
  return account.callFunction({ contractId, methodName, args, deposit, gas });
}
