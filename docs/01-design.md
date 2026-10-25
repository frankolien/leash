# Leash: a bounded account for AI agents on NEAR

Working name. The product: an agent gets a key that can spend from a person's dollars only inside limits
the person set, and the limits are enforced by a contract, not by a promise. Revoke is one call. Anything
over the limit waits for the person.

Track: AI Security & Defense (`security`), also entered in Agent Economy (`agents`) and Open Innovation
(`open`). Stretch for Privacy (`privacy`): a model running in NEAR AI Cloud's enclave as a second signer.

## The account model

NEAR accounts carry access keys with their own permissions, so the agent never gets a wallet of its own.

1. The owner (`frank.near`) generates an ed25519 key pair for the agent and adds the public key to
   `frank.near` as a function-call key: receiver `leash.near`, methods `pay` and `request`, with a gas
   allowance. The protocol now refuses any transaction signed by that key that is not a call to those two
   methods. It cannot move NEAR, call the USDC contract, or add keys.
2. The owner deposits USDC into the Leash contract with `ft_transfer_call`. The contract keeps a vault
   balance per owner and token.
3. The owner sets a policy for the key: token, daily cap, per-payment cap, allowlist, cooldown, expiry.
4. The agent signs `pay(to, amount, memo)` as `frank.near` with its own key. The contract reads
   `signer_account_pk`, finds the policy for that key, checks it, debits the vault and forwards the USDC.
   If the policy says no, the call fails with the reason. If the amount is over the cap, the agent can
   `request` instead and the payment waits for the owner's `approve`.
5. Revoke: the owner sets the policy inactive in the contract, and deletes the key from the account. Either
   one stops the agent; the CLI does both.

Why this beats a separate agent wallet: the money never leaves the owner's control, the agent holds no
balance to drain, and the protocol itself refuses anything outside the two methods. On Ethereum this needs
an ERC-4337 account plus a session-key module; on Solana there is no key scoping at all.

What the key's allowance does and does not do: it caps gas, in NEAR, which is the agent's sandbox for
compute. It does not cap tokens. Token limits live in the policy.

## Contract interface

Owner methods, called by the owner with a full-access key:

| Method | Does |
| --- | --- |
| `set_policy(public_key, policy)` | Create or replace the policy for an agent key |
| `revoke(public_key)` | Policy inactive; the key can no longer pay |
| `pause()` / `resume()` | Kill switch for every key of this owner |
| `approve(request_id)` / `deny(request_id)` | Decide a parked payment |
| `withdraw(token, amount)` | Take vault money back to the owner |
| `set_request_ttl(secs)` | How long a parked request waits for the owner; an hour by default |
| `dismiss_proposal(id)` | Clear an agent's note asking for more |

Agent methods, called as the owner with the agent's function-call key:

| Method | Does |
| --- | --- |
| `pay(to, amount, memo)` | Pay within policy, or fail with the reason |
| `request(to, amount, memo)` | Park a payment the policy would refuse, for the owner to decide. It expires after the owner's window and is logged as `request_expired` when touched afterwards |
| `ask_more(note)` | Ask the owner for a wider policy in one sentence. Nothing changes until the owner acts |

Token callback:

| Method | Does |
| --- | --- |
| `ft_on_transfer(sender, amount, msg)` | Credits the sender's vault for the token that called |

Views:

| Method | Returns |
| --- | --- |
| `get_policy(owner, public_key)` | The policy, with spent today and remaining |
| `get_policies(owner)` | Every policy of an owner |
| `get_vault(owner, token)` | Vault balance |
| `check(owner, public_key, to, amount)` | The pre-flight verdict: ok, or the reason, and whether a request would be needed |
| `get_requests(owner)` | Parked payments that have not expired |
| `get_proposals(owner)` | Notes from agents asking for more |
| `get_request_ttl(owner)` | The owner's request window in seconds |
| `get_log(owner, from, limit)` | Recent decisions, newest last |

Policy fields: `token`, `daily_cap`, `per_payment_cap`, `allowlist` (empty means anyone), `cooldown_secs`,
`expires_at` (0 means never), `active`. Counters: `spent_today`, `day_started_at`, `last_paid_at`.

Every decision is a NEP-297 event under standard `leash`, version `1.0.0`: `policy_set`, `policy_revoked`,
`paused`, `resumed`, `deposit`, `withdraw`, `pay`, `pay_failed`, `pay_refused`, `request_parked`,
`request_approved`, `request_denied`, `request_expired`, `proposal_made`, `proposal_dismissed`.

