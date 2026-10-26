import { describe, expect, it } from "vitest";
import { fullName, nameProblem, suggestName } from "./names";

describe("nameProblem", () => {
  it("accepts plain names", () => {
    for (const ok of ["frank", "frank-o", "f_1", "ab", "a".repeat(32)]) expect(nameProblem(ok)).toBeNull();
  });

  it("explains what is wrong", () => {
    expect(nameProblem("f")).toBe("At least 2 characters.");
    expect(nameProblem("a".repeat(33))).toBe("At most 32 characters.");
    expect(nameProblem("Frank")).toBe("Only lowercase letters, numbers, - and _.");
    expect(nameProblem("frank.near")).toBe("Only lowercase letters, numbers, - and _.");
    expect(nameProblem("-frank")).toMatch(/^Start and end/);
    expect(nameProblem("fr--ank")).toMatch(/^Start and end/);
  });
});

describe("suggestName", () => {
  it("cleans an email's local part", () => {
    expect(suggestName("Frank.Olien+leash@gmail.com")).toBe("frank-olien-leash");
    expect(suggestName("gkenny896@gmail.com")).toBe("gkenny896");
  });

  it("gives nothing it cannot make valid", () => {
    expect(suggestName("x@y.z")).toBe("");
    expect(suggestName(undefined)).toBe("");
  });
});

it("puts the registrar on the end", () => {
  expect(fullName("frank", "testnet")).toBe("frank.testnet");
  expect(fullName("frank", "mainnet")).toBe("frank.near");
});
