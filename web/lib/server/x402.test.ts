import { KeyPair } from "near-api-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { X402_VERSION, decodeHeader, encodeHeader, requirements, type PaymentPayload, type PaymentRequired, type Settlement } from "leash-near-mcp";
import { CONTRACT, USDC } from "@/lib/config";

vi.mock("./relay", () => ({
  RelayRefusal: class RelayRefusal extends Error {},
  relayIntent: vi.fn(),
}));

import { relayIntent } from "./relay";
import { Unavailable, paywall, sell, settle, supported, verify } from "./x402";

const pair = KeyPair.fromRandom("ed25519");
const key = pair.getPublicKey().toString();
const reqs = requirements("testnet", USDC.testnet, CONTRACT.testnet, "vendor.testnet", "10000");

function intentFor(over: Record<string, unknown> = {}): { intent: string; signature: string } {
  const body = { contract: CONTRACT.testnet, owner: "olien.testnet", key, action: "pay", to: "vendor.testnet", amount: "10000", memo: "x402 https://leash.test/api/paid/sample", payment_id: "p1", ...over };
  const intent = `${JSON.stringify(body).slice(0, -1)},"expires_at":${BigInt(Date.now() + 60_000) * 1_000_000n}}`;
  const { signature } = pair.sign(new TextEncoder().encode(`leash-intent:${intent}`));
  return { intent, signature: Buffer.from(signature).toString("base64") };
}

function payloadFor(payload = intentFor(), accepted = reqs): PaymentPayload {
  return { x402Version: X402_VERSION, accepted, payload };
}

/// The chain as the facilitator reads it: the key's policy and the contract's verdict.
function chainAnswers(verdict: { ok: boolean; reason?: string | null }) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    const method = JSON.parse(String(init?.body)).params.method_name as string;
    const answer = method === "get_policy" ? { token: USDC.testnet } : { ok: verdict.ok, reason: verdict.reason ?? null, can_request: !verdict.ok, remaining_today: "2000000", vault: "5000000" };
    return new Response(JSON.stringify({ result: { result: [...Buffer.from(JSON.stringify(answer))] } }));
  });
}

beforeEach(() => {
  process.env.SPONSOR_ACCOUNT_ID = "leash.testnet";
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(relayIntent).mockReset();
});

describe("supported", () => {
  it("names the Leash method on this network and the sponsor as signer", () => {
    expect(supported()).toMatchObject({ kinds: [{ x402Version: 2, scheme: "exact", network: "near:testnet", extra: { assetTransferMethod: "leash" } }], signers: { "near:testnet": ["leash.testnet"] } });
  });
});

describe("verify", () => {
  it("accepts a signed intent for exactly the requirements, within the limits", async () => {
    chainAnswers({ ok: true });
    await expect(verify({ x402Version: 2, paymentPayload: payloadFor(), paymentRequirements: reqs })).resolves.toEqual({ isValid: true, payer: "olien.testnet" });
  });
  it("says insufficient_funds, with the owner's reason, when the limits refuse it", async () => {
    chainAnswers({ ok: false, reason: "over per-payment cap" });
    await expect(verify({ x402Version: 2, paymentPayload: payloadFor(), paymentRequirements: reqs })).resolves.toMatchObject({ isValid: false, invalidReason: "insufficient_funds", invalidMessage: "over per-payment cap" });
  });
  it("refuses an intent for another recipient or amount than the requirements", async () => {
    chainAnswers({ ok: true });
    const other = await verify({ x402Version: 2, paymentPayload: payloadFor(intentFor({ to: "vend0r.testnet" })), paymentRequirements: reqs });
    expect(other).toMatchObject({ isValid: false, invalidReason: "invalid_payload" });
    const less = await verify({ x402Version: 2, paymentPayload: payloadFor(intentFor({ amount: "1" })), paymentRequirements: reqs });
    expect(less).toMatchObject({ isValid: false, invalidReason: "invalid_payload" });
  });
  it("refuses a signature by another key and a payload that accepted other terms", async () => {
    chainAnswers({ ok: true });
    const forged = intentFor();
    forged.signature = Buffer.from(KeyPair.fromRandom("ed25519").sign(new TextEncoder().encode(`leash-intent:${forged.intent}`)).signature).toString("base64");
    expect(await verify({ x402Version: 2, paymentPayload: payloadFor(forged), paymentRequirements: reqs })).toMatchObject({ isValid: false, invalidReason: "invalid_payload" });
    const cheaper = { ...reqs, amount: "1" };
    expect(await verify({ x402Version: 2, paymentPayload: payloadFor(intentFor(), cheaper), paymentRequirements: reqs })).toMatchObject({ isValid: false, invalidReason: "invalid_payment_requirements" });
  });
  it("refuses other networks, schemes, methods and versions by their codes", async () => {
    chainAnswers({ ok: true });
    expect(await verify({ x402Version: 1, paymentPayload: payloadFor(), paymentRequirements: reqs })).toMatchObject({ invalidReason: "invalid_x402_version" });
    expect(await verify({ x402Version: 2, paymentPayload: payloadFor(), paymentRequirements: { ...reqs, network: "near:mainnet" } })).toMatchObject({ invalidReason: "invalid_network" });
    expect(await verify({ x402Version: 2, paymentPayload: payloadFor(), paymentRequirements: { ...reqs, scheme: "upto" } })).toMatchObject({ invalidReason: "unsupported_scheme" });
    expect(await verify({ x402Version: 2, paymentPayload: payloadFor(), paymentRequirements: { ...reqs, extra: {} } })).toMatchObject({ invalidReason: "unsupported_scheme" });
  });
});

