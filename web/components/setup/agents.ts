// The real steps to put Leash in each agent. Every agent runs the published MCP server through npx
// and gets its key inline as LEASH_KEY (the key file's JSON in base64), so setup is one line, or one
// click for Cursor, with no file to save and no path to get wrong.

export type Agent = "claude" | "codex" | "cursor";

export const MCP_PACKAGE = "leash-near-mcp";
/// Stands in for the key wherever a page shows the steps before an agent exists.
export const KEY_PLACEHOLDER = "<key from the dashboard>";

/// The key file as the agent receives it: its JSON in base64, which survives shell quoting and URLs.
export function inlineKey(keyFileJson: string): string {
  const bytes = new TextEncoder().encode(keyFileJson);
  return btoa(String.fromCharCode(...bytes));
}

export type Install = { where: string; code: string; link?: { href: string; label: string } };

export function mcpConfig(agent: Agent, key: string = KEY_PLACEHOLDER): Install {
  const server = { command: "npx", args: ["-y", MCP_PACKAGE], env: { LEASH_KEY: key } };
  if (agent === "claude") return { where: "In your terminal", code: `claude mcp add --scope user leash -e LEASH_KEY=${key} -- npx -y ${MCP_PACKAGE}` };
  if (agent === "codex") return { where: "In your terminal", code: `codex mcp add leash --env LEASH_KEY=${key} -- npx -y ${MCP_PACKAGE}` };
  const code = JSON.stringify({ mcpServers: { leash: server } }, null, 2);
  // Cursor's install link carries the server's config as base64 JSON; only a real key makes it useful.
  if (key === KEY_PLACEHOLDER) return { where: "In ~/.cursor/mcp.json", code };
  const config = btoa(JSON.stringify(server));
  return { where: "One click, or paste into ~/.cursor/mcp.json", code, link: { href: `cursor://anysphere.cursor-deeplink/mcp/install?name=leash&config=${encodeURIComponent(config)}`, label: "Add to Cursor" } };
}

export const AGENTS: Record<Agent, { label: string; key: string }> = {
  claude: { label: "Claude Code", key: "claude" },
  codex: { label: "Codex", key: "codex" },
  cursor: { label: "Cursor", key: "cursor" },
};

export type Step = { title: string; where: string; code?: string; link?: { href: string; label: string } };

/// The way in for most people: sign in, fund, create the agent in the dashboard, add it in one line.
export function steps(agent: Agent): Step[] {
  const a = AGENTS[agent];
  return [
    { title: "Sign in to Leash", where: "With Google, Apple, email or a NEAR wallet. Your account is made for you.", link: { href: "/app", label: "Sign in" } },
    { title: "Add money", where: "Send USDC on NEAR to your account, then move it into your vault from the dashboard." },
    { title: `Create ${a.label} as an agent`, where: `In the dashboard: New agent, ${a.label}, your limits. It gives you the key and the line below, filled in.` },
    { title: `Add Leash to ${a.label}`, ...mcpConfig(agent) },
    { title: "Ask it to pay", where: `In ${a.label}`, code: `"Pay vendor.near $1 for API credits."\n\nUnder its limit it pays. Above, it waits for you.` },
  ];
}

/// The same, from a terminal, for people who already run the NEAR CLI.
export function terminalSteps(agent: Agent): string {
  return `leash init --owner you.near\nleash deposit 10\nleash grant --name ${AGENTS[agent].key} --daily 3 --per-payment 2`;
}
