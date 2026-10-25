"use client";

// An agent asking for a wider policy, in its own words. Nothing changes until the owner acts.

import { agentLabel } from "@/lib/format";
import type { Names, Proposal } from "@/lib/types";

export default function ProposalCard({ proposal: p, names, busy, onDismiss }: { proposal: Proposal; names: Names; busy: string | null; onDismiss: () => void }) {
  return (
    <div className="tile proposal">
      <span className="eyebrow">{agentLabel(p.key, names)} asks for more</span>
      <p className="memo">{p.note}</p>
      <div className="chips">
        <button className="pill ghost" onClick={onDismiss} disabled={busy !== null}>Dismiss</button>
        <span className="chip">change the policy with <span className="mono">leash grant</span></span>
      </div>
    </div>
  );
}
