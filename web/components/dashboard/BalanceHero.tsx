"use client";

// The top of the overview: the vault balance, which the owner can hide on a shared screen, and the
// two things to do next: add money, or connect another agent.

import { useEffect, useState } from "react";
import { Eye, EyeOff, Plus } from "lucide-react";
import { splitUsdc, toUsdc } from "@/lib/format";
import { Money } from "./parts";
import styles from "./dashboard.module.css";

const HIDE_KEY = "leash.balance.hidden";

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
  const { whole, cents } = splitUsdc(vault);
  return (
    <section className={styles.hero} aria-label="Vault balance">
      <div className={styles.heroLabel}>
        <span>Vault balance</span>
        <button onClick={toggle} aria-label={hidden ? "Show balance" : "Hide balance"} aria-pressed={hidden}>{hidden ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        <span className={styles.contractChip}>{contract}</span>
      </div>
      <span aria-label={hidden ? "Balance hidden" : `${toUsdc(vault)} USDC`}>
        {hidden ? <strong className={styles.heroBalance}>$•••••</strong> : <Money whole={whole} cents={cents} className={styles.heroBalance} />}
      </span>
      <div className={styles.heroActions}>
        <button className="btn ink" onClick={onDeposit} disabled={busy !== null}><Plus size={16} /> Add money</button>
        <button className="btn line" onClick={onSetup}>Connect an agent</button>
      </div>
    </section>
  );
}
