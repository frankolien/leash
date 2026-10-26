"use client";

// The vault: the balance agents spend from (hideable on a shared screen), USDC waiting in the
// owner's own account to go in, what agents spent today against their combined limits, and the
// last seven days from the on-chain log.

import { useEffect, useState } from "react";
import { ArrowUpRight, Eye, EyeOff } from "lucide-react";
import SpendChart from "@/components/charts/SpendChart";
import { toUsdc } from "@/lib/format";
import { dailyTotal, spentToday, weekSpend } from "@/lib/insights";
import type { Snapshot } from "@/lib/types";
import styles from "./dashboard.module.css";

const HIDE_KEY = "leash.balance.hidden";

function dollars(units: bigint): string {
  return `$${(Number(units) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function VaultCard({ snapshot: s, now, busy, onWithdraw, onDeposit }: { snapshot: Snapshot; now: number; busy: string | null; onWithdraw: () => void; onDeposit: () => void }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try { setHidden(window.localStorage.getItem(HIDE_KEY) === "1"); } catch {}
  }, []);
  const toggle = () => setHidden((h) => {
    try { window.localStorage.setItem(HIDE_KEY, h ? "0" : "1"); } catch {}
    return !h;
  });
  const week = weekSpend(s.log, now);
  const weekTotal = week.values.reduce((a, b) => a + b, 0);
  return (
    <section className={`${styles.card} ${styles.vault}`} aria-label="Vault">
      <div className={styles.vaultCopy}>
        <div className={styles.heroLabel}>
          <span>Vault balance</span>
          <button onClick={toggle} aria-label={hidden ? "Show balance" : "Hide balance"} aria-pressed={hidden}>{hidden ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        </div>
        <strong className={styles.balance} aria-label={hidden ? "Balance hidden" : `${toUsdc(s.vault)} USDC`}>{hidden ? "$••••" : dollars(s.vault)}</strong>
        {s.held > BigInt(0) ? (
          <div className={styles.waiting}>
            <span><b className="tabular">{hidden ? "$••••" : dollars(s.held)}</b> in your account</span>
            <button className={styles.waitingAdd} onClick={onDeposit} disabled={busy !== null}>Add to vault</button>
          </div>
        ) : (
          <span className={styles.muted}>USDC your agents spend from</span>
        )}
        <div className={styles.today}>
          <span>Spent today</span><b className="tabular">{dollars(spentToday(s.agents, now))}</b><span>of ${toUsdc(dailyTotal(s.agents))} across agents</span>
        </div>
        <button className={styles.sectionLink} onClick={onWithdraw} disabled={busy !== null || s.vault === BigInt(0)}><ArrowUpRight size={14} /> Withdraw</button>
      </div>
      <SpendChart values={week.values} labels={week.labels} label={`Spent by agents in the last seven days: $${weekTotal.toFixed(2)}`} />
    </section>
  );
}
