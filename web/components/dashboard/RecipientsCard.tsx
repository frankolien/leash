"use client";

// The overview's short list of accounts agents may pay, and what has gone to each.

import { agentLabel, toUsdc } from "@/lib/format";
import { recipients } from "@/lib/insights";
import type { Agent, LogEntry, Names } from "@/lib/types";
import styles from "./dashboard.module.css";

export default function RecipientsCard({ agents, log, names }: { agents: Agent[]; log: LogEntry[]; names: Names }) {
  const { list, openKeys } = recipients(agents, log);
  return (
    <section className={`${styles.card} ${styles.panel}`} aria-label="Recipients">
      <div className={styles.cardHead}><strong>Recipients</strong><a className={styles.sectionLink} href="#recipients">See all</a></div>
      <div className={styles.panelBody}>
        {list.length === 0 && <p className={styles.muted}>No recipient lists yet.</p>}
        {list.map((r) => (
          <div key={r.account} className={styles.miniRow}>
            <span className={styles.recipientMark} aria-hidden="true">{r.account.charAt(0).toUpperCase()}</span>
            <span className={styles.rowMain}><strong>{r.account}</strong><small>{r.keys.length ? r.keys.map((k) => agentLabel(k, names)).join(", ") : "No list"}</small></span>
            <b className="tabular">${toUsdc(r.paid)}</b>
          </div>
        ))}
        {openKeys.length > 0 && <p className={styles.miniNote}>{openKeys.map((k) => agentLabel(k, names)).join(" and ")} may pay any account.</p>}
      </div>
    </section>
  );
}
