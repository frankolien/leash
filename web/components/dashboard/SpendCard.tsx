"use client";

// What the agents spent: today against their combined daily limits, and the last seven days from
// the on-chain log.

import SpendChart from "@/components/charts/SpendChart";
import { toUsdc } from "@/lib/format";
import { dailyTotal, spentToday, weekSpend } from "@/lib/insights";
import type { Snapshot } from "@/lib/types";
import styles from "./dashboard.module.css";

export default function SpendCard({ snapshot: s, now }: { snapshot: Snapshot; now: number }) {
  const week = weekSpend(s.log, now);
  const weekTotal = week.values.reduce((a, b) => a + b, 0);
  return (
    <div className={`${styles.card} ${styles.spend}`}>
      <div className={styles.spendFigures}>
        <div><span className={styles.muted}>Spent today</span><strong className="tabular">${(Number(spentToday(s.agents, now)) / 1e6).toFixed(2)}</strong><span className={styles.muted}>of ${toUsdc(dailyTotal(s.agents))} across agents</span></div>
        <div><span className={styles.muted}>Last 7 days</span><strong className="tabular">${weekTotal.toFixed(2)}</strong><span className={styles.muted}>paid out of the vault</span></div>
      </div>
      <SpendChart values={week.values} labels={week.labels} label={`Spent by agents in the last seven days: $${weekTotal.toFixed(2)}`} />
    </div>
  );
}
