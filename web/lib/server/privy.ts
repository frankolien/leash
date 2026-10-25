// Verifies a Privy identity token on the server and reads the NEAR wallets linked to the user, so
// the sponsor only ever readies an account that the signed-in person actually holds.

import { createRemoteJWKSet, jwtVerify } from "jose";

type LinkedAccount = { type: string; chain_type?: string; address?: string };

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export async function nearWalletsOf(idToken: string, appId: string): Promise<string[]> {
  jwks ??= createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`));
  const { payload } = await jwtVerify(idToken, jwks, { issuer: "privy.io", audience: appId });
  const raw = payload.linked_accounts;
  const linked: LinkedAccount[] = typeof raw === "string" ? JSON.parse(raw) : Array.isArray(raw) ? (raw as LinkedAccount[]) : [];
  return linked.filter((a) => a.type === "wallet" && a.chain_type === "near" && a.address).map((a) => a.address as string);
}