## Safety rules the contract follows

- Vault credit happens only inside `ft_on_transfer`, which the token contract calls after the tokens have
  moved. The contract keeps the whole amount and returns 0 unused.
- A payment debits the vault and the daily counter before the transfer promise, and the callback refunds
  both if the transfer failed. Nothing is credited to anyone on a failed transfer.
- Owner methods refuse a signer key that has a policy, so an agent key can never approve its own request
  even if someone widened its method list by mistake.
- `pay` and `request` are non-payable, so a function-call key can call them without a wallet popup.
- The daily window is per key and resets by elapsed time, not by calendar day, so there is no midnight
  double-spend.
- The owner pays for the bytes their policies, requests and log add. `deposit_storage` puts NEAR down;
  every call that adds state measures `storage_usage` before and after, flushing the store collections
  first because they buffer writes until the call ends, and bills the difference at the protocol's byte
  price. Freed bytes are credited back. A call that would overdraw fails, so the contract never pays for
  a stranger's state and nobody can grow it for free.

## The MCP server and CLI

The MCP server exposes six tools any agent can call, each answering in one envelope whose `status` is
`ok`, `accepted`, `refused`, `parked`, `proposed` or `error`: `leash_status` (mode, caps, remaining,
allowlist, what is waiting on the owner, how many other keys exist), `leash_preflight` (the contract's
`check` plus heuristics: recipient missing, not registered for the token, lookalike of an allowlisted
name), `leash_pay`, `leash_request`, `leash_ask_more` and `leash_history` (this key's own log). Every tool
description carries the rules an agent must follow: preflight when unsure, never repeat a pay, a parked
request is not a payment, a refusal costs nothing. It holds the agent key and nothing else.

The CLI is for the owner: `leash init`, `leash deposit <usdc>`, `leash grant --daily 20 --per-payment 5
--to api.vendor.near --ttl 2h`, `leash register <account>`, `leash revoke <key>`, `leash pause`,
`leash approve <id>`, `leash log`.

## The demo a judge runs

1. `leash grant --daily 3 --per-payment 2` prints a key file for the agent.
2. In Claude Code with the MCP server: ask the agent to pay 1 USDC to `vendor.near` twice. Both land; the
   explorer shows two transfers from `frank.near`.
3. Ask for a third. The contract refuses: daily cap. The agent calls `leash_request`; the owner sees it in
   `leash log` and approves; it lands.
4. `leash revoke`. Any further call fails at the protocol before it reaches the contract.

## Compared with PayBox

MoonPay's PayBox (29 July 2026) is the closest product: a non-custodial vault an agent spends from, with
a spending cap, a per-transaction ceiling, a token allowlist, an "always ask" mode beside an
autonomous one, passkey approval for changes, revocation, and one MCP endpoint for Claude and ChatGPT.
Keys are split by MPC across MoonPay's enclaves ([MoonPay support](https://support.moonpay.com/en/articles/669779-paybox-store-credentials-once-let-ai-agents-pay-securely),
[Unite.AI](https://www.unite.ai/moonpays-paybox-lets-ai-agents-spend-without-taking-custody/),
[devrels.xyz](https://devrels.xyz/articles/paybox-mcp-wallet-for-ai-agents)). It proves the demand and
sets the bar for the feature list.

Where Leash differs, and why that is the point:

| | PayBox | Leash |
| --- | --- | --- |
| Who enforces the limit | MoonPay's servers and enclaves | The NEAR protocol (the key cannot call anything else) and a contract anyone can read |
| What revocation is | A request to MoonPay | Deleting a key from your own account; the chain refuses the next call |
| Who you trust | MoonPay, plus a MoonPay account | Nobody new; your account, your contract |
| Where the record lives | MoonPay's log | On chain, every refusal included, readable by anyone |
| Over the limit | Denied, or "always ask" for everything | Parked as a request the owner decides, without turning every payment into a prompt |
| Code | Closed | Open, deployable by anyone, same contract on testnet and mainnet |

The one-line answer to "why not PayBox": PayBox asks you to trust MoonPay's limit; Leash lets you verify
the limit in the explorer and revoke it at the protocol. The hackathon's own track asked for exactly
that: "function call keys, TEE attestation", which is also the stretch below.

## Stretch, from day 8

Countersign: a market or payment runs only if a model in NEAR AI Cloud's TEE signed off on the exact
payload. The contract checks the signature against the attested signing address. Entered in `privacy`.
