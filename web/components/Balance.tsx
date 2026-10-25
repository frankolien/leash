"use client";

// The vault as one numeral with small cents, the way a bank app shows a balance.

import { nearOf, splitUsdc, toUsdc } from "@/lib/format";
import type { Snapshot } from "@/lib/types";

export default function Balance({ snapshot, busy, onDeposit, onWithdraw }: { snapshot: Snapshot; busy: string | null; onDeposit: () => void; onWithdraw: () => void }) {
  const { whole, cents } = splitUsdc(snapshot.vault);
  const active = snapshot.agents.filter((a) => a.policy.active).length;
  return (
    <section className="balance" aria-label="Vault">
      <div className="amount" aria-label={`${toUsdc(snapshot.vault)} USDC in the vault`}>
        ${whole}
        <span className="cents">.{cents}</span>
      </div>
      <div className="sub">
        <span>in the vault</span>
        <span className="mono">{nearOf(snapshot.storage)} NEAR for storage</span>
        <span>{active} active {active === 1 ? "agent" : "agents"}</span>
      </div>
      <div className="actions">
        <button className="pill ghost" onClick={onDeposit} disabled={busy !== null}>Deposit</button>
        <button className="pill ghost" onClick={onWithdraw} disabled={busy !== null || snapshot.vault === BigInt(0)}>Withdraw</button>
      </div>
    </section>
  );
}
