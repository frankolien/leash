// POST /api/oauth/token: trades an authorization code (with its PKCE verifier) or a refresh token
// for an access token. Both tokens carry the agent's key, sealed.

import { NextResponse } from "next/server";
import { ACCESS_SECONDS, CORS, open, pkceMatches, seal } from "@/lib/server/oauth";
import { preflight } from "@/lib/server/discovery";

export { preflight as OPTIONS };

function refuse(error: string, description: string) {
  return NextResponse.json({ error, error_description: description }, { status: 400, headers: { ...CORS, "cache-control": "no-store" } });
}

async function issue(grant: { key: import("leash-near-mcp").KeyFile; client_id: string }) {
  const access_token = await seal("access", grant);
  const refresh_token = await seal("refresh", grant);
  return NextResponse.json({ access_token, token_type: "Bearer", expires_in: ACCESS_SECONDS, refresh_token, scope: "pay" }, { headers: { ...CORS, "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  const form = type.includes("application/json")
    ? new URLSearchParams(Object.entries((await request.json().catch(() => ({}))) as Record<string, string>))
    : new URLSearchParams(await request.text());
  const grantType = form.get("grant_type");

  if (grantType === "authorization_code") {
    const code = await open("code", form.get("code"));
    if (!code) return refuse("invalid_grant", "the code is unknown or expired");
    if (form.get("client_id") && form.get("client_id") !== code.client_id) return refuse("invalid_grant", "the code was issued to another client");
    if (form.get("redirect_uri") && form.get("redirect_uri") !== code.redirect_uri) return refuse("invalid_grant", "redirect_uri does not match");
    if (!(await pkceMatches(form.get("code_verifier") ?? "", code.challenge))) return refuse("invalid_grant", "code_verifier does not match");
    return issue({ key: code.key, client_id: code.client_id });
  }

  if (grantType === "refresh_token") {
    const grant = await open("refresh", form.get("refresh_token"));
    if (!grant) return refuse("invalid_grant", "the refresh token is unknown or expired");
    return issue(grant);
  }

  return refuse("unsupported_grant_type", "use authorization_code or refresh_token");
}
