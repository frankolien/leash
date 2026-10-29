import { test } from "node:test";
import assert from "node:assert/strict";
import { choose, decodeHeader, encodeHeader, paymentPayload, requirements, type PaymentRequired } from "./x402.js";

const USDC = "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af";
const leash = requirements("testnet", USDC, "leash.frankolien.testnet", "vendor.testnet", "10000");
const base = { scheme: "exact", network: "eip155:84532", amount: "10000", asset: "0x036C", payTo: "0x2096", maxTimeoutSeconds: 60 };
const nearFull = { scheme: "exact", network: "near:testnet", amount: "10000", asset: USDC, payTo: "vendor.testnet", maxTimeoutSeconds: 60 };
const required = (accepts: PaymentRequired["accepts"]): PaymentRequired => ({ x402Version: 2, resource: { url: "https://api.example.com/data" }, accepts });

test("headers round-trip as base64 JSON", () => {
  const header = encodeHeader(required([leash]));
  assert.equal(decodeHeader<PaymentRequired>(header)?.accepts[0].payTo, "vendor.testnet");
  assert.equal(decodeHeader("not base64 json"), undefined);
  assert.equal(decodeHeader(null), undefined);
});

test("picks the Leash way of paying, the cheapest when there are several", () => {
  const dearer = { ...leash, amount: "20000" };
  const chosen = choose(required([base, dearer, leash]), "testnet", USDC);
  assert.deepEqual(chosen, { accepted: leash });
});

test("says why it cannot pay a server that only takes other networks", () => {
  const chosen = choose(required([base]), "testnet", USDC);
  assert.match("refusal" in chosen ? chosen.refusal : "", /eip155:84532, not on near:testnet/);
});

test("says a NEAR server that wants a full-access key is out of reach for a Leash key", () => {
  const chosen = choose(required([nearFull]), "testnet", USDC);
  assert.match("refusal" in chosen ? chosen.refusal : "", /full-access key/);
});

test("refuses another token, another network and another version", () => {
  assert.ok("refusal" in choose(required([{ ...leash, asset: "usdt.testnet" }]), "testnet", USDC));
  assert.ok("refusal" in choose(required([leash]), "mainnet", USDC));
  assert.ok("refusal" in choose({ ...required([leash]), x402Version: 1 }, "testnet", USDC));
});

test("the payload echoes the accepted terms and carries the signed intent", () => {
  const p = paymentPayload(required([leash]), leash, { intent: "{}", signature: "sig" });
  assert.equal(p.x402Version, 2);
  assert.equal(p.accepted.payTo, "vendor.testnet");
  assert.equal(p.resource?.url, "https://api.example.com/data");
  assert.equal(p.payload.signature, "sig");
});
