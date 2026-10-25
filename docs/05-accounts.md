# Accounts and sign-in

## One shared contract

Every owner uses the same Leash contract (`leash.frankolien.testnet` on testnet, `leash.near` planned
for mainnet). The contract has always identified the owner by the calling account and keyed every
vault, policy, request and log entry by it, so a private instance per owner was only a CLI choice,
and one that locked about 4 NEAR of code storage per owner. `leash init` now joins the shared
contract; `--own-contract` still deploys a private one.

An owner pays for the bytes their state takes through a storage credit. `deposit_storage` takes an
optional `account_id`, so anyone, in practice the sign-up sponsor, can pay the credit for a new
owner. Credit only ever helps the owner it names.

## Two ways in

| | NEAR wallet | Google, Apple or email |
| --- | --- | --- |
| Signs with | The user's wallet, through NEAR Connect | A Privy embedded wallet, through `signRawHash` |
| Account | Any NEAR account | The wallet's implicit account (64 hex characters) |
| First fees | The user's own NEAR | Paid by the sponsor at sign-up |

Pages see one `OwnerSession` (`web/lib/session.ts`) either way: `call`, `addAgentKey`, `deleteKey`.
`web/components/auth/` holds the context, the Privy bridge and the sign-in dialog. Without
`NEXT_PUBLIC_PRIVY_APP_ID` the app offers NEAR wallets only.

## The sponsor

`POST /api/onboard` (`web/app/api/onboard/route.ts`, logic in `web/lib/server/sponsor.ts`) readies a
new embedded account from `leash.testnet`:

1. Sends 0.3 NEAR, which creates the implicit account and pays for gas and agent-key allowances.
2. Registers it on USDC (NEP-145, 0.00125 NEAR).
3. Pays a 0.1 NEAR Leash storage credit with `deposit_storage({ account_id })`.

The caller must present a Privy identity token whose linked NEAR wallet is the account; without a
Privy app configured the route refuses in production. Each step runs only if still missing, so a
retry finishes the job without paying twice. Tested on testnet with a throwaway account: created,
registered, credited, then the account added an agent key and set a policy (0.0065 NEAR of credit).

Environment, in `web/.env.local` (never committed): `SPONSOR_ACCOUNT_ID`, `SPONSOR_PRIVATE_KEY`,
`NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_PRIVY_CLIENT_ID`.

## Agents without the CLI

The dashboard's New agent dialog makes the key pair in the browser, has the owner sign twice (add a
function-call key on their account, restricted to the contract and `pay`, `request`, `ask_more`;
set its policy), and hands over the key file once with the MCP config for Claude Code, Codex or
Cursor. Revoke stops the policy and deletes the key, so NEAR rejects the agent's next call.

## Mainnet notes

At 0.4 NEAR per sign-up the sponsor needs funding and abuse limits beyond a per-instance rate
limit. Meta-transactions (NEP-366) would let the sponsor pay gas per call instead of funding each
account up front.
