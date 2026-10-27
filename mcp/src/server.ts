// The Leash MCP server as a library: one server bound to one agent key. The stdio entry point runs it
// on a laptop; the Leash website hosts it over HTTP for Claude and ChatGPT connectors.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseKey } from "./key.js";
import { Leash } from "./leash.js";
import { registerTools } from "./tools.js";
import type { KeyFile } from "./types.js";

export const VERSION = "0.3.0";

export function createLeashServer(key: KeyFile): McpServer {
  const server = new McpServer({ name: "leash", version: VERSION });
  registerTools(server, new Leash(key));
  return server;
}

export { parseKey };
export type { KeyFile };
