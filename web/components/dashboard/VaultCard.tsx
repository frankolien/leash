"use client";

// The vault: the balance agents spend from, what they spent today against their combined limits,
// and the week's spending from the on-chain log.

import { ArrowUpRight } from "lucide-react";
import SpendChart from "@/components/charts/SpendChart";
import { splitUsdc, toUsdc } from "@/lib/format";
import { dailyTotal, spentToday, weekSpend } from "@/lib/insights";
import type { Snapshot } from "@/lib/types";
import { Money } from "./parts";
import styles from "./dashboard.module.css";

export default function VaultCard({ snapshot: s, now, busy, onWithdraw }: { snapshot: Snapshot; now: number; busy: string | null; onWithdraw: () => void }) {
  const { whole, cents } = splitUsdc(s.vault);
  const week = weekSpend(s.log, now);
  const weekTotal = week.values.reduce((a, b) => a + b, 0);
  return (
    <section className={`${styles.card} ${styles.vault}`} aria-label="Vault">
      <div className={styles.vaultCopy}>
        <span className={styles.muted}>Vault balance</span>
        <span aria-label={`${toUsdc(s.vault)} USDC`}><Money whole={whole} cents={cents} className={styles.balance} /></span>
        <span className={styles.sub}>USDC on NEAR, in <span className="mono">{s.contract}</span></span>
        <div className={styles.today}>
          <span>Spent today</span><b className="tabular">${toUsdc(spentToday(s.agents, now))}</b><span>of ${toUsdc(dailyTotal(s.agents))} across agents</span>
        </div>
        <button className={`btn ${styles.small}`} onClick={onWithdraw} disabled={busy !== null || s.vault === BigInt(0)}><ArrowUpRight size={14} /> Withdraw</button>
      </div>
      <SpendChart values={week.values} labels={week.labels} label={`Spent by agents in the last seven days: $${weekTotal.toFixed(2)}`} />
    </section>
  );
}
