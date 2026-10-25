# Web design

The landing page and the dashboard follow PRYDD's website, read from its source rather than its
screenshots (`EntrypointLabs/prydd-website`, components under `components/prydd/`). PRYDD in turn
assigns roles to four references: Wise for the hero type, Plasma for the 3D sphere, Revolut for the
hero handoff, Altitude for the body. Leash keeps those roles.

## System

| Token | Value | Use |
| --- | --- | --- |
| Body | `#fff` ground, `#000` ink, `#727272` muted | Both schemes. Only the hero follows the OS |
| Hero | `#fff` / `#000`, dark `#17191d` / `#fafaf7` | Ground and ink of the opening |
| Action | `#2457f5` | The hero's one button, nothing else |
| Accent | `#000` | Primary pills, budget bars |
| Chip | `#f4f4f4`, hover `#ebebeb` | Secondary pills |
| Eyebrow | 8px square `#a0dcff` | Opens every chapter |
| Semantic | good `#208550`, wait `#d69a1d`, refusal `#c8323f` | Status only |
| Panels | white, 16px radius, PRYDD's three-layer panel shadow | Product UI laid on photographs |

Type: Montserrat 900 uppercase at up to 70px, tracking -0.06em, for the hero only; Montserrat 800 for
the wordmark. Everything else is Inter: 400 sentence case for headings (28 to 40px, line height
0.95, tracking -0.02em), 16px body at 1.3, 500 for amounts with the cents at half size. Geist Mono for
account ids and keys.

Layout: a 1440px shell with 64px gutters (20px on phones). Chapters are equal columns 64px apart and
128px from each other; the copy column starts with a hairline rule and 32px of padding.

## Landing

1. Hero: a three.js sphere of payment chips (green paid, red refused, amber asked, blue approved) on
   a Fibonacci sphere, small at the front and back and large at the rim, so the headline sits in a
   quiet centre. "Give your agents a budget, not your wallet."
2. Handoff: scrolling contracts the sphere behind the one card that matters, a request waiting on
   its owner, with the budget and the kill switch sliding in on either side.
3. Four chapters, each a scene: limits (a fenced meadow), payments (sky), approvals (shore), kill
   switch (ridge). Scenes are generated photographs in `web/public/scenes/` with white panels on top.
4. Where it plugs in (dark split over a dusk photo), FAQ (40/60), the way in (account field), footer.

Reduced motion and screens under 600px tall get the same content without the scroll handoff.

## Dashboard

- Overview: the vault as a large numeral on the left with facts and the kill switch; on the right,
  a photograph holding every request and proposal as white panels. On phones the waiting scene comes
  first, because it is the decision.
- Agents: one card per key with what is left today, a bar, and the limits as rows. Revoke is quiet
  until needed.
- Activity: 40/60, a ruled list of on-chain events with toned icons. Refusals are listed with the
  amount struck through, since nothing moved.
- Adding and withdrawing money use a native dialog, not a browser prompt.
