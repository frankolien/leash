# PayBox as a reference

What MoonPay shipped on 29 July 2026, taken from their own docs on 25 October 2026, and what Leash
borrows from it. Ideas and vocabulary only; their code is closed and their enforcement is theirs.

Sources: [support article](https://support.moonpay.com/en/articles/669779-paybox-store-credentials-once-let-ai-agents-pay-securely),
[docs: model](https://docs.paybox.sh/concepts/model), [docs: approvals](https://docs.paybox.sh/concepts/approvals),
[docs: request lifecycle](https://docs.paybox.sh/concepts/requests), [docs: MCP tools](https://docs.paybox.sh/reference/mcp-tools),
[docs: getting started](https://docs.paybox.sh/getting-started), [docs: integration manual](https://docs.paybox.sh/skill).

## Their model, in their words

- **Credential**: a wallet (MPC in a TEE), a card (tokenised), or a secret. Stored once.
- **Client**: an agent integration. "One agent, one key." Rotate or revoke a client without touching
  the credentials.
- **Grant**: which credentials a client may use, and under which approval mode.
- **Approval mode**, per grant: "Human approval" (every operation waits for your passkey) or
  "Autonomous" (acts within the grant). The support article also names a middle one, "Approve above
  limit": small, pre-scoped operations run; larger or out-of-scope ones need approval.
- **Principle**: "Agents get scoped outputs, not raw credentials."
- **Tagline**: "1Password meets Stripe Link, built for agentic workflows." Also: "PayBox is a control
  plane. It does not move funds."

## Their request lifecycle

One envelope for every tool: `success`, `pending_approval` (with an `approval_url`),
`pending_signature`, `pending_settlement`, `pending_confirmation`, `denied` (with `reason`), `error`
(with `message`). Approvals expire after about ten minutes. Approvals are bound to the exact
operation: change the amount, merchant or payload and it is a new request. The agent polls
`get_request` and must never re-issue the write, because that would start a second operation.

The approval screen shows: the requesting client, the credential, the merchant or destination, the
amount and currency, chain, contract, function and value for wallets, and the request's expiry.
Approved with a passkey or biometric step-up; a push notification goes to mobile. Every request,
approval, denial, timeout and revocation is logged, reviewable in the app, and emailed.

Revocation: remove a client's grant and its next request is blocked. A **kill switch** in account
settings locks all agent access at once. Suspected compromise: kill switch, then support can freeze
the account.

## Their MCP tools

Nineteen tools. The ones that matter for us: `list_credentials` (call first; returns ids, display
metadata, the approval mode, and a count of credentials the client was not granted),
`request_payment`, `request_wallet_sign` (takes an intent, never a digest), `get_request` (poll),
`list_requests` (this client's own history, newest first, redacted output), and
`request_account_change`: the agent asks the user to widen its access with one short note and a
`manage_url`, and "nothing is applied on the agent's behalf".

Guidance they give the agent: call the listing first; never repeat a write; prefer tokens over raw
secrets; do not report a purchase complete until the merchant confirms; a `401` is an auth problem,
"don't report money as sent"; if blocked by policy, ask for an account change and do not claim it is
done until the user confirms.

## What Leash takes from this

| Theirs | Ours, and why |
| --- | --- |
| Three approval modes with plain names | Offer the mode first and the numbers second: "Ask every time", "Ask above a limit", "Autonomous within limits". A per-payment cap of zero is already "ask every time"; the grant command and the dashboard should say so in those words. |
| One result envelope with `pending_approval` and `approval_url` | `leash_pay` answers `accepted`, `refused` with a reason, or `parked` with a request id and a link to the dashboard card. Same shape for every tool, so an agent never guesses. |
| Approvals expire in ten minutes | Parked requests get an expiry and a logged `request_expired`, so an agent is never left waiting on a decision that is not coming. The owner sets the window; one hour by default, since a human is deciding. |
| Approvals bound to the exact operation | Already true on chain: the request stores to, amount, memo, and approve executes those. Say it in the UI: "Approves exactly this payment". |
| `request_account_change` | A `leash_ask_more` tool: the agent asks for a wider policy with one sentence; the dashboard shows it as a proposal; nothing changes until the owner acts. |
| `list_requests`, this client's own history | `leash_history`: the agent sees its own payments, refusals and parked requests, so it can reason about what it already did. |
| Count of ungranted credentials | `leash_status` says how many of the owner's other keys exist without naming them; an agent learns it is one of several. |
| Kill switch in settings, emailed audit | `pause` is the kill switch; the dashboard gives it one unmistakable button. Email is optional; the log is public on chain, which is the point. |
| Agent guidance in the tool descriptions | Our tool descriptions carry the same rules: preflight first, never repeat a pay, a parked request is not a payment, a refusal costs nothing. |
| "Store once, let agents pay securely" | Our README opens in sentences a person understands, before any contract word. |

## What Leash does not copy

- Hosted custody. Their limit lives on MoonPay's servers; ours lives in a contract anyone can read and
  a key the protocol itself restricts. That is the whole difference and the pitch.
- Cards and secrets. Out of scope; the hackathon track is about an agent with money on chain.
- OAuth and a signing iframe. A function-call key needs neither: the agent signs, the chain decides.

## For the dashboard

The screens they describe and we need: a list of agents (their "clients"), each with its mode and
limits; a request card with the agent, the destination, the amount, the agent's memo, the reason the
policy stopped it, and when it expires; a log that shows refusals as first-class entries; a kill
switch that is never more than one tap away. Their approval screen fields are a good checklist for
the request card. Nothing of theirs is on Mobbin yet, so the screens are ours to set.