describe("settle", () => {
  it("delivers the intent through the relay and answers with the transaction", async () => {
    chainAnswers({ ok: true });
    vi.mocked(relayIntent).mockResolvedValue({ result: { accepted: true, reason: null, remaining_today: "1990000" }, tx: "8xTx" });
    const out = await settle({ x402Version: 2, paymentPayload: payloadFor(), paymentRequirements: reqs });
    expect(out).toEqual({ success: true, payer: "olien.testnet", transaction: "8xTx", network: "near:testnet", amount: "10000" });
    expect(vi.mocked(relayIntent).mock.calls[0][0]).toBe("pay_signed");
  });
  it("reports a refusal by the limits without a transaction", async () => {
    chainAnswers({ ok: true });
    vi.mocked(relayIntent).mockResolvedValue({ result: { accepted: false, reason: "over daily cap", remaining_today: "0" }, tx: "8xTx" });
    const out = await settle({ x402Version: 2, paymentPayload: payloadFor(), paymentRequirements: reqs });
    expect(out).toMatchObject({ success: false, errorReason: "insufficient_funds", errorMessage: "over daily cap", transaction: "" });
  });
  it("never reaches the relay with a payload it would not verify", async () => {
    chainAnswers({ ok: true });
    const out = await settle({ x402Version: 2, paymentPayload: payloadFor(intentFor({ action: "request" })), paymentRequirements: reqs });
    expect(out).toMatchObject({ success: false, errorReason: "invalid_payload" });
    expect(relayIntent).not.toHaveBeenCalled();
  });
});

