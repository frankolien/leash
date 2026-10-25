"use client";

// The top of the dashboard. On the left, the vault: what the agents can spend from, and the kill
// switch. On the right, a scene holding everything waiting on the owner, so the one decision on the
// page sits where the eye lands.

import type { ReactNode } from "react";
import { Check, Plus, ArrowUpRight } from "lucide-react";
import { nearOf, splitUsdc, toUsdc } from "@/lib/format";
import type { Snapshot } from "@/lib/types";
import { Money } from "./parts";
import styles from "./dashboard.module.css";

export default function Overview(props: {
  snapshot: Snapshot;
  busy: string | null;
  canAct: boolean;
  onDeposit: () => void;
  onWithdraw: () => void;
  onPause: () => void;
  onResume: () => void;
  children: ReactNode;
  waiting: number;
}) {
  const { snapshot: s, busy, canAct, onDeposit, onWithdraw, onPause, onResume, children, waiting } = props;
  const { whole, cents } = splitUsdc(s.vault);
  const active = s.agents.filter((a) => a.policy.active).length;
  return (
    <section id="waiting" className={styles.overview} aria-label="Vault and waiting requests">
      <div className={styles.vault}>
        <div className={styles.vaultTop}>
          <span className="eyebrow">Vault</span>
          <span className={`${styles.contract} mono`}>{s.contract}</span>
          <span aria-label={`${toUsdc(s.vault)} USDC in the vault`}><Money whole={whole} cents={cents} className={styles.balance} /></span>
          <span className={styles.balanceNote}>USDC your agents can spend from</span>
          <div className={styles.vaultActions}>
            <button className="pill primary" onClick={onDeposit} disabled={busy !== null}><Plus size={15} /> Add money</button>
            <button className="pill" onClick={onWithdraw} disabled={busy !== null || s.vault === BigInt(0)}><ArrowUpRight size={15} /> Withdraw</button>
          </div>
        </div>
        <dl className={styles.facts}>
          <div><dt>Agents</dt><dd>{active} active</dd></div>
          <div><dt>Approval window</dt><dd>{Math.round(s.requestTtl / 60)} min</dd></div>
          <div><dt>Storage credit</dt><dd className="tabular">{nearOf(s.storage)} NEAR</dd></div>
        </dl>
        <div className={styles.killSwitch} data-paused={s.paused}>
          <div>
            <strong>Kill switch</strong>
            <span>{s.paused ? "Paused. No agent can pay until you resume." : "Stops every agent key at once."}</span>
          </div>
          {s.paused ? (
            <button className="pill danger on" onClick={onResume} disabled={busy !== null || !canAct}>Resume</button>
          ) : (
            <button className="pill danger" onClick={onPause} disabled={busy !== null || !canAct}>Pause all</button>
          )}
        </div>
      </div>

      <div className={styles.stage} data-scene={waiting ? "shore" : "sky"}>
        <span className={styles.stagePill}>
          {waiting ? <><span className={styles.statusDot} data-tone="warn" />{waiting} waiting on you</> : <><span className={styles.statusDot} data-tone="good" />Nothing waiting</>}
        </span>
        <div className={styles.stagePanels}>
          {waiting ? children : (
            <div className={`${styles.panel} ${styles.calm}`}>
              <span className={styles.calmCheck} aria-hidden="true"><Check size={20} /></span>
              <strong>Nothing needs you.</strong>
              <span>Every agent is inside its limits. Refusals show up in the activity below.</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
