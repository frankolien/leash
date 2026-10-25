"use client";

// Every agent as a row: its mark, how it behaves, what it has left today. A row opens to show the
// limits it runs under and the one action, Revoke.

import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { agentLabel, modeOf, shortKey, toUsdc } from "@/lib/format";
import type { Agent, Names } from "@/lib/types";
import AgentIcon from "./AgentIcon";
import { Track } from "./parts";
import styles from "./dashboard.module.css";

export default function AgentList({ agents, names, paused, busy, onRevoke }: { agents: Agent[]; names: Names; paused: boolean; busy: string | null; onRevoke: (a: Agent) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const shown = agents.filter((a) => !q || agentLabel(a.key, names).toLowerCase().includes(q) || a.policy.allowlist.some((t) => t.includes(q)));
  return (
    <>
      <label className={styles.search}><Search size={17} aria-hidden="true" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search agents or recipients" aria-label="Search agents" /></label>
      <div className={styles.list}>
        {shown.length === 0 && <p className={styles.muted}>No agent matches “{query}”.</p>}
        {shown.map((a) => {
          const who = agentLabel(a.key, names);
          const daily = BigInt(a.policy.daily_cap);
          const isOpen = open === a.key;
          const state = !a.policy.active ? "Revoked" : paused ? "Paused" : "Active";
          const expires = a.policy.expires_at ? new Date(a.policy.expires_at * 1000) : null;
          return (
            <div key={a.key} className={styles.listItem} data-open={isOpen || undefined}>
              <button className={styles.listRow} onClick={() => setOpen(isOpen ? null : a.key)} aria-expanded={isOpen}>
                <AgentIcon name={who} size={42} off={!a.policy.active} />
                <span className={styles.listMain}>
                  <strong>{who}</strong>
                  <small>{a.policy.active ? `${modeOf(a.policy)}. $${toUsdc(a.remaining)} of $${toUsdc(daily)} left today` : "Key deleted. It can no longer pay."}</small>
                </span>
                <span className={styles.state} data-off={state !== "Active" || undefined}>{state}</span>
                <ChevronDown size={18} className={styles.chevron} aria-hidden="true" />
              </button>
              {isOpen && (
                <div className={styles.listDetail}>
                  {a.policy.active && <Track share={daily === BigInt(0) ? 0 : Number((a.remaining * BigInt(1000)) / daily) / 1000} />}
                  <dl className={styles.facts}>
                    <div><dt>Daily limit</dt><dd className="tabular">${toUsdc(daily)}</dd></div>
                    <div><dt>Per payment, without asking</dt><dd className="tabular">${toUsdc(a.policy.per_payment_cap)}</dd></div>
                    <div><dt>May pay</dt><dd>{a.policy.allowlist.length ? a.policy.allowlist.map((t) => <span key={t} className={`${styles.pillTag} mono`}>{t}</span>) : "Anyone"}</dd></div>
                    {a.policy.cooldown_secs > 0 && <div><dt>Between payments</dt><dd>{a.policy.cooldown_secs} s</dd></div>}
                    {expires && <div><dt>Key expires</dt><dd>{expires.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</dd></div>}
                    <div><dt>Key</dt><dd className="mono" title={a.key}>{shortKey(a.key)}</dd></div>
                  </dl>
                  {a.policy.active && <button className="btn line danger" onClick={() => onRevoke(a)} disabled={busy !== null}>Revoke key</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
