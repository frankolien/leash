# Web design

Second direction, 25 October. The first, built on PRYDD's system with a sphere of payment chips,
read as generic: coloured status dots, a decorative globe, no people. This one takes PayBox's
strongest idea, editorial photographs of people with the instruction they gave their agent, and
builds past it: the hero plays the product working over a photograph, the steps are drawn as turning
wireframes, and the owner's dashboard sits in the same world.

Sources studied in code, not screenshots: PayBox (Söhne, a soft shader ground, three.js wireframe
cubes, a looping card strip), PRYDD (`EntrypointLabs/prydd-website`), Anthropic's frontend-design
skill and the ui-ux-pro-max data (landing patterns, type pairings, UX rules).

## System

| Token | Value | Use |
| --- | --- | --- |
| Paper | `#f5f6f3` under drifting sage, sand and sky washes with grain | The ground of every page |
| Ink | `#111312`, second ink `#2b2e2c`, muted `#6b6f6c` | Type, primary buttons, bars |
| Leaf | `#1e5b3e` | The category square, focus rings, the highlighted piece in a wireframe |
| Danger | `#b3261e` | Refusals, pause, revoke. Nothing else is coloured |
| Glass | white at 62% with an 18px blur | Captions over photographs, header shortcuts |

No status dots and no tinted chips: state is said in words and, where it is a warning, in the danger
red.

Type is one family, Instrument Sans. Display is narrowed to 88% width, weight 500, tracking -0.035em,
at up to 84px. Reading text is full width at 17px. Geist Mono only for account ids and keys.

Radii follow the object: 4px for editorial cards and photographs, 16px for product panels, full for
buttons.

## Landing

0. Film: the first screen is a full-bleed film of five candid scenes (taxi, cafe, crosswalk,
   platform, market) generated with Higgsfield Seedance 2.0 from Soul stills, cut with crossfades into
   a 22.6s silent loop (`web/public/film/`, 1080p and 720p). Leash's mark floats in it as a glass
   ring, drawn in three.js with the film on a plane behind it so the glass refracts the footage. The
   caption names the agent on screen, "Now your Claude can pay. Only what you allow.", and the name
   changes on each cut. Without WebGL the plain video shows. Modelled on PayBox's hero.
1. Handoff: one scroll gesture plays a timed, reversible transition (PRYDD's handoff, ported in
   `web/hooks/useHeroHandoff.ts` with Lenis): the whole film scales down and closes into the Leash
   dashboard as an app window: sidebar, the vault with the week's spending chart, the payment
   waiting on the owner with the facts that decide it, each agent's budget, and the activity feed.
   Reduced motion and screens under 600px tall get both scenes without the handoff.
2. Stories: an endless strip of people and the instruction each gave their agent, with the limit
   that holds it. Pauses on hover; a scrollable strip under reduced motion.
3. How it holds: four numbered steps, each with a turning wireframe drawn on a 2D canvas.
4. Works with: a wall of the MCP clients that can hold a key, plus NEAR and Circle.
6. Questions, then the way in over a photograph, then the footer.

The header shortcuts for Claude Code, Codex and Cursor open the real setup steps with copy buttons.

## Dashboard

The dashboard's look is drawn to PayBox's app, with values sampled from its screens: a #0b0b0b ground,
#171717 cards with 24px corners, #242424 for search, chips and raised buttons, white pill buttons for
the main actions, one #858585 grey for secondary text, Inter, a single 952px centred column, and agent
logos in their own colours in round tiles. Leash's colour is limited to the danger red and the green
of "nothing waiting". The landing keeps its own light editorial look.

The owner's page is an app on live chain data. Its structure takes PayBox's app as a reference for
how an agent wallet is navigated, mapped onto what Leash is:

The overview fits one screen, in the layout of the landing preview: a header with Pause all and Add
money, the vault and its seven-day chart across two columns, the payment waiting for approval as a
full-height column on the right (an empty approval state when there is none; an agent's request for
a wider limit sits under its row in Agents), and agents and activity side by
side underneath. Cards scroll inside themselves; below 1180px wide or 720px tall the overview stacks.

| PayBox | Leash |
| --- | --- |
| Portfolio | Overview: the balance (hideable), Add money and Connect an agent, then spending, what waits, agents, activity |
| Credentials | Recipients: every account an agent may pay, from the allowlists, with who may pay it and what has gone to it |
| Agents | Agents: a Connect card for Claude Code, Codex and Cursor (the real setup steps), search, rows that open to show limits and Revoke |
| Approvals | Approvals: "All caught up", or every payment and proposal waiting |
| Plugins | Not applicable; Activity takes the slot, with search and filters for payments, refusals, requests and changes |
| Settings and account at the bottom | Kill switch, a dismissible first-agent setup card, the owner's wallet and Settings, pinned at the bottom |

Every view opens with a title, its state in a few words ("2 active", "All caught up") and one main
action. Views are addressed by the URL hash. On phones the views become a tab bar and the wallet
moves to a top bar.

Derived figures live in `web/lib/insights.ts`; the chart in `web/components/charts/` is shared with
the landing preview; the agent setup steps and dialog in `web/components/setup/` are shared with the
landing header.

## Photography

Generated with Higgsfield (Soul 2.0 for the editorial set, GPT Image 2 where text had to be avoided)
and kept in `web/public/people/`. Screens face away so no generated text appears.

## Mark

The tether: a bold ring, the limit the owner sets, with a solid dot inside it, off centre, the agent.
It is free to move and never reaches the ring. It also reads as a dial, the control that sets a cap.
Chosen against the field: PayBox uses a cube, Phantom a ghost, NEAR its N; the earlier square in a
square sat too close to PayBox's cube. Two closed shapes, so it holds at 16px on light and dark.

- `web/public/mark.svg`: the mark alone, used as a CSS mask so it takes the text colour.
- `web/public/icon.svg` and `apple-icon.png`: white mark on a #0b0b0b rounded square, for tabs and
  home screens.
- In the film it is a glass ring with a dark bead that drifts inside it and never touches the edge
  (`web/components/landing/GlassMark.tsx`).

