// OAuth for the hosted MCP connector, with nothing stored. Every artifact the flow hands out (the
// registered client, the authorization code, the access and refresh tokens) is an encrypted JWT
// sealed with LEASH_OAUTH_SECRET, so the server can check and open it later without a database.
// Tokens carry the agent's key; only this server can read them, and the key itself can only spend
// within the limits its owner set on chain. Revoking the agent in the dashboard deletes the key, so
// a leaked token stops working at NEAR.

import { EncryptJWT, jwtDecrypt } from "jose";
import type { KeyFile } from "leash-near-mcp";

export type Client = { redirect_uris: string[]; name: string };
export type Code = { key: KeyFile; client_id: string; redirect_uri: string; challenge: string };
export type Grant = { key: KeyFile; client_id: string };

type Kinds = { client: Client; code: Code; access: Grant; refresh: Grant };

const LIFETIME: Record<keyof Kinds, string> = { client: "3650d", code: "5m", access: "1d", refresh: "365d" };
export const ACCESS_SECONDS = 24 * 60 * 60;

let cached: Uint8Array | null = null;
async function secret(): Promise<Uint8Array> {
  if (cached) return cached;
  const raw = process.env.LEASH_OAUTH_SECRET;
  if (!raw || raw.length < 32) throw new Error("LEASH_OAUTH_SECRET is not set");
  cached = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)));
  return cached;
}

export async function seal<K extends keyof Kinds>(kind: K, payload: Kinds[K]): Promise<string> {
  return new EncryptJWT({ ...payload, kind } as Record<string, unknown>)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(LIFETIME[kind])
    .encrypt(await secret());
}

/// The payload if the token is ours, of this kind and unexpired; otherwise null.
export async function open<K extends keyof Kinds>(kind: K, token: string | null | undefined): Promise<Kinds[K] | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, await secret());
    return payload.kind === kind ? (payload as unknown as Kinds[K]) : null;
  } catch {
    return null;
  }
}

/// PKCE S256: the verifier the client kept hashes to the challenge it sent with the request.
export async function pkceMatches(verifier: string, challenge: string): Promise<boolean> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const encoded = btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return encoded === challenge;
}

/// The public origin the request arrived on, behind a proxy or tunnel too.
export function originOf(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/// Lets browser-based MCP clients read our answers.
export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id",
  "access-control-expose-headers": "www-authenticate, mcp-session-id",
};
