"use client";

// The owner's wallet, through HOT Connect. Only writes go through it; every read is plain RPC.
// The connector is created once per page so wallets keep their session across renders.

import { NearConnector } from "@hot-labs/near-connect";
import { actions } from "near-api-js";
import type { Network } from "./types";

export type Wallet = Awaited<ReturnType<NearConnector["wallet"]>>;

let connector: NearConnector | null = null;
let connectorNetwork: Network | null = null;

export function getConnector(network: Network): NearConnector {
  if (!connector || connectorNetwork !== network) {
    connector = new NearConnector({ network });
    connectorNetwork = network;
  }
  return connector;
}

export async function connectedAccount(network: Network): Promise<string | null> {
  try {
    const { accounts } = await getConnector(network).getConnectedWallet();
    return accounts[0]?.accountId ?? null;
  } catch {
    return null;
  }
}

export async function connect(network: Network): Promise<string | null> {
  const connector = getConnector(network);
  await connector.connect();
  return connectedAccount(network);
}

export async function disconnect(network: Network): Promise<void> {
  await getConnector(network).disconnect();
}

const TGAS = BigInt(10) ** BigInt(12);

/// One function call on a contract, signed and sent by the connected wallet.
export async function callAs(network: Network, receiverId: string, methodName: string, args: Record<string, unknown>, deposit = BigInt(0), gas = BigInt(60) * TGAS) {
  const wallet = await getConnector(network).wallet();
  return wallet.signAndSendTransaction({
    receiverId,
    actions: [actions.functionCall(methodName, args, gas, deposit)],
  });
}
