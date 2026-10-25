# Leash

A bounded account for AI agents on NEAR. The agent gets a key that can spend from your dollars only
inside the limits you set, the limits are enforced by a contract rather than a promise, and anything
over the limit waits for you. Revoke is one call.

Built for NEAR HACKATHON, November 2026. Tracks: AI Security & Defense, Agent Economy, Open Innovation.

## Why NEAR

NEAR accounts carry access keys with their own permissions. The agent's key is added to your own
account as a function-call key that may only call this contract's `pay` and `request`. The protocol
refuses anything else the agent signs: no NEAR transfer, no call to the USDC contract, no new keys. The
contract reads which key signed and applies that key's policy. The money never leaves your account's
control, and the agent holds no balance to drain.

## Try it

Every step below is one command and says what you should see. The AI judges can run this too.

1. Install: `cargo install cargo-near near-cli-rs`, then `npm install` in `mcp/` and `cli/`.
2. `leash init --owner you.testnet` deploys a contract for you on testnet and deposits 10 test USDC.
   See: the contract account and a vault balance of 10.
3. `leash grant --daily 3 --per-payment 2 --name claude` adds an agent key to your account.
   See: a key file at `~/.leash/claude.json` and `near account view-access-key-list you.testnet` showing a
   function-call key for the contract, methods `pay, request`.
4. Point an agent at the MCP server (`mcp/README.md` has the Claude Code line) and ask it to pay 1 USDC
   to `vendor.testnet` twice. See: two `pay` events and the vault at 8.
5. Ask for a third payment of 2 USDC. See: the contract answers `over daily cap`; the agent parks a
   request; `leash log` shows it; `leash approve 1` lands it; the vault is at 6.
6. `leash revoke claude`. See: the next agent call fails with `AccessKeyDoesNotExist` before it reaches
   the contract.

## Layout

| Path | What |
| --- | --- |
| `contract/` | The Leash contract, Rust with near-sdk 5. `cargo test` runs the policy tests. |
| `mcp/` | MCP server any agent can use: preflight, pay, request, status. |
| `cli/` | Owner's CLI: init, deposit, grant, revoke, pause, approve, log. |
| `docs/` | Design and decisions. |

## Status

- [x] Policy contract with unit tests
- [x] Testnet deployment: `leash.frankolien.testnet`
- [x] MCP server, smoke-tested against testnet
- [x] CLI
- [ ] Integration test through near-workspaces
- [ ] Dashboard
- [ ] Mainnet
