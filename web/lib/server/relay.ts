// Delivers instructions agents signed, paying their gas from the sponsor account, so no agent ever
// holds NEAR. The contract checks each signature and payment id, so this server can neither forge
// nor repeat a payment; it only refuses obvious junk early and brakes how much gas one owner burns.

import type { Relayed, SignedMethod } from "leash-near-mcp";
import { CONTRACT, DEFAULT_NETWORK } from "@/lib/config";
import { sponsorAccount } from "./sponsor";

const METHODS: SignedMethod[] = ["pay_signed", "request_signed", "ask_more_signed"];
const GAS = BigInt(100) * BigInt(10) ** BigInt(12);
// Per owner per hour on one instance; enough for a busy agent, too few to drain the sponsor.
const OWNER_LIMIT = 120;
const recent = new Map<string, number[]>();

export class RelayRefusal extends Error {}

function braked(owner: string): boolean {
  const now = Date.now();
  const hits = (recent.get(owner) ?? []).filter((t) => now - t < 60 * 60_000);
  hits.push(now);
  recent.set(owner, hits);
  return hits.length > OWNER_LIMIT;
}

export async function relayIntent(method: SignedMethod, args: { intent: string; signature: string }): Promise<Relayed> {
  if (!METHODS.includes(method)) throw new RelayRefusal("unknown method");
  let parsed: { contract?: string; owner?: string; action?: string };
  try {
    parsed = JSON.parse(args.intent);
  } catch {
    throw new RelayRefusal("intent is not JSON");
  }
  if (parsed.contract !== CONTRACT[DEFAULT_NETWORK]) throw new RelayRefusal("intent is for another contract");
  if (`${parsed.action}_signed` !== method) throw new RelayRefusal("intent is for another action");
  if (!parsed.owner || braked(parsed.owner)) throw new RelayRefusal("too many instructions for this owner; try again later");
  const sponsor = sponsorAccount(DEFAULT_NETWORK);
  const { actions } = await import("near-api-js");
  const out = await sponsor.signAndSendTransaction({ receiverId: CONTRACT[DEFAULT_NETWORK], actions: [actions.functionCall(method, args, GAS, BigInt(0))] });
  const status = out.status as { SuccessValue?: string; Failure?: unknown };
  if (status.Failure) throw new RelayRefusal(failureText(status.Failure));
  const result = status.SuccessValue ? JSON.parse(Buffer.from(status.SuccessValue, "base64").toString("utf8")) : undefined;
  return { result, tx: out.transaction.hash };
}

/// The contract's panic message out of NEAR's nested failure object.
function failureText(failure: unknown): string {
  const text = JSON.stringify(failure);
  return /Smart contract panicked: ([^"\\]+)/.exec(text)?.[1] ?? "the contract refused the instruction";
}
