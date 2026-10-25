"use client";

// The accounts agents may pay: who may pay each one and what has gone to it, from the allowlists
// and the on-chain log.

import { useState } from "react";
import { Search } from "lucide-react";
import { agentLabel, toUsdc } from "@/lib/format";
import { recipients } from "@/lib/insights";
import type { Agent, LogEntry, Names } from "@/lib/types";
import AgentIcon from "./AgentIcon";
import styles from "./dashboard.module.css";

export default function RecipientsView({ agents, log, names }: { agents: Agent[]; log: LogEntry[]; names: Names }) {
  const [query, setQuery] = useState("");
  const { list, openKeys } = recipients(agents, log);
  const q = query.trim().toLowerCase();
  const shown = list.filter((r) => !q || r.account.includes(q));
  return (
    <>
      {openKeys.length > 0 && (
        <p className={styles.notice}>
          {openKeys.map((k) => agentLabel(k, names)).join(" and ")} {openKeys.length === 1 ? "has" : "have"} no recipient list and may pay any account within {openKeys.length === 1 ? "its" : "their"} limits.
        </p>
      )}
      <label className={styles.search}><Search size={17} aria-hidden="true" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search accounts" aria-label="Search recipients" /></label>
      <div className={styles.list}>
        {shown.length === 0 && <p className={styles.muted}>{list.length ? `No account matches “${query}”.` : "No recipients yet. Give an agent a list with leash grant --to."}</p>}
        {shown.map((r) => (
          <div key={r.account} className={styles.listItem}>
            <div className={styles.listRow}>
              <span className={styles.recipientMark} aria-hidden="true">{r.account.charAt(0).toUpperCase()}</span>
              <span className={styles.listMain}>
                <strong className="mono">{r.account}</strong>
                <small>{r.keys.length ? `On the list of ${r.keys.map((k) => agentLabel(k, names)).join(", ")}` : "Paid by an agent with no list"}{r.lastPaidMs ? `. Last paid ${new Date(r.lastPaidMs).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}</small>
              </span>
              <span className={styles.recipientAgents}>{r.keys.map((k) => <AgentIcon key={k} name={agentLabel(k, names)} size={26} />)}</span>
              <span className={styles.recipientPaid}><b className="tabular">${toUsdc(r.paid)}</b><small>paid</small></span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
