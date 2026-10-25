"use client";

// The owner's signing session, whichever way they signed in: a NEAR wallet through NEAR Connect,
// or an embedded wallet made at sign-in. Pages only ever see this interface.

import { Account, JsonRpcProvider, actions } from "near-api-js";
import { RPC } from "./config";
import { PrivySigner, publicKeyOfImplicit, type SignRawHash } from "./privySigner";
import type { Network } from "./types";
import { getConnector } from "./wallet";

export type SessionKind = "wallet" | "embedded";

export type OwnerSession = {
  accountId: string;
  network: Network;
  kind: SessionKind;
  /// Who signed in, in their own terms: an email or a provider name. Wallet sessions have none.
  label?: string;
  call(receiverId: string, method: string, args: Record<string, unknown>, deposit?: bigint, gas?: bigint): Promise<unknown>;
  addAgentKey(publicKey: string, contractId: string, methods: string[], allowance: string): Promise<unknown>;
  deleteKey(publicKey: string): Promise<unknown>;
};

const TGAS = BigInt(10) ** BigInt(12);
const DEFAULT_GAS = BigInt(60) * TGAS;

export function walletSession(accountId: string, network: Network): OwnerSession {
  // NEAR Connect takes near-api-js actions or its own plain action objects; both are passed through.
  const send = async (receiverId: string, list: unknown[]) => {
    const wallet = await getConnector(network).wallet();
    return wallet.signAndSendTransaction({ receiverId, actions: list as never });
  };
  return {
    accountId,
    network,
    kind: "wallet",
    call: (receiverId, method, args, deposit = BigInt(0), gas = DEFAULT_GAS) => send(receiverId, [actions.functionCall(method, args, gas, deposit)]),
    addAgentKey: (publicKey, contractId, methods, allowance) =>
      send(accountId, [{ type: "AddKey", params: { publicKey, accessKey: { permission: { receiverId: contractId, methodNames: methods, allowance } } } }]),
    deleteKey: (publicKey) => send(accountId, [{ type: "DeleteKey", params: { publicKey } }]),
  };
}

export function embeddedSession(accountId: string, network: Network, signRawHash: SignRawHash, label?: string): OwnerSession {
  const provider = new JsonRpcProvider({ url: RPC[network] });
  const account = new Account(accountId, provider, new PrivySigner(accountId, publicKeyOfImplicit(accountId), signRawHash));
  return {
    accountId,
    network,
    kind: "embedded",
    label,
    call: (receiverId, method, args, deposit = BigInt(0), gas = DEFAULT_GAS) => account.callFunction({ contractId: receiverId, methodName: method, args, deposit, gas }),
    addAgentKey: (publicKey, contractId, methods, allowance) => account.addFunctionCallAccessKey({ publicKey, contractId, methodNames: methods, allowance: BigInt(allowance) }),
    deleteKey: (publicKey) => account.deleteKey(publicKey),
  };
}
