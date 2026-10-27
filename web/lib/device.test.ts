import { describe, expect, it } from "vitest";
import { callbackUrl, linkRequest, pairingCode } from "./device";

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
    if ("error" in ok) throw new Error();
    expect(callbackUrl(ok, { account: "olien.testnet" })).toBe("leash://linked?account=olien.testnet&network=testnet");
  });
});
