# Plan to 14 November

Submission window: 1 to 14 November 2026, 23:59 UTC. Judging 16 to 18 November. One submission, tracks
`security`, `agents`, `open`, plus `privacy` if the stretch lands.

## Done, 25 October

- Contract: policies per agent key, vault per owner and token, pay with refusal reasons, parked requests,
  approve and deny, pause, revoke, withdraw, callback refunds, bounded log, NEP-297 events. Nine unit tests.
- Deployed to testnet at `leash.frankolien.testnet`, registered on native testnet USDC.
- CLI: init, deposit, withdraw, grant, revoke, pause, resume, approve, deny, status, requests, log.
- MCP server: status, preflight with recipient heuristics, pay, request. Smoke test over stdio.
- On chain, the granted key is a function-call key restricted to the contract and the two methods.

## Next

| When | What | Done when |
| --- | --- | --- |
| 26 Oct | Test USDC in the vault; two payments land, third refused, request parked and approved; `revoke` makes the next call fail at the protocol | The README's six steps run as written on testnet |
| 27 Oct | near-workspaces integration test that runs the same six steps against a sandbox with a mock USDC | `cargo test` covers the cross-contract path, not only the unit path |
| 28 Oct | Storage accounting: `set_policy` and `request` charge the owner for the bytes they add; measure with `env::storage_usage()` | A stranger cannot grow the contract's storage for free |
| 29 Oct | Dashboard: one page that reads `get_policies`, `get_requests`, `get_log` for an owner, with approve and deny through a wallet | The owner never needs the CLI to say yes |
| 30 Oct | Claude Code and Codex demo: the MCP server in a real agent session, recorded | The demo film's raw footage exists |
| 31 Oct | README as a test script for the AI judges; `HACKATHON.md` reread | A stranger with the repo and ten minutes reaches step six |
| 1 to 7 Nov | Mainnet deploy with real USDC, small; agent key TTL and cooldown exercised; refusal log in the dashboard | Mainnet address in the README |
| 8 to 12 Nov | Stretch: Countersign. A NEAR AI Cloud model signs off on the exact payment payload inside its TEE; the contract checks the signature against the attested signing address | `privacy` track entry is honest |
| 13 Nov | Demo post on X with the film; submission payload printed and confirmed | Submitted, 201 |

## Decisions still open

- Name. Leash is the working name.
- Whether the vault should hold NEAR as well as USDC for agents that pay for compute in NEAR.
- Whether an owner can grant a key to a sub-account agent (`bot.frank.near`) rather than to their own
  account, for agents that need an identity of their own.
