// Linking a phone. The Leash app makes its own key and asks the owner, on this site, to add it to
// their account. The key is limited to the owner's decisions on the Leash contract: it can approve,
// deny, pause and revoke, but it cannot move the owner's tokens or add keys, so a lost phone can
// never empty the account.

import { DEFAULT_NETWORK } from "./config";

export const PHONE_METHODS = ["approve", "deny", "pause", "resume", "revoke", "grant", "end_raise", "dismiss_proposal", "set_policy", "set_request_ttl", "withdraw"];

/// Gas the phone may burn from the owner's balance; a decision costs well under 0.001 NEAR.
export const PHONE_ALLOWANCE = (BigInt(10) ** BigInt(24)).toString();

export const APP_SCHEME = "leash:";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/// Six characters both the phone and this page derive from the key, so the owner can see the key
/// they are about to add is the one their phone made.
export async function pairingCode(publicKey: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(publicKey)));
  const code = Array.from(digest.slice(0, 6), (b) => ALPHABET[b & 31]).join("");
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export type LinkRequest = { key: string; device: string; callback: URL };

export function linkRequest(params: URLSearchParams): LinkRequest | { error: string } {
  const key = params.get("key") ?? "";
  const device = (params.get("device") ?? "").trim().slice(0, 40) || "iPhone";
  let callback: URL;
  try {
    callback = new URL(params.get("callback") ?? "");
  } catch {
    return { error: "Open this page from the Leash app on your phone." };
  }
  if (callback.protocol !== APP_SCHEME) return { error: "Open this page from the Leash app on your phone." };
  if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(key)) return { error: "This link does not carry a valid phone key. Start again from the app." };
  return { key, device, callback };
}

export function callbackUrl(request: LinkRequest, extra: Record<string, string>): string {
  const url = new URL(request.callback.toString());
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  if (!url.searchParams.has("network")) url.searchParams.set("network", DEFAULT_NETWORK);
  return url.toString();
}
