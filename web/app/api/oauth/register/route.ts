// POST /api/oauth/register: dynamic client registration (RFC 7591). The client id is the sealed
// registration itself, so later steps can check a redirect against it without storing anything.

import { NextResponse } from "next/server";
import { CORS, seal } from "@/lib/server/oauth";
import { preflight } from "@/lib/server/discovery";

export { preflight as OPTIONS };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { redirect_uris?: unknown; client_name?: unknown };
  const redirects = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  const valid = redirects.length > 0 && redirects.every((u) => {
    try {
      const url = new URL(u);
      return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
    } catch {
      return false;
    }
  });
  if (!valid) return NextResponse.json({ error: "invalid_redirect_uri", error_description: "redirect_uris must be https URLs" }, { status: 400, headers: CORS });
  const name = typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim().slice(0, 60) : "An AI agent";
  const client_id = await seal("client", { redirect_uris: redirects, name });
  return NextResponse.json(
    { client_id, client_name: name, redirect_uris: redirects, grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" },
    { status: 201, headers: CORS },
  );
}
