// Leash as an x402 facilitator, and the paywall a resource server puts in front of a route.
//
// A resource server that charges per request answers 402 with what it accepts. One of those ways is
// a Leash payment: scheme "exact" on near:<network>, transfer method "leash", the payload being the
// agent's signed pay intent for exactly that recipient and amount. The server hands the payload to
// this facilitator, which checks it, delivers it to the Leash contract through the relay, and
// answers with the transaction. The contract applies the owner's limits, so a resource server never
// needs to know who the agent is, and the owner's log shows the URL the agent paid for.

import { PublicKey } from "near-api-js";
import { X402_METHOD, X402_NETWORK, X402_VERSION, decodeHeader, encodeHeader, requirements, type PaymentPayload, type PaymentRequired, type Requirements, type Settlement } from "leash-near-mcp";
import { CONTRACT, DEFAULT_NETWORK, RPC, USDC } from "@/lib/config";
import { RelayRefusal, relayIntent } from "./relay";

export type FacilitatorBody = { x402Version?: number; paymentPayload?: PaymentPayload; paymentRequirements?: Requirements };
export type Verdict = { isValid: true; payer: string } | { isValid: false; invalidReason: string; invalidMessage?: string; payer?: string };

type Intent = { contract?: string; owner?: string; key?: string; action?: string; to?: string; amount?: string; payment_id?: string; expires_at?: number };
type Preflight = { ok: boolean; reason: string | null; can_request: boolean; remaining_today: string; vault: string };
type PayOutcome = { accepted: boolean; reason: string | null; remaining_today: string };

const NETWORK = X402_NETWORK[DEFAULT_NETWORK];

/// A payload that cannot be settled, with the protocol's code for why and a sentence for people.
class Invalid extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export function supported() {
  const sponsor = process.env.SPONSOR_ACCOUNT_ID;
  return {
    kinds: [{ x402Version: X402_VERSION, scheme: "exact", network: NETWORK, extra: { assetTransferMethod: X402_METHOD, contract: CONTRACT[DEFAULT_NETWORK] } }],
    extensions: [],
    signers: { [NETWORK]: sponsor ? [sponsor] : [] },
  };
}

async function view<T>(method: string, args: Record<string, unknown>): Promise<T | undefined> {
  const res = await fetch(RPC[DEFAULT_NETWORK], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "leash", method: "query", params: { request_type: "call_function", finality: "optimistic", account_id: CONTRACT[DEFAULT_NETWORK], method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") } }),
  });
  const body = (await res.json()) as { result?: { result?: number[] } };
  if (!body.result?.result) return undefined;
  return JSON.parse(Buffer.from(body.result.result).toString("utf8")) as T;
}

