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
   block, drawn in three.js with the film on a plane behind it so the glass refracts the footage. The
   caption names the agent on screen, "Now your Claude can pay. Only what you allow.", and the name
   changes on each cut. Without WebGL the plain video shows. Modelled on PayBox's hero.
1. Handoff: one scroll gesture plays a timed, reversible transition (PRYDD's handoff, ported in
   `web/hooks/useHeroHandoff.ts` with Lenis): the whole film scales down and closes into the vault
   panel, and the limit and approval panels slide in beside it, in PRYDD's three-panel layout.
   Reduced motion and screens under 600px tall get both scenes without the handoff.
2. Stories: an endless strip of people and the instruction each gave their agent, with the limit
   that holds it. Pauses on hover; a scrollable strip under reduced motion.
3. How it holds: four numbered steps, each with a turning wireframe drawn on a 2D canvas.
4. Works with: a wall of the MCP clients that can hold a key, plus NEAR and Circle.
5. The dashboard's own pieces over a desk photograph.
6. Questions, then the way in over a photograph, then the footer.

The header shortcuts for Claude Code, Codex and Cursor open the real setup steps with copy buttons.

## Dashboard

The vault as a large numeral with facts and the kill switch; the waiting requests and proposals as
white panels over the desk photograph (first on phones); agent cards; a ruled activity list where a
refusal's amount is struck through. Adding and withdrawing use a native dialog.

## Photography

Generated with Higgsfield (Soul 2.0 for the editorial set, GPT Image 2 where text had to be avoided)
and kept in `web/public/people/`. Screens face away so no generated text appears.
