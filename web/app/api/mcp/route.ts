// The hosted Leash MCP server. Each request carries a sealed access token holding one agent's key;
// the server opens it, binds the Leash tools to that key and answers over Streamable HTTP. The
// agent's instructions are signed with its key and relayed here, so it never needs NEAR for gas.
// Nothing persists between requests, so it runs stateless on any number of instances.

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createLeashServer } from "leash-near-mcp";
import { CORS, open, originOf } from "@/lib/server/oauth";
import { relayIntent } from "@/lib/server/relay";
import { preflight } from "@/lib/server/discovery";

export { preflight as OPTIONS };

async function handle(request: Request): Promise<Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const grant = await open("access", token);
  if (!grant) {
    const metadata = `${originOf(request)}/.well-known/oauth-protected-resource`;
    return new Response(JSON.stringify({ error: "invalid_token", error_description: "Connect Leash again" }), {
      status: 401,
      headers: { ...CORS, "content-type": "application/json", "www-authenticate": `Bearer resource_metadata="${metadata}"` },
    });
  }
  const server = createLeashServer(grant.key, { relay: relayIntent, site: originOf(request) });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}

export { handle as GET, handle as POST, handle as DELETE };