/// The intent inside the payload, once the payload is shown to be a Leash pay for exactly these
/// requirements, signed by the key it names and still fresh. Reads the chain only for the token the
/// key pays in.
async function checked(body: FacilitatorBody): Promise<{ intent: Required<Pick<Intent, "owner" | "key" | "to" | "amount">>; payload: { intent: string; signature: string } }> {
  if (body.x402Version !== X402_VERSION) throw new Invalid("invalid_x402_version", `x402 version ${body.x402Version ?? "missing"}; this facilitator speaks ${X402_VERSION}`);
  const req = body.paymentRequirements;
  const pp = body.paymentPayload;
  if (!req || !pp || typeof pp !== "object") throw new Invalid("invalid_payload", "send paymentPayload and paymentRequirements");
  if (req.scheme !== "exact") throw new Invalid("unsupported_scheme", `scheme ${req.scheme}; only exact`);
  if (req.network !== NETWORK) throw new Invalid("invalid_network", `network ${req.network}; this facilitator settles on ${NETWORK}`);
  if (req.extra?.assetTransferMethod !== X402_METHOD) throw new Invalid("unsupported_scheme", `transfer method ${String(req.extra?.assetTransferMethod ?? "none")}; this facilitator settles the ${X402_METHOD} method`);
  if (!/^\d+$/.test(req.amount) || !req.payTo || !req.asset) throw new Invalid("invalid_payment_requirements", "amount, asset and payTo are required");
  const a = pp.accepted;
  if (!a || a.scheme !== req.scheme || a.network !== req.network || a.amount !== req.amount || a.asset !== req.asset || a.payTo !== req.payTo || a.extra?.assetTransferMethod !== X402_METHOD) {
    throw new Invalid("invalid_payment_requirements", "the payload accepted other terms than these requirements");
  }
  const payload = pp.payload;
  if (typeof payload?.intent !== "string" || typeof payload.signature !== "string") throw new Invalid("invalid_payload", "the payload needs intent and signature");
  let intent: Intent;
  try {
    intent = JSON.parse(payload.intent) as Intent;
  } catch {
    throw new Invalid("invalid_payload", "the intent is not JSON");
  }
  if (intent.contract !== CONTRACT[DEFAULT_NETWORK]) throw new Invalid("invalid_payload", "the intent is for another contract");
  if (intent.action !== "pay") throw new Invalid("invalid_payload", "the intent is not a payment");
  if (!intent.owner || !intent.key || !intent.payment_id) throw new Invalid("invalid_payload", "the intent names no owner, key or payment id");
  if (intent.to !== req.payTo) throw new Invalid("invalid_payload", `the intent pays ${intent.to}, not ${req.payTo}`);
  if (intent.amount !== req.amount) throw new Invalid("invalid_payload", `the intent pays ${intent.amount} units, not ${req.amount}`);
  if (typeof intent.expires_at !== "number" || intent.expires_at <= Date.now() * 1e6) throw new Invalid("invalid_payload", "the intent has expired");
  let ok = false;
  try {
    ok = PublicKey.fromString(intent.key).verify(new TextEncoder().encode(`leash-intent:${payload.intent}`), Buffer.from(payload.signature, "base64"));
  } catch {
    ok = false;
  }
  if (!ok) throw new Invalid("invalid_payload", "the signature does not match the key");
  // The token the key pays in; a task's child key has no policy of its own and pays in USDC.
  const policy = await view<{ token: string } | null>("get_policy", { owner: intent.owner, public_key: intent.key });
  const token = policy?.token ?? USDC[DEFAULT_NETWORK];
  if (token !== req.asset) throw new Invalid("invalid_payment_requirements", `this key pays in ${token}, not ${req.asset}`);
  return { intent: { owner: intent.owner, key: intent.key, to: intent.to, amount: intent.amount }, payload };
}

/// Whether the payload would settle: well formed, signed, and within the owner's limits right now.
/// Writes nothing.
export async function verify(body: FacilitatorBody): Promise<Verdict> {
  try {
    const { intent } = await checked(body);
    const verdict = await view<Preflight>("check", { owner: intent.owner, public_key: intent.key, to: intent.to, amount: intent.amount });
    if (!verdict) return { isValid: false, invalidReason: "unexpected_verify_error", invalidMessage: "the contract did not answer", payer: intent.owner };
    if (!verdict.ok) return { isValid: false, invalidReason: "insufficient_funds", invalidMessage: verdict.reason ?? "refused by the owner's limits", payer: intent.owner };
    return { isValid: true, payer: intent.owner };
  } catch (error) {
    if (error instanceof Invalid) return { isValid: false, invalidReason: error.code, invalidMessage: error.message };
    throw error;
  }
}

