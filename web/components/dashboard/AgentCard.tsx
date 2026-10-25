"use client";

// One agent key: its name, how it behaves in words, what is left today, and the limits it runs
// under. Revoke is the only action, and it is quiet until needed.

import { agentLabel, modeOf, shortKey, splitUsdc, toUsdc } from "@/lib/format";
import type { Agent, Names } from "@/lib/types";
import AgentIcon from "./AgentIcon";
import { Money, Track } from "./parts";
import styles from "./dashboard.module.css";

export default function AgentCard({ agent: a, names, paused, busy, onRevoke }: { agent: Agent; names: Names; paused: boolean; busy: string | null; onRevoke: () => void }) {
  const who = agentLabel(a.key, names);
  const daily = BigInt(a.policy.daily_cap);
  const share = daily === BigInt(0) ? 0 : Number((a.remaining * BigInt(1000)) / daily) / 1000;
  const status = !a.policy.active ? "Revoked" : paused ? "Paused" : "Active";
  const { whole, cents } = splitUsdc(a.remaining);
  const expires = a.policy.expires_at ? new Date(a.policy.expires_at * 1000) : null;
  return (
    <article className={styles.agent} data-off={!a.policy.active || paused || undefined}>
      <div className={styles.agentTop}>
        <AgentIcon name={who} size={40} off={!a.policy.active} />
        <div><strong>{who}</strong><span>{a.policy.active ? modeOf(a.policy) : "Its key no longer exists"}</span></div>
        <span className={styles.status} data-off={status !== "Active" || undefined}>{status}</span>
      </div>
      <div className={styles.agentBudget}>
        <Money whole={whole} cents={cents} className={styles.agentAmount} />
        <span>of ${toUsdc(daily)} left today</span>
      </div>
      <Track share={share} />
      <dl className={styles.limits}>
        <div><dt>Per payment</dt><dd className="tabular">${toUsdc(a.policy.per_payment_cap)}</dd></div>
        <div>
          <dt>Only to</dt>
          <dd>{a.policy.allowlist.length ? <span className={styles.recipients}>{a.policy.allowlist.map((to) => <span key={to} className="mono">{to}</span>)}</span> : "Anyone"}</dd>
        </div>
        {a.policy.cooldown_secs > 0 && <div><dt>Cooldown</dt><dd>{a.policy.cooldown_secs} s</dd></div>}
        {expires && <div><dt>Expires</dt><dd>{expires.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</dd></div>}
        <div><dt>Key</dt><dd className="mono" title={a.key}>{shortKey(a.key)}</dd></div>
      </dl>
      {a.policy.active && <button className={`btn line danger ${styles.revoke}`} onClick={onRevoke} disabled={busy !== null}>Revoke key</button>}
    </article>
  );
}
