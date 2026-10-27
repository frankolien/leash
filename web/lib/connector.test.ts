import { expect, it } from "vitest";
import { claudeInstallLink, connectorUrl } from "./connector";

it("points Claude's install link at this site's MCP endpoint", () => {
  const link = new URL(claudeInstallLink("https://leash.example"));
  expect(link.origin + link.pathname).toBe("https://claude.ai/customize/connectors");
  expect(link.searchParams.get("modal")).toBe("add-custom-connector");
  expect(link.searchParams.get("connectorName")).toBe("Leash");
  expect(link.searchParams.get("connectorUrl")).toBe(connectorUrl("https://leash.example"));
  expect(connectorUrl("https://leash.example")).toBe("https://leash.example/api/mcp");
});
