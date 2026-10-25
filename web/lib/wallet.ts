"use client";

// NEAR wallets through NEAR Connect. Only writes go through it; every read is plain RPC. The
// connector is created once per page so wallets keep their session across renders.

import { NearConnector } from "@hot-labs/near-connect";
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
