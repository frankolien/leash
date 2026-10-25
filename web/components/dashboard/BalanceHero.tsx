"use client";

// The top of the overview: the vault balance, which the owner can hide on a shared screen, and the
// two things to do next: add money, or connect an agent.

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toUsdc } from "@/lib/format";
import { BrandLogo } from "./AgentIcon";
import styles from "./dashboard.module.css";

const HIDE_KEY = "leash.balance.hidden";

function dollars(units: bigint): string {
  return `$${(Number(units) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function BalanceHero({ vault, contract, busy, onDeposit, onSetup }: { vault: bigint; contract: string; busy: string | null; onDeposit: () => void; onSetup: () => void }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try { setHidden(window.localStorage.getItem(HIDE_KEY) === "1"); } catch {}
  }, []);
  const toggle = () => {
    setHidden((h) => {
      try { window.localStorage.setItem(HIDE_KEY, h ? "0" : "1"); } catch {}
      return !h;
    });
  };
  return (
    <section className={styles.hero} aria-label="Vault balance">
      <div className={styles.heroLabel}>
        <span>Balance</span>
        <button onClick={toggle} aria-label={hidden ? "Show balance" : "Hide balance"} aria-pressed={hidden}>{hidden ? <EyeOff size={17} /> : <Eye size={17} />}</button>
        <span className={styles.chip}>{contract}</span>
      </div>
      <strong className={styles.heroBalance} aria-label={hidden ? "Balance hidden" : `${toUsdc(vault)} USDC`}>{hidden ? "$••••" : dollars(vault)}</strong>
      <div className={styles.heroActions}>
        <button className={styles.white} onClick={onDeposit} disabled={busy !== null}>Add money</button>
        <button className={styles.white} onClick={onSetup}>Connect <BrandLogo name="claude" size={19} /> Claude Code</button>
      </div>
    </section>
  );
}
