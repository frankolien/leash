// The two documents an MCP client reads first: where the protected MCP endpoint is and who issues
// tokens for it (RFC 9728), and how to talk to that issuer (RFC 8414).

import { NextResponse } from "next/server";
import { CORS, originOf } from "./oauth";

export function protectedResource(request: Request) {
  const origin = originOf(request);
  return NextResponse.json({ resource: `${origin}/api/mcp`, authorization_servers: [origin], bearer_methods_supported: ["header"], resource_name: "Leash" }, { headers: CORS });
}

export function authorizationServer(request: Request) {
  const origin = originOf(request);
  return NextResponse.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/connect`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["pay"],
    },
    { headers: CORS },
  );
}

export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
