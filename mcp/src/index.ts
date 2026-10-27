#!/usr/bin/env node
// leash-near-mcp: the tools an agent uses to pay from a Leash-bounded account.
//
// The server holds the agent's key and nothing else. That key is a function-call key on the owner's
// account restricted to the Leash contract, so even a compromised server can only do what the owner's
// policy allows, and only until the owner revokes the key.
//
// Every tool answers in one envelope: { status, ... } where status is one of
// "ok", "accepted", "refused", "parked", "proposed", "error". An agent never has to guess the shape.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadKey } from "./key.js";
import { createLeashServer } from "./server.js";

async function main() {
  await createLeashServer(loadKey()).connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
