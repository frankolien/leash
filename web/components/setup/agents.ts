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

export function steps(agent: Agent) {
  const a = AGENTS[agent];
  return [
    { title: "Create your vault and fund it", where: "In your terminal", code: "leash init\nleash deposit 10" },
    { title: `Give ${a.label} a key with limits`, where: "In your terminal", code: `leash grant --name ${a.key} --daily 3 --per-payment 2 \\\n  --to vendor.near` },
    { title: `Add Leash to ${a.label}`, ...a.config },
    { title: "Ask it to pay", where: `In ${a.label}`, code: `"Pay vendor.near $1 for API credits."\n\nUnder $2 it pays. Above, it waits for you here.` },
  ];
}
