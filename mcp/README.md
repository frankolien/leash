# leash-near-mcp

An MCP server that lets any agent pay from a Leash-bounded NEAR account. It holds the agent's key and
nothing else: the key can only call the Leash contract, and the contract enforces the owner's limits.

## Tools

| Tool | What it does |
| --- | --- |
| `leash_status` | The policy for this key: token, caps, remaining today, pending requests, vault balance |
| `leash_preflight` | Would a payment pass? The contract's answer, plus a counterparty check that answers allow, warn or block: reported as a scam, exists, can hold the token, lookalike of a trusted name, account age, freshly changed contract code, prior payments |
| `leash_pay` | Pay within policy. Runs the counterparty check first: a block is never signed, a warn is left for the owner through `leash_request`. Returns the contract's answer, accepted or the reason |
| `leash_request` | Park a payment over the limit for the owner to approve. It expires after the owner's window, an hour by default |
| `leash_ask_more` | Ask the owner for a wider policy in one sentence; nothing changes until they act |
| `leash_fetch` | Fetch a URL that charges per request (x402). A 402 that takes Leash payments is paid from the budget, under the owner's limits, and the content comes back with the transaction |
| `leash_open_task`, `leash_close_task` | Set aside part of the budget for one job, for a sub-agent or yourself; payments with that task's label can never pass it |
| `leash_report` | Report an account that tried to scam the agent, with evidence. The contract then refuses to pay it for this owner, and for every owner once two owners have reported it |
| `leash_history` | This key's own payments, refusals, requests and proposals from the on-chain log |

Every tool answers `{ "status": ... }` with one of `ok`, `accepted`, `refused`, `parked`, `proposed`,
`error`, so an agent never guesses the shape. The descriptions carry the rules: preflight when unsure,
never call `leash_pay` twice for one payment, a parked request is not a payment, a refusal costs nothing.

### Paying for APIs

`leash_fetch` speaks x402 version 2. A server that wants paying answers 402 with a `PAYMENT-REQUIRED`
header; if one of its accepted ways is a Leash payment on this agent's network and token (`scheme`
`exact`, `network` `near:testnet` or `near:mainnet`, `extra.assetTransferMethod` `leash`), the tool
signs a pay intent for exactly that recipient and amount, repeats the request with it in
`PAYMENT-SIGNATURE`, and the server's facilitator delivers it to the Leash contract. The tool refuses,
before sending anything, a price over `max_usdc` (1.00 unless given) or over the owner's limits.
Try it: `https://leash.frankolien.com/api/paid` lists services an agent can buy this way (Wikipedia search, any web page as text, token prices), and `https://leash.frankolien.com/api/paid/sample` costs one cent. The server side, and how a
server accepts Leash payments, is in `docs/07-x402.md` in the Leash repo.

## Set up

Create an agent in the Leash dashboard. It gives you the agent's key and one line for your app; the
dashboard's Cursor button installs it in one click. By hand:

Claude Code:

```
claude mcp add --scope user leash -e LEASH_KEY=<key from the dashboard> -- npx -y leash-near-mcp
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
| `LEASH_RELAY_URL` | Where signed instructions go, so the agent needs no NEAR for gas; a key from the dashboard or the app already names its relay, and this overrides it. When the relay cannot be reached the agent's own key sends the transaction |
| `NEAR_RPC` | Optional RPC override |

The key can only call the Leash contract's `pay`, `request` and `ask_more`, and the contract holds it
to its owner's limits. Treat it like a password all the same: anyone with it can spend up to those limits.

## Build

```
npm install
npm run build
```
