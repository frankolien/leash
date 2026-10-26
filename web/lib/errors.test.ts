import { describe, expect, it } from "vitest";
import { plainError } from "./errors";

describe("plainError", () => {
  it("names a USDC shortfall instead of the panic", () => {
    expect(plainError(new Error("Smart contract panicked: The account doesn't have enough balance"))).toBe("There isn't enough USDC in your account for that.");
  });

  it("keeps a Leash refusal, as a sentence", () => {
    expect(plainError(new Error('{"FunctionCallError":{"ExecutionError":"Smart contract panicked: over per-payment cap"}}'))).toBe("Over per-payment cap.");
  });

  it("says a wallet cancel moved nothing", () => {
    expect(plainError(new Error("User rejected the request"))).toBe("Cancelled. Nothing moved.");
  });

  it("explains running out of NEAR for fees", () => {
    expect(plainError(new Error("Sender frank.testnet does not have enough balance: NotEnoughBalance"))).toBe("Your account is out of NEAR for fees. Nothing moved.");
  });

  it("never shows a wall of JSON", () => {
    expect(plainError(new Error(`{"receipt":${"x".repeat(300)}}`))).toBe("That didn't go through, and nothing moved. Try again.");
  });

  it("passes short plain messages through", () => {
    expect(plainError("sign in first")).toBe("Sign in first.");
  });
});