describe("paywall", () => {
  const terms = { amount: "10000", description: "A sample paid resource" };
  it("demands payment with the terms in the PAYMENT-REQUIRED header", async () => {
    const out = await paywall(new Request("https://leash.test/api/paid/sample"), terms);
    if (!("response" in out)) throw new Error("expected a 402");
    expect(out.response.status).toBe(402);
    const required = decodeHeader<PaymentRequired>(out.response.headers.get("payment-required"));
    expect(required).toMatchObject({ x402Version: 2, resource: { url: "https://leash.test/api/paid/sample" }, accepts: [{ network: "near:testnet", amount: "10000", payTo: "leash.testnet", extra: { assetTransferMethod: "leash", paymentFlow: "upfront" } }] });
    expect(out.response.headers.get("access-control-expose-headers")).toContain("payment-required");
  });
  it("settles first and hands the route the settlement header", async () => {
    chainAnswers({ ok: true });
    vi.mocked(relayIntent).mockResolvedValue({ result: { accepted: true, reason: null, remaining_today: "1990000" }, tx: "8xTx" });
    const accepted = { ...requirements("testnet", USDC.testnet, CONTRACT.testnet, "leash.testnet", "10000"), extra: { assetTransferMethod: "leash", contract: CONTRACT.testnet, paymentFlow: "upfront" } };
    const payload = payloadFor(intentFor({ to: "leash.testnet" }), accepted);
    const out = await paywall(new Request("https://leash.test/api/paid/sample", { headers: { "payment-signature": encodeHeader(payload) } }), terms);
    if ("response" in out) throw new Error(`expected a settlement, got ${out.response.status}: ${await out.response.text()}`);
    expect(out.settled.success).toBe(true);
    expect(decodeHeader<Settlement>(out.headers["payment-response"])).toMatchObject({ success: true, transaction: "8xTx" });
  });
  it("answers 402 again when the limits refuse the payment", async () => {
    chainAnswers({ ok: true });
    vi.mocked(relayIntent).mockResolvedValue({ result: { accepted: false, reason: "recipient not in allowlist", remaining_today: "0" } });
    const accepted = { ...requirements("testnet", USDC.testnet, CONTRACT.testnet, "leash.testnet", "10000"), extra: { assetTransferMethod: "leash", contract: CONTRACT.testnet, paymentFlow: "upfront" } };
    const out = await paywall(new Request("https://leash.test/api/paid/sample", { headers: { "payment-signature": encodeHeader(payloadFor(intentFor({ to: "leash.testnet" }), accepted)) } }), terms);
    if (!("response" in out)) throw new Error("expected a 402");
    expect(out.response.status).toBe(402);
    expect(decodeHeader<Settlement>(out.response.headers.get("payment-response"))).toMatchObject({ success: false, errorReason: "insufficient_funds" });
  });
});

describe("sell", () => {
  const terms = { amount: "10000", description: "a test lookup", payTo: "vendor.testnet" };
  const paidRequest = (payload: PaymentPayload) => new Request("https://leash.test/api/paid/search?q=near", { headers: { "payment-signature": encodeHeader(payload) } });

  it("answers an unpaid request with the 402 and does no work", async () => {
    const work = vi.fn(async () => ({ ok: true }));
    const res = await sell(new Request("https://leash.test/api/paid/search?q=near"), terms, work);
    expect(res.status).toBe(402);
    expect(decodeHeader<PaymentRequired>(res.headers.get("payment-required")!)?.accepts[0].payTo).toBe("vendor.testnet");
    expect(work).not.toHaveBeenCalled();
  });
  it("does no work for a forged payment", async () => {
    chainAnswers({ ok: true });
    const forged = intentFor();
    forged.signature = Buffer.from(KeyPair.fromRandom("ed25519").sign(new TextEncoder().encode(`leash-intent:${forged.intent}`)).signature).toString("base64");
    const work = vi.fn(async () => ({ ok: true }));
    expect((await sell(paidRequest(payloadFor(forged)), terms, work)).status).toBe(402);
    expect(work).not.toHaveBeenCalled();
    expect(relayIntent).not.toHaveBeenCalled();
  });
  it("charges nothing when the work fails", async () => {
    chainAnswers({ ok: true });
    const res = await sell(paidRequest(payloadFor()), terms, async () => { throw new Unavailable("Wikipedia did not answer"); });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Wikipedia did not answer; nothing was charged" });
    expect(relayIntent).not.toHaveBeenCalled();
  });
  it("settles after the work answered, and returns the answer with the payment", async () => {
    chainAnswers({ ok: true });
    const order: string[] = [];
    vi.mocked(relayIntent).mockImplementation(async () => { order.push("settle"); return { result: { accepted: true, reason: null, remaining_today: "1990000" }, tx: "TX1" }; });
    const res = await sell(paidRequest(payloadFor()), terms, async () => { order.push("work"); return { results: ["NEAR"] }; });
    expect(res.status).toBe(200);
    expect(order).toEqual(["work", "settle"]);
    expect(await res.json()).toMatchObject({ results: ["NEAR"], paid: { usdc: "0.01", payer: "olien.testnet", transaction: "https://testnet.nearblocks.io/txns/TX1" } });
    expect(decodeHeader<Settlement>(res.headers.get("payment-response")!)?.success).toBe(true);
  });
});

