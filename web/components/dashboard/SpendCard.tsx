"use client";

// What the agents spent: today against their combined daily limits, and the last seven days from
// the on-chain log.

import { ArrowUpRight } from "lucide-react";
import SpendChart from "@/components/charts/SpendChart";
import { toUsdc } from "@/lib/format";
import { dailyTotal, spentToday, weekSpend } from "@/lib/insights";
import type { Snapshot } from "@/lib/types";
import { CardHead } from "./parts";
import styles from "./dashboard.module.css";

export default function SpendCard({ snapshot: s, now, busy, onWithdraw }: { snapshot: Snapshot; now: number; busy: string | null; onWithdraw: () => void }) {
  const week = weekSpend(s.log, now);
  const weekTotal = week.values.reduce((a, b) => a + b, 0);
  const spent = spentToday(s.agents, now);
  const total = dailyTotal(s.agents);
  return (
    <section className={`${styles.card} ${styles.spend}`} aria-label="Spending">
      <CardHead title="Spending" aside={<button className={styles.textButton} onClick={onWithdraw} disabled={busy !== null || s.vault === BigInt(0)}><ArrowUpRight size={14} /> Withdraw</button>} />
      <div className={styles.spendBody}>
        <div className={styles.spendFigures}>
          <div><span className={styles.muted}>Spent today</span><strong className="tabular">${(Number(spent) / 1e6).toFixed(2)}</strong><span className={styles.muted}>of ${toUsdc(total)} across agents</span></div>
          <div><span className={styles.muted}>Last 7 days</span><strong className="tabular">${weekTotal.toFixed(2)}</strong><span className={styles.muted}>paid out of the vault</span></div>
        </div>
        <SpendChart values={week.values} labels={week.labels} label={`Spent by agents in the last seven days: $${weekTotal.toFixed(2)}`} />
      </div>
    </section>
  );
}
