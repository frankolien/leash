# leash-near-mcp

An MCP server that lets any agent pay from a Leash-bounded NEAR account. It holds the agent's key and
nothing else: the key can only call the Leash contract, and the contract enforces the owner's limits.

## Tools

| Tool | What it does |
| --- | --- |
| `leash_status` | The policy for this key: token, caps, remaining today, pending requests, vault balance |
| `leash_preflight` | Would a payment pass? Asks the contract, then adds heuristics: recipient exists, is registered for the token, has history, is not a lookalike of an allowlisted name |
| `leash_pay` | Pay within policy. Returns the contract's answer, accepted or the reason |
| `leash_request` | Park a payment over the limit for the owner to approve. It expires after the owner's window, an hour by default |
| `leash_ask_more` | Ask the owner for a wider policy in one sentence; nothing changes until they act |
| `leash_history` | This key's own payments, refusals, requests and proposals from the on-chain log |

Every tool answers `{ "status": ... }` with one of `ok`, `accepted`, `refused`, `parked`, `proposed`,
`error`, so an agent never guesses the shape. The descriptions carry the rules: preflight when unsure,
never call `leash_pay` twice for one payment, a parked request is not a payment, a refusal costs nothing.

## Set up

Create an agent in the Leash dashboard. It gives you the agent's key and one line for your app; the
dashboard's Cursor button installs it in one click. By hand:

Claude Code:

```
claude mcp add leash -e LEASH_KEY=<key from the dashboard> -- npx -y leash-near-mcp
```

Codex:

```
codex mcp add leash --env LEASH_KEY=<key from the dashboard> -- npx -y leash-near-mcp
```

Cursor, in `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "leash": { "command": "npx", "args": ["-y", "leash-near-mcp"], "env": { "LEASH_KEY": "<key from the dashboard>" } } } }
```

| Variable | Meaning |
| --- | --- |
| `LEASH_KEY` | The agent's key as the dashboard gives it (base64), or the key file's JSON |
| `LEASH_KEY_FILE` | Instead of `LEASH_KEY`: a path to the key file, such as `~/.leash/claude.json` written by `leash grant` |
| `NEAR_RPC` | Optional RPC override |

The key can only call the Leash contract's `pay`, `request` and `ask_more`, and the contract holds it
to its owner's limits. Treat it like a password all the same: anyone with it can spend up to those limits.

## Build

```
npm install
npm run build
```
