// What people put an agent on a leash for. Each story is the instruction in the person's words and
// the limit that holds it, in Leash's own terms: a daily cap, a per-payment cap, an allowlist, a
// cooldown, an expiry, or an approval.

export type Story = { tag: string; photo: string; alt: string; ask: string; hold: string };

export const STORIES: Story[] = [
  { tag: "Subscriptions", photo: "subscriptions", alt: "A man on a balcony with coffee and his phone", ask: "Keep my API plan paid every month.", hold: "Only vendor.near can be paid. Anything over $5 waits for him." },
  { tag: "Research", photo: "research", alt: "A woman thinking at a cafe table with a laptop", ask: "Spend up to $5 on search and scraping today.", hold: "A $5 daily cap. The sixth dollar is refused, not sent." },
  { tag: "Freelancers", photo: "freelance", alt: "A designer reviewing poster proofs on a studio wall", ask: "Pay the illustrator once I sign off the proofs.", hold: "Parked as a request until she approves that exact payment." },
  { tag: "Compute", photo: "compute", alt: "An engineer working late at his desk", ask: "Top up my GPU credits when they run low.", hold: "One provider, $25 a day, and a minute between top-ups." },
  { tag: "Travel", photo: "travel", alt: "A traveller on a train platform checking her phone", ask: "Book the cheapest train to Lisbon under $80.", hold: "Under $80 it pays on its own. Above, it asks first." },
  { tag: "Household", photo: "groceries", alt: "A couple unpacking groceries in their kitchen", ask: "Reorder our staples from the usual shop.", hold: "One shop on the list, $30 a day, nothing anywhere else." },
  { tag: "Tipping", photo: "tips", alt: "A woman reading on her phone in an armchair", ask: "Tip the writers I read, a dollar each.", hold: "$1 per payment, $10 a day, a minute apart." },
  { tag: "Teams", photo: "team", alt: "Three colleagues around a laptop in a loft office", ask: "Give the intern's agent $20 for the week.", hold: "A key that expires on Friday, whatever is left." },
];
