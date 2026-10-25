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
- The README's six steps ran on testnet end to end with Circle's test USDC: two payments, a refusal
  over the daily cap, a parked request approved by the owner, and after revoke the protocol rejected
  the key before the contract saw it. A transfer to an unregistered recipient failed and was refunded.
- Storage accounting: the owner pays for policy, request and log bytes from a credit; freed bytes
  come back. `leash register` pays a recipient's token registration; `approve` refuses an
  unregistered recipient unless forced.

## Next

| When | What | Done when |
| --- | --- | --- |
| 26 Oct | Test USDC in the vault; two payments land, third refused, request parked and approved; `revoke` makes the next call fail at the protocol | The README's six steps run as written on testnet |
| 27 Oct | Done 25 Oct: three near-workspaces tests against a sandbox with a mock USDC: the six steps, the refund of a failed transfer, the storage rule; cooldown and expiry also exercised on testnet | `cargo test` covers the cross-contract path, not only the unit path |
| 28 Oct | Done 25 Oct: storage accounting, owner-paid, measured with `env::storage_usage()` after a flush | A stranger cannot grow the contract's storage for free |
| 29 Oct | Done 25 Oct: the dashboard, designed from PayBox, PRYDD and Revolut (docs/04), reads the chain over RPC, acts through HOT Connect | The owner never needs the CLI to say yes |
| 30 Oct | Claude Code and Codex demo: the MCP server in a real agent session, recorded | The demo film's raw footage exists |
| 31 Oct | Done 25 Oct: README as a test script for the AI judges (commands that verify the claims on testnet with no account); `HACKATHON.md` reread still to do | A stranger with the repo and ten minutes reaches step six |
| 1 to 7 Nov | Mainnet deploy with real USDC, small; agent key TTL and cooldown exercised; refusal log in the dashboard | Mainnet address in the README |
| 8 to 12 Nov | Stretch: Countersign. A NEAR AI Cloud model signs off on the exact payment payload inside its TEE; the contract checks the signature against the attested signing address | `privacy` track entry is honest |
| 13 Nov | Demo post on X with the film; submission payload printed and confirmed | Submitted, 201 |

## Also done 25 Oct

- Sign in with Google, Apple or email (Privy embedded wallets) with a testnet sponsor; one shared contract (docs/05).
- The dashboard creates agents itself; approvals open a side panel only while a payment waits.
- CLI split into modules; unit tests for CLI and web; CI for every package.

## Decisions still open

- Name. Leash is the working name.
- Whether the vault should hold NEAR as well as USDC for agents that pay for compute in NEAR.
- Whether an owner can grant a key to a sub-account agent (`bot.frank.near`) rather than to their own
  account, for agents that need an identity of their own.
