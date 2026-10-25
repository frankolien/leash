// The real steps to put Leash in each agent. Paths are absolute because the MCP server reads
// LEASH_KEY_FILE as given.

export type Agent = "claude" | "codex" | "cursor";

/// Where an agent's MCP config goes, and the config itself for a given key file.
export function mcpConfig(agent: Agent, keyFile: string): { where: string; code: string } {
  const c = AGENTS[agent].config;
  return { where: c.where, code: c.code.replace(/~\/\.leash\/\w+\.json/, keyFile) };
}

export const AGENTS: Record<Agent, { label: string; key: string; config: { where: string; code: string } }> = {
  claude: {
    label: "Claude Code",
    key: "claude",
    config: {
      where: "In your terminal",
      code: "claude mcp add leash \\\n  -e LEASH_KEY_FILE=~/.leash/claude.json \\\n  -- node /path/to/leash/mcp/dist/index.js",
    },
  },
  codex: {
    label: "Codex",
    key: "codex",
    config: {
      where: "In ~/.codex/config.toml",
      code: '[mcp_servers.leash]\ncommand = "node"\nargs = ["/path/to/leash/mcp/dist/index.js"]\nenv = { LEASH_KEY_FILE = "~/.leash/codex.json" }',
    },
  },
  cursor: {
    label: "Cursor",
    key: "cursor",
    config: {
      where: "In ~/.cursor/mcp.json",
      code: '{\n  "mcpServers": {\n    "leash": {\n      "command": "node",\n      "args": ["/path/to/leash/mcp/dist/index.js"],\n      "env": { "LEASH_KEY_FILE": "~/.leash/cursor.json" }\n    }\n  }\n}',
    },
  },
};

export type Step = { title: string; where: string; code?: string; link?: { href: string; label: string } };

/// The way in for most people: sign in, fund, create the agent in the dashboard, paste the config.
export function steps(agent: Agent): Step[] {
  const a = AGENTS[agent];
  return [
    { title: "Sign in to Leash", where: "With Google, Apple, email or a NEAR wallet. Your account is made for you.", link: { href: "/app", label: "Sign in" } },
    { title: "Add money", where: "Send USDC on NEAR to your account, then move it into your vault from the dashboard." },
    { title: `Create ${a.label} as an agent`, where: `In the dashboard: New agent, ${a.label}, your limits. Save the key file to ~/.leash/${a.key}.json.` },
    { title: `Add Leash to ${a.label}`, ...mcpConfig(agent, `~/.leash/${a.key}.json`) },
    { title: "Ask it to pay", where: `In ${a.label}`, code: `"Pay vendor.near $1 for API credits."\n\nUnder its limit it pays. Above, it waits for you.` },
  ];
}

/// The same, from a terminal, for people who already run the NEAR CLI.
export function terminalSteps(agent: Agent): string {
  return `leash init --owner you.near\nleash deposit 10\nleash grant --name ${AGENTS[agent].key} --daily 3 --per-payment 2`;
}
