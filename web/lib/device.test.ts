import { describe, expect, it } from "vitest";
import { callbackUrl, linkRequest, pairingCode, phoneKeysOf } from "./device";

const KEY = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp";

describe("linking a phone", () => {
  it("derives the same short code for the same key", async () => {
    const code = await pairingCode(KEY);
    expect(code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    expect(await pairingCode(KEY)).toBe(code);
    expect(await pairingCode(KEY.replace("p", "q"))).not.toBe(code);
  });

  it("only hands the result back to the Leash app", () => {
    expect(linkRequest(new URLSearchParams({ key: KEY, callback: "https://evil.example/cb" }))).toHaveProperty("error");
    expect(linkRequest(new URLSearchParams({ key: "ed25519:short", callback: "leash://linked" }))).toHaveProperty("error");
    const ok = linkRequest(new URLSearchParams({ key: KEY, callback: "leash://linked", device: "Frank's iPhone" }));
    expect(ok).toMatchObject({ key: KEY, brake: null, device: "Frank's iPhone" });
    expect(linkRequest(new URLSearchParams({ key: KEY, brake: KEY, callback: "leash://linked" }))).toHaveProperty("error");
    expect(linkRequest(new URLSearchParams({ key: KEY, brake: "ed25519:9C6hybhQ6Aycep9jaUnP6uL9ZYvDjUp1aSkFWPUFJtpj", callback: "leash://linked" }))).toMatchObject({ brake: "ed25519:9C6hybhQ6Aycep9jaUnP6uL9ZYvDjUp1aSkFWPUFJtpj" });
    const owner = "ed25519:4u2ve5cUvnKLL8nKFmPeLz1pUu8hjeTmhjSxWsUnMyZS";
    expect(linkRequest(new URLSearchParams({ key: KEY, owner, callback: "leash://linked" }))).toMatchObject({ owner });
    expect(linkRequest(new URLSearchParams({ key: KEY, owner: KEY, callback: "leash://linked" }))).toHaveProperty("error");
    if ("error" in ok) throw new Error();
    expect(callbackUrl(ok, { account: "olien.testnet" })).toBe("leash://linked?account=olien.testnet&network=testnet");
  });

  it("finds a linked phone's two keys and nothing else", () => {
    const fc = (methods: string[], receiver = "leash.frankolien.testnet") => ({ FunctionCall: { allowance: null, receiver_id: receiver, method_names: methods } });
    const keys = [
      { public_key: "ed25519:full", access_key: { permission: "FullAccess" } },
      { public_key: "ed25519:agent", access_key: { permission: fc(["pay", "request", "ask_more"]) } },
      { public_key: "ed25519:phone", access_key: { permission: fc(["approve", "deny", "pause", "resume"]) } },
      { public_key: "ed25519:brake", access_key: { permission: fc(["deny", "pause"]) } },
      { public_key: "ed25519:other", access_key: { permission: fc(["approve"], "someone.testnet") } },
    ];
    expect(phoneKeysOf(keys, "leash.frankolien.testnet")).toEqual([{ key: "ed25519:phone", brake: false }, { key: "ed25519:brake", brake: true }]);
  });

  it("lists other full keys only for a sign-in that knows its own", () => {
    const keys = [
      { public_key: "ed25519:mine", access_key: { permission: "FullAccess" } },
      { public_key: "ed25519:phoneFull", access_key: { permission: "FullAccess" } },
    ];
    expect(phoneKeysOf(keys, "leash.frankolien.testnet", "ed25519:mine")).toEqual([{ key: "ed25519:phoneFull", brake: false, full: true }]);
    expect(phoneKeysOf(keys, "leash.frankolien.testnet")).toEqual([]);
  });
});
