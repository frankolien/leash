import { describe, expect, it } from "vitest";
import { AGENTS, KEY_PLACEHOLDER, MCP_PACKAGE, inlineKey, mcpConfig } from "./agents";

const keyFile = JSON.stringify({ owner: "olien.testnet", public_key: "ed25519:pub", private_key: "ed25519:secret", contract: "leash.frankolien.testnet", network: "testnet" });

describe("agent setup", () => {
  it("gives every agent the published server and its own key", () => {
    const key = inlineKey(keyFile);
    for (const agent of Object.keys(AGENTS) as (keyof typeof AGENTS)[]) {
      const { code } = mcpConfig(agent, key);
      expect(code).toContain(MCP_PACKAGE);
      expect(code).toContain(key);
      expect(code).not.toContain("/path/to");
    }
  });

  it("round-trips the key through base64", () => {
    expect(JSON.parse(atob(inlineKey(keyFile))).owner).toBe("olien.testnet");
  });

  it("builds a Cursor install link whose config decodes to the server", () => {
    const key = inlineKey(keyFile);
    const { link } = mcpConfig("cursor", key);
    const config = new URL(link!.href).searchParams.get("config")!;
    expect(JSON.parse(atob(config))).toEqual({ command: "npx", args: ["-y", MCP_PACKAGE], env: { LEASH_KEY: key } });
  });

  it("shows a placeholder and no install link before an agent exists", () => {
    expect(mcpConfig("cursor").link).toBeUndefined();
    expect(mcpConfig("claude").code).toContain(KEY_PLACEHOLDER);
  });
});
