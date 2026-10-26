// POST /api/name: claims name.testnet (name.near on mainnet) for the signed-in owner. The sponsor
// creates it with the owner's Privy key as its full-access key and readies it. One name per key.

import { NextResponse } from "next/server";
import { DEFAULT_NETWORK, isImplicit } from "@/lib/config";
import { fullName, nameProblem, namesOfKey } from "@/lib/names";
import { publicKeyOfImplicit } from "@/lib/privySigner";
import { isRefusal, rateLimiter, signedInWallets } from "@/lib/server/owner";
import { claimName } from "@/lib/server/sponsor";

const limited = rateLimiter(5, 60 * 60_000);

export async function POST(request: Request) {
  if (limited(request)) return NextResponse.json({ error: "too many tries from this address; try again later" }, { status: 429 });
  const { name, wallet } = (await request.json().catch(() => ({}))) as { name?: string; wallet?: string };
  const problem = nameProblem(name ?? "");
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const wallets = await signedInWallets(request);
  if (isRefusal(wallets)) return NextResponse.json({ error: wallets.error }, { status: wallets.status });
  // In development without Privy the caller names its own key's implicit address.
  const address = wallets === "any" ? wallet : wallets[0];
  if (!address || !isImplicit(address)) return NextResponse.json({ error: "no NEAR wallet on this sign-in" }, { status: 400 });
  const publicKey = publicKeyOfImplicit(address).toString();

  const owned = await namesOfKey(publicKey, DEFAULT_NETWORK).catch(() => []);
  if (owned.length) return NextResponse.json({ error: `you already have ${owned[0]}`, accountId: owned[0] }, { status: 409 });

  const accountId = fullName(name!, DEFAULT_NETWORK);
  try {
    const ready = await claimName(accountId, publicKey, DEFAULT_NETWORK);
    return NextResponse.json({ accountId, ...ready, storageCredit: ready.storageCredit.toString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Leash: claiming ${accountId} failed:`, message);
    return NextResponse.json({ error: message }, { status: message === "that name is taken" ? 409 : 502 });
  }
}
