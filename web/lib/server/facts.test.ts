import { KeyPair } from "near-api-js";
import { beforeAll, describe, expect, it } from "vitest";
import { factsPublicKey, sign } from "./facts";

const pair = KeyPair.fromRandom("ed25519");

beforeAll(() => {
  process.env.SPONSOR_PRIVATE_KEY = pair.toString();
});

describe("signed facts", () => {
  it("writes the exact text the contract parses and signs it over the leash-facts prefix", () => {
    const f = sign("vendor.testnet", { created_at: 1_700_000_000_000_000_000n, code_changed_at: 0n, tx_count: 42n }, "testnet", 1_730_000_000_000);
    expect(f.text).toBe('{"contract":"leash.frankolien.testnet","to":"vendor.testnet","created_at":1700000000000000000,"code_changed_at":0,"tx_count":42,"observed_at":1730000000000000000}');
    expect(factsPublicKey()).toBe(pair.getPublicKey().toString());
    const ok = pair.getPublicKey().verify(new TextEncoder().encode(`leash-facts:${f.text}`), Buffer.from(f.signature, "base64"));
    expect(ok).toBe(true);
    expect(pair.getPublicKey().verify(new TextEncoder().encode(f.text), Buffer.from(f.signature, "base64"))).toBe(false);
  });
});
