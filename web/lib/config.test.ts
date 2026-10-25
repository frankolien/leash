import { describe, expect, it } from "vitest";
import { KeyPair } from "near-api-js";
import { CONTRACT, isImplicit, networkOf, shortAccount } from "./config";
import { publicKeyOfImplicit } from "./privySigner";

describe("accounts", () => {
  it("tells implicit accounts from named ones and finds their network", () => {
    const implicit = "a".repeat(64);
    expect(isImplicit(implicit)).toBe(true);
    expect(isImplicit("maya.near")).toBe(false);
    expect(networkOf("maya.near")).toBe("mainnet");
    expect(networkOf("maya.testnet")).toBe("testnet");
    expect(networkOf(implicit)).toBe("testnet");
    expect(shortAccount(implicit)).toBe("aaaaaa…aaaa");
  });
  it("reads every owner from one shared contract per network", () => {
    expect(CONTRACT.testnet).toBe("leash.frankolien.testnet");
  });
  it("recovers an embedded wallet's public key from its implicit account", () => {
    const pair = KeyPair.fromRandom("ed25519");
    const implicit = Buffer.from(pair.getPublicKey().data).toString("hex");
    expect(publicKeyOfImplicit(implicit).toString()).toBe(pair.getPublicKey().toString());
  });
});
