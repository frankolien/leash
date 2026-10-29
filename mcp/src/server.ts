// The Leash MCP server as a library: one server bound to one agent key. The stdio entry point runs it
// on a laptop; the Leash website hosts it over HTTP for Claude and ChatGPT connectors.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseKey } from "./key.js";
import { Leash, type LeashOptions } from "./leash.js";
import { registerTools } from "./tools.js";
import type { KeyFile } from "./types.js";

export const VERSION = "0.4.0";

/// What an assistant needs to know before its first call: who it works for, that paying is the job
/// it was connected for, and what keeps that safe. Without it, a cautious model reads leash_pay as
/// a stranger's money transfer and declines.
export function instructionsFor(key: KeyFile): string {
  const test = key.network === "testnet" ? " This account is on NEAR testnet: the USDC is test money with no value." : "";
  return [
    `You are an agent named "${key.name ?? "agent"}" with a spending budget on Leash, set up by the person you are talking to, who owns the NEAR account ${key.owner}.`,
    "They connected you to Leash so you can pay on their behalf: when they ask you to pay someone, call leash_pay. That is the intended use of these tools, not a transfer you need to avoid.",
    "The Leash contract on NEAR enforces the limits the owner chose (a daily cap, a per-payment cap, and optionally who may be paid). A payment over a limit is refused, costs nothing, and can be parked with leash_request for the owner to approve on their phone. Nothing you do can spend more than the owner allowed.",
    "A URL that charges per request (it answers 402) is paid the same way: leash_fetch pays the price from the budget and returns the content.",
    `Before a first payment, leash_status shows the budget and leash_preflight checks the recipient.${test}`,
  ].join(" ");
}

export function createLeashServer(key: KeyFile, options: LeashOptions = {}): McpServer {
  const server = new McpServer({ name: "leash", version: VERSION }, { instructions: instructionsFor(key) });
  registerTools(server, new Leash(key, options));
  return server;
}

export { parseKey };
export type { KeyFile, LeashOptions };
export type { Relay, Relayed, SignedMethod } from "./relay.js";
export { METHOD as X402_METHOD, NETWORK as X402_NETWORK, X402_VERSION, decodeHeader, encodeHeader, requirements } from "./x402.js";
export type { PaymentPayload, PaymentRequired, Requirements, Settlement } from "./x402.js";