/// Delivers the payment to the contract. The contract applies the limits and never pays one
/// payment id twice, so a repeated settle moves nothing more.
export async function settle(body: FacilitatorBody): Promise<Settlement & { errorMessage?: string }> {
  let payer: string | undefined;
  try {
    const { intent, payload } = await checked(body);
    payer = intent.owner;
    const { result, tx } = await relayIntent("pay_signed", payload);
    const outcome = result as PayOutcome | undefined;
    if (!outcome?.accepted) return { success: false, errorReason: "insufficient_funds", errorMessage: outcome?.reason ?? "refused by the owner's limits", payer, transaction: "", network: NETWORK };
    return { success: true, payer, transaction: tx ?? "", network: NETWORK, amount: intent.amount };
  } catch (error) {
    if (error instanceof Invalid) return { success: false, errorReason: error.code, errorMessage: error.message, payer, transaction: "", network: NETWORK };
    if (error instanceof RelayRefusal) return { success: false, errorReason: "invalid_payload", errorMessage: error.message, payer, transaction: "", network: NETWORK };
    return { success: false, errorReason: "unexpected_settle_error", errorMessage: error instanceof Error ? error.message : String(error), payer, transaction: "", network: NETWORK };
  }
}

/// Headers a paid route answers with, so a browser-side client can read the protocol's headers.
export const PAID_CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, payment-signature",
  "access-control-expose-headers": "payment-required, payment-response",
};

export type Terms = {
  /// The price in the token's units, like "10000" for one cent of USDC.
  amount: string;
  description: string;
  /// The account paid; the sponsor account unless X402_PAY_TO names another.
  payTo?: string;
};

/// The paywall in front of a route. Without a payment it answers 402 naming the terms; with one it
/// settles first and then lets the route serve, so the resource is never given away. The money moves
/// before the content, which the protocol calls the upfront flow.
export async function paywall(request: Request, terms: Terms): Promise<{ settled: Settlement; headers: Record<string, string> } | { response: Response }> {
  const payTo = terms.payTo ?? process.env.X402_PAY_TO ?? process.env.SPONSOR_ACCOUNT_ID;
  if (!payTo) return { response: Response.json({ error: "this resource has nowhere to be paid" }, { status: 500, headers: PAID_CORS }) };
  const url = new URL(request.url);
  const accepts = requirements(DEFAULT_NETWORK, USDC[DEFAULT_NETWORK], CONTRACT[DEFAULT_NETWORK], payTo, terms.amount);
  accepts.extra = { ...accepts.extra, paymentFlow: "upfront" };
  const required: PaymentRequired = {
    x402Version: X402_VERSION,
    resource: { url: `${url.origin}${url.pathname}`, description: terms.description, mimeType: "application/json", serviceName: "Leash" },
    accepts: [accepts],
  };
  const demand = (error: string, status = 402) =>
    Response.json({ error, ...required }, { status, headers: { ...PAID_CORS, "payment-required": encodeHeader({ ...required, error }) } });
  const header = request.headers.get("payment-signature");
  if (!header) return { response: demand("Payment required") };
  const payload = decodeHeader<PaymentPayload>(header);
  if (!payload) return { response: demand("the PAYMENT-SIGNATURE header is not base64 JSON") };
  const settled = await facilitate("settle", { x402Version: X402_VERSION, paymentPayload: payload, paymentRequirements: accepts });
  const headers = { ...PAID_CORS, "payment-response": encodeHeader(settled) };
  if (!settled.success) return { response: Response.json({ error: settled.errorMessage ?? settled.errorReason ?? "payment failed", ...required }, { status: 402, headers: { ...headers, "payment-required": encodeHeader({ ...required, error: settled.errorMessage ?? settled.errorReason }) } }) };
  return { settled, headers };
}

/// The facilitator this server trusts: its own by default, over HTTP like any other so another
/// resource server can point X402_FACILITATOR_URL here and use the same code.
async function facilitate(route: "settle", body: FacilitatorBody): Promise<Settlement & { errorMessage?: string }> {
  const base = process.env.X402_FACILITATOR_URL;
  if (!base) return settle(body);
  const res = await fetch(`${base.replace(/\/$/, "")}/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return (await res.json()) as Settlement & { errorMessage?: string };
}
