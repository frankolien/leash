import { beforeEach, describe, expect, it } from "vitest";
import { rememberReturn, takeReturn } from "./returnTo";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  globalThis.sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } as Storage;
});

describe("returning after an OAuth sign-in", () => {
  it("hands back the page that started it, once", () => {
    rememberReturn("/link?key=ed25519:abc&callback=leash://linked");
    expect(takeReturn()).toBe("/link?key=ed25519:abc&callback=leash://linked");
    expect(takeReturn()).toBeNull();
  });

  it("ignores other sites, /app itself and stale sign-ins", () => {
    rememberReturn("//evil.example/x");
    expect(takeReturn()).toBeNull();
    rememberReturn("/app");
    expect(takeReturn()).toBeNull();
    rememberReturn("/connect?client_id=1");
    expect(takeReturn(Date.now() + 11 * 60 * 1000)).toBeNull();
  });
});
