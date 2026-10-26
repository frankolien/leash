# Demo film and post

The hackathon requires a post on X that says "built at NEAR HACKATHON" with a video or screenshots.
This is the plan for a 90-second film that shows Leash working, not slides about it. Every shot is
real: a real agent, real testnet transactions, the real dashboard.

## What to have ready

- The dashboard open at your own account, signed in, on a 1440 by 900 window.
- Claude Code in a terminal next to it, with the Leash MCP server added and an agent named
  `claude` limited to $3 a day and $2 per payment, allowed to pay `vendor.testnet`.
- A few dollars of test USDC in the vault.
- Screen recording at 60 fps, system sound off.

## Shot list

| Time | Screen | What happens | Caption |
| --- | --- | --- | --- |
| 0 to 6 s | Landing film | The film plays and the glass ring drifts; one scroll and the film closes into the dashboard | Your agent can pay now. Only what you allow. |
| 6 to 18 s | Claude Code | Type: "Pay vendor.testnet $1 for API credits." Claude runs `leash_preflight`, then `leash_pay`, and says it settled | Under its limit, it just pays. |
| 18 to 24 s | Dashboard | The notice "claude paid vendor.testnet" appears; the activity row and the week's chart move | Every payment, on chain, as it happens. |
| 24 to 40 s | Claude Code, then dashboard | Type: "Renew the $5 plan with vendor.testnet." Claude reports it is over its $2 limit and parks a request; the approval panel slides in on the right | Above it, it asks you first. |
| 40 to 50 s | Dashboard | Point at the checks in the panel; press Approve; the panel closes and the vault drops by $5 | You approve exactly this payment. |
| 50 to 64 s | Claude Code, then dashboard | Type: "Pay vend0r.testnet $5." The preflight warns it imitates vendor.testnet; the request's panel shows the warnings in red and the button reads Approve anyway; press Deny | It knows a lookalike when it sees one. |
| 64 to 76 s | Dashboard, then Claude Code | Agents, claude, Revoke key. Ask Claude to pay again; the call fails with `AccessKeyDoesNotExist` | Revoke, and NEAR refuses the key. |
| 76 to 90 s | Sign-in card, then end card | The sign-in card with Google, Apple and email; end on the ring mark and the repository link | Built at NEAR HACKATHON. |

Keep the cursor slow and the captions on screen long enough to read twice. No music under the
Claude Code shots; a single low tone on the cut to the end card is enough.

## The post

> Agents can pay now. Leash makes sure they only spend what you allow.
>
> Each agent gets its own NEAR key with a daily limit and a list of who it may pay. Inside the
> limits it pays in USDC on its own; above them, your dashboard asks you. Lookalike accounts get
> flagged, and revoking the key stops it at the protocol.
>
> Built at NEAR HACKATHON. Open source: <repository link>

Attach the film, then the approval panel screenshot with the lookalike warnings as the second image.
