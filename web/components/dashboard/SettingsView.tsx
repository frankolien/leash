"use client";

// The vault's own settings: how long a request waits for an answer, the storage credit that pays
// for the contract's data, where everything lives, and the kill switch.

import { nearOf } from "@/lib/format";
import type { Snapshot } from "@/lib/types";
import styles from "./dashboard.module.css";

const WINDOWS = [{ secs: 900, label: "15 minutes" }, { secs: 1800, label: "30 minutes" }, { secs: 3600, label: "1 hour" }, { secs: 21600, label: "6 hours" }, { secs: 86400, label: "24 hours" }];

export default function SettingsView(props: { snapshot: Snapshot; busy: string | null; canAct: boolean; onWindow: (secs: number) => void; onPause: () => void; onResume: () => void }) {
  const { snapshot: s, busy, canAct, onWindow, onPause, onResume } = props;
  return (
    <div className={styles.settings}>
      <section className={styles.card}>
        <div className={styles.setting}>
          <div><strong>Approval window</strong><span>How long a payment above a limit waits for you before it drops.</span></div>
          <select value={s.requestTtl} onChange={(e) => onWindow(Number(e.target.value))} disabled={busy !== null || !canAct} aria-label="Approval window">
            {!WINDOWS.some((w) => w.secs === s.requestTtl) && <option value={s.requestTtl}>{Math.round(s.requestTtl / 60)} minutes</option>}
            {WINDOWS.map((w) => <option key={w.secs} value={w.secs}>{w.label}</option>)}
          </select>
        </div>
        <div className={styles.setting}>
          <div><strong>Kill switch</strong><span>{s.paused ? "Paused. No agent can pay until you resume." : "Stops every agent key at once. Undo with resume."}</span></div>
          {s.paused
            ? <button className="btn ink" onClick={onResume} disabled={busy !== null || !canAct}>Resume</button>
            : <button className="btn line danger" onClick={onPause} disabled={busy !== null || !canAct}>Pause all</button>}
        </div>
      </section>
      <section className={styles.card}>
        <dl className={styles.facts}>
          <div><dt>Vault contract</dt><dd className="mono">{s.contract}</dd></div>
          <div><dt>Token</dt><dd className="mono">{s.token.length > 24 ? `${s.token.slice(0, 10)}…${s.token.slice(-6)}` : s.token}</dd></div>
          <div><dt>Network</dt><dd>{s.network === "mainnet" ? "NEAR mainnet" : "NEAR testnet"}</dd></div>
          <div><dt>Storage credit</dt><dd className="tabular">{nearOf(s.storage)} NEAR</dd></div>
        </dl>
        <p className={styles.muted}>Storage credit pays for the bytes your policies, requests and log take on chain. Freed bytes come back to it.</p>
      </section>
    </div>
  );
}
