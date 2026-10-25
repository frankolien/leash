# leash-mcp

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

## Configure

Environment variables, or a `~/.leash/<name>.json` key file written by `leash grant`:

| Variable | Meaning |
| --- | --- |
| `LEASH_KEY_FILE` | Path to the agent key file: `{ "owner": "you.testnet", "public_key": "ed25519:...", "private_key": "ed25519:...", "contract": "leash.you.testnet", "network": "testnet" }` |
| `NEAR_RPC` | Optional RPC override |

Claude Code:

```
claude mcp add leash -- node /path/to/leash/mcp/dist/index.js
```

with `LEASH_KEY_FILE` exported in the shell that starts Claude Code.

## Build

```
npm install
npm run build
```
