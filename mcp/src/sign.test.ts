import { test } from "node:test";
import assert from "node:assert/strict";
import { KeyPair } from "near-api-js";
import { Leash } from "./leash.js";

const pair = KeyPair.fromRandom("ed25519");
const leash = new Leash({ owner: "olien.testnet", public_key: pair.getPublicKey().toString(), private_key: pair.toString(), contract: "leash.frankolien.testnet", network: "testnet" });

test("an intent is the exact JSON the contract parses, with nanoseconds intact", () => {
  const { intent } = leash.sign("pay", { to: "vendor.testnet", amount: "1000000", payment_id: "inv-1", memo: null });
  const raw = /"expires_at":(\d+)}$/.exec(intent);
  assert.ok(raw, "expires_at is a bare integer at the end");
  assert.ok(BigInt(raw[1]) > BigInt(Date.now()) * 1_000_000n, "it is in the future, in nanoseconds");
  const parsed = JSON.parse(intent);
  assert.equal(parsed.contract, "leash.frankolien.testnet");
  assert.equal(parsed.action, "pay");
  assert.equal("memo" in parsed, false, "absent fields are left out, not sent as null");
});

test("the signature is the agent key's, over the prefixed text", () => {
  const { intent, signature } = leash.sign("pay", { to: "vendor.testnet", amount: "1", payment_id: "x" });
  const message = new TextEncoder().encode(`leash-intent:${intent}`);
  assert.ok(pair.verify(message, Buffer.from(signature, "base64")));
  assert.ok(!pair.verify(new TextEncoder().encode(intent), Buffer.from(signature, "base64")), "without the prefix it means nothing");
});
