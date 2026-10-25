// Drives the MCP server the way an agent would, over stdio, against whatever LEASH_KEY_FILE points at.
// Usage: LEASH_KEY_FILE=~/.leash/claude.json node scripts/smoke.mjs [to] [usdc]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const to = process.argv[2] ?? "vendor.testnet";
const usdc = process.argv[3] ?? "1";

const transport = new StdioClientTransport({ command: "node", args: [join(here, "..", "dist", "index.js")], env: { ...process.env } });
const client = new Client({ name: "smoke", version: "0.0.1" });
await client.connect(transport);

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));

const calls = [
  ["leash_status", {}],
  ["leash_preflight", { to, usdc }],
  ["leash_preflight", { to: to.replace("o", "0"), usdc: "5" }],
  ["leash_pay", { to, usdc, memo: "smoke test" }],
];
for (const [name, args] of calls) {
  const result = await client.callTool({ name, arguments: args });
  console.log(`\n> ${name} ${JSON.stringify(args)}\n${result.content[0].text}`);
}
await client.close();
