// Linking a phone. The Leash app makes its own keys and asks the owner, on this site, to add them to
// their account. Two are limited to the owner's decisions on the Leash contract. The third is a
// full key, so the app can fund the vault, add agents and unlink itself without this site; the
// phone keeps it in the Keychain behind Face ID, and Settings here removes it if the phone is lost.

import { DEFAULT_NETWORK } from "./config";

export const PHONE_METHODS = ["approve", "deny", "pause", "resume", "revoke", "grant", "end_raise", "dismiss_proposal", "set_policy", "set_request_ttl", "withdraw"];

/// The phone's second key, the brake: it can only stop things, so the phone keeps it readable even
/// while locked. Pausing from Control Center, Siri or a notification's Deny never waits for Face ID.
export const BRAKE_METHODS = ["pause", "deny"];

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

export type LinkRequest = { key: string; brake: string | null; owner: string | null; device: string; callback: URL };

const KEY = /^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/;

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
  const brake = params.get("brake");
  const owner = params.get("owner");
  const bad = (k: string | null) => k !== null && !KEY.test(k);
  const keys = [key, brake, owner].filter((k): k is string => k !== null);
  if (!KEY.test(key) || bad(brake) || bad(owner) || new Set(keys).size !== keys.length) return { error: "This link does not carry a valid phone key. Start again from the app." };
  return { key, brake, owner, device, callback };
}

export function callbackUrl(request: LinkRequest, extra: Record<string, string>): string {
  const url = new URL(request.callback.toString());
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  if (!url.searchParams.has("network")) url.searchParams.set("network", DEFAULT_NETWORK);
  return url.toString();
}

/// A phone's key as the owner's account lists it: the decision key, the brake, or a full key.
export type PhoneKey = { key: string; brake: boolean; full?: boolean };

type KeyView = { public_key: string; access_key: { permission: unknown } };

/// The phone keys among an account's access keys: function-call keys on this Leash contract whose
/// methods are a phone's, and, when the key this browser signs with is known, every other full key.
/// A full key can't say whose it is, so only a sign-in that knows its own key lists them.
export function phoneKeysOf(keys: KeyView[], contract: string, ownKey?: string): PhoneKey[] {
  const out: PhoneKey[] = [];
  for (const k of keys) {
    if (k.access_key.permission === "FullAccess") {
      if (ownKey && k.public_key !== ownKey) out.push({ key: k.public_key, brake: false, full: true });
      continue;
    }
    const fc = (k.access_key.permission as { FunctionCall?: { receiver_id: string; method_names: string[] } }).FunctionCall;
    if (!fc || fc.receiver_id !== contract) continue;
    const methods = [...fc.method_names].sort();
    if (methods.includes("approve")) out.push({ key: k.public_key, brake: false });
    else if (methods.join() === [...BRAKE_METHODS].sort().join()) out.push({ key: k.public_key, brake: true });
  }
  return out;
}
