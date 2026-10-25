import { describe, expect, it } from "vitest";
import { AGENTS, mcpConfig } from "./agents";

describe("agent setup", () => {
  it("points each agent's MCP config at the key file it was given", () => {
    for (const agent of Object.keys(AGENTS) as (keyof typeof AGENTS)[]) {
      const { code } = mcpConfig(agent, "~/.leash/test-agent.json");
      expect(code).toContain("~/.leash/test-agent.json");
      expect(code).not.toMatch(/~\/\.leash\/(claude|codex|cursor)\.json/);
    }
  });
});
