# Dashboard design

The owner's one page: what the agents may spend, what is waiting on you, what they did. Built from
three references Frank chose, studied on 25 October 2026 from their live CSS and screens, not from
their marketing images.

## What each reference gives

| Reference | What we take | What we leave |
| --- | --- | --- |
| PayBox (paybox.sh) | Söhne-style grotesk with tight tracking (-0.03em) on one big line of copy; glass pills for navigation; a mono face for keys and addresses; coral `#f45b69` and amber `#f6c94c` as the only warm colours on a near-black page | Full-bleed video and photography; a dashboard is read, not watched |
| PRYDD (prydd.co) | Charcoal `#18191c` base, not pure black; Montserrat ExtraBold uppercase for the one statement on the page; a single electric-blue pill as the only filled button; tiny uppercase micro-labels with wide tracking for section eyebrows | Scroll-driven storytelling |
| Revolut (app, via Mobbin) | The balance as one big numeral with small cents; the budget tile: "$79 left to spend, on track" with a thin progress bar; rounded tiles on `#1c1c1e`; activity rows of icon, title, time, amount; green and red used only for meaning | Bottom tab bar and the product carousel |

## Tokens

Colour, dark first, since every reference is dark and the page is read at night when an agent asks:

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#131417` | Page |
| `--surface` | `#1b1d21` | Tiles |
| `--surface-2` | `#23262b` | Chips, inputs, hover |
| `--line` | `#2c3036` | Hairlines |
| `--ink` | `#f3f3f1` | Text |
| `--muted` | `#9a9fa8` | Secondary text |
| `--accent` | `#3b6cff` | The one filled button, the progress bar, links |
| `--good` | `#19c37d` | A payment that landed, a key that is on |
| `--warn` | `#f6c94c` | A request waiting, a key near its cap |
| `--bad` | `#f45b69` | A refusal, the kill switch, a key that is off |

Light theme exists for the system setting with the same roles on `#f7f7f5` and `#ffffff`.

Type, all from Google Fonts:

| Role | Face | Where |
| --- | --- | --- |
| Statement | Montserrat 800, uppercase, tracking -0.02em | The page's one line when nothing waits: "NOTHING NEEDS YOU." The request card's amount |
| Interface | Geist 400 to 600, tracking -0.01em, tabular numerals | Everything else |
| Keys and amounts in rows | Geist Mono | Public keys, account names, log amounts |
| Eyebrows | Geist 500, 11px, uppercase, tracking 0.12em | Section labels: WAITING ON YOU, AGENTS, ACTIVITY |

## Layout

One column, 680px wide on desktop, full width with 16px gutters on a phone. Top to bottom:

1. **Bar**: owner's account name in mono, a network pill (glass), the connected wallet or a Connect pill,
   and on the far right the kill switch: a coral outline pill reading "Pause all" that becomes a filled
   coral "Paused" state with "Resume". Never more than one tap away.
2. **Balance**: the vault as one numeral, Revolut-style, cents small: `$10.00` with "in the vault" under
   it in muted. Beside it the storage credit in NEAR, small, mono. Deposit and Withdraw as ghost pills.
3. **Waiting on you**: the request cards. This is the screen that matters. One card per parked request:
   the agent's name as the eyebrow, the amount huge in Montserrat, "to vendor.testnet" in mono, the
   agent's memo as a quote, the reason the policy stopped it as an amber chip ("over daily cap"), the
   time left as a thin bar draining, and two actions: Approve, the only blue pill on the page, and Deny,
   ghost. Below the requests, proposals as smaller cards: the note in the agent's words, a Dismiss ghost
   and "Change policy" that opens the key's card. When nothing waits, the section is the one statement:
   "NOTHING NEEDS YOU." in Montserrat with a muted line under it.
4. **Agents**: a tile per key. Name, mode in words, a Revolut-style budget line: "$2 of $3 left today"
   with the bar, the per-payment cap, allowlist chips, expiry if any, an on or off dot. Revoke as a coral
   ghost pill inside the tile; Grant as a dashed empty tile at the end.
5. **Activity**: rows newest first. A small icon by event, the title ("Paid vendor.testnet",
   "Refused: over daily cap", "Request parked", "Approved request 1"), the time, the amount on the right
   in mono. Refusals carry a coral tint on the icon only, not the whole row; requests amber; payments
   plain. A row never shouts.

Motion: the request card's time bar drains in real time; a decided card collapses upward; the balance
counts on load. Nothing else moves. `prefers-reduced-motion` turns all of it off.

## Data and actions

Reads go straight to the contract's views over RPC, by owner account from the URL (`/frankolien.testnet`),
so a judge can open anyone's dashboard read-only. Writes need the owner's wallet through HOT Connect:
approve, deny, pause, resume, revoke, dismiss, deposit (an `ft_transfer_call` on the token), withdraw.
No server. The page polls every ten seconds while open.

## Copy rules

Refusals are good news, written as such: "Refused: over daily cap. Nothing moved." Keys are called by
the agent's name; the public key appears only in mono under it. Never "transaction", "gas" or "wallet"
in the main flow; "vault", "agent", "request", "paid", "refused", "waiting on you".
