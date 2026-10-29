import { KeyPair } from "near-api-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Policy } from "@/lib/types";
import { explain, verifiedClaim } from "./alerts";

const policy = { per_payment_cap: "2000000", daily_cap: "3000000" } as Policy;

describe("explain", () => {
  it("names the limit the payment crossed", () => {
    expect(explain("over per-payment cap", policy)).toBe("Over its $2 per-payment limit");
    expect(explain("over daily cap", policy)).toBe("Over its $3 daily limit");
    expect(explain("recipient not in allowlist", policy)).toBe("Not someone it may pay on its own");
  });
  it("passes an unknown reason through, capitalised", () => {
    expect(explain("key expired", undefined)).toBe("Key expired");
  });
});

describe("verifiedClaim", () => {
  const pair = KeyPair.fromRandom("ed25519");
  const key = pair.getPublicKey().toString();
  const claim = (over: Record<string, unknown> = {}) =>
    JSON.stringify({ owner: "olien.testnet", network: "testnet", key, token: "ab".repeat(32), environment: "sandbox", device: "iPhone", expires_at: Date.now() + 60_000, ...over });
  const sign = (text: string) => Buffer.from(pair.sign(new TextEncoder().encode(`leash-phone:${text}`)).signature).toString("base64");
  const rpcAnswers = (receiver: string | null) =>
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ result: receiver ? { permission: { FunctionCall: { receiver_id: receiver } } } : { error: "no key" } })));

  afterEach(() => vi.restoreAllMocks());

  it("accepts a claim signed by a Leash key on the owner's account", async () => {
    rpcAnswers("leash.frankolien.testnet");
    const text = claim();
    await expect(verifiedClaim(text, sign(text))).resolves.toMatchObject({ owner: "olien.testnet", token: "ab".repeat(32), environment: "sandbox" });
  });
  it("refuses a signature by another key", async () => {
    rpcAnswers("leash.frankolien.testnet");
    const text = claim();
    const other = KeyPair.fromRandom("ed25519");
    const bad = Buffer.from(other.sign(new TextEncoder().encode(`leash-phone:${text}`)).signature).toString("base64");
    await expect(verifiedClaim(text, bad)).rejects.toThrow("signature");
  });
  it("refuses a key that is not on the account, or not limited to Leash", async () => {
    rpcAnswers(null);
    const text = claim();
    await expect(verifiedClaim(text, sign(text))).rejects.toThrow("not a Leash key");
    rpcAnswers("usdc.fakes.testnet");
    await expect(verifiedClaim(text, sign(text))).rejects.toThrow("not a Leash key");
  });
  it("refuses a stale claim and a malformed token", async () => {
    rpcAnswers("leash.frankolien.testnet");
    const stale = claim({ expires_at: Date.now() - 1 });
    await expect(verifiedClaim(stale, sign(stale))).rejects.toThrow("expired");
    const odd = claim({ token: "not-hex" });
    await expect(verifiedClaim(odd, sign(odd))).rejects.toThrow("hex");
  });
});
