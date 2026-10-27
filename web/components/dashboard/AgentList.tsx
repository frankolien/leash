"use client";

// Every agent as a row: its mark, how it behaves, what it has left today. A row opens to show the
// limits it runs under, any temporary raise, the tasks it opened for sub-agents, and the actions:
// End raise, Close task, Revoke.

import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { agentLabel, modeOf, shortKey, toUsdc } from "@/lib/format";
import type { Agent, Names, Task } from "@/lib/types";
import { caps, untilText } from "@/lib/raise";
import AgentIcon from "./AgentIcon";
import { Track } from "./parts";
import styles from "./dashboard.module.css";

export default function AgentList({ agents, tasks, names, paused, busy, onRevoke, onEndRaise, onCloseTask }: { agents: Agent[]; tasks: Task[]; names: Names; paused: boolean; busy: string | null; onRevoke: (a: Agent) => void; onEndRaise: (a: Agent) => void; onCloseTask: (t: Task) => void }) {
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
          const { daily, perPayment } = caps(a);
          const isOpen = open === a.key;
          const state = !a.policy.active ? "Revoked" : paused ? "Paused" : "Active";
          const expires = a.policy.expires_at ? new Date(a.policy.expires_at * 1000) : null;
          return (
            <div key={a.key} className={styles.listItem} data-open={isOpen || undefined}>
              <button className={styles.listRow} onClick={() => setOpen(isOpen ? null : a.key)} aria-expanded={isOpen}>
                <AgentIcon name={who} size={42} off={!a.policy.active} />
                <span className={styles.listMain}>
                  <strong>{who}</strong>
                  <small>{a.policy.active ? `${a.raise ? `Raised until ${untilText(a.raise.until)}` : modeOf(a.policy)}. $${toUsdc(a.remaining)} of $${toUsdc(daily)} left today` : "Key deleted. It can no longer pay."}</small>
                </span>
                <span className={styles.state} data-off={state !== "Active" || undefined}>{state}</span>
                <ChevronDown size={18} className={styles.chevron} aria-hidden="true" />
              </button>
              {isOpen && (
                <div className={styles.listDetail}>
                  {a.policy.active && <Track share={daily === BigInt(0) ? 0 : Number((a.remaining * BigInt(1000)) / daily) / 1000} />}
                  <dl className={styles.facts}>
                    <div><dt>Daily limit</dt><dd className="tabular">${toUsdc(daily)}</dd></div>
                    <div><dt>Per payment, without asking</dt><dd className="tabular">${toUsdc(perPayment)}</dd></div>
                    {a.raise && <div><dt>Raise ends</dt><dd>{untilText(a.raise.until)}, back to ${toUsdc(a.policy.daily_cap)} a day</dd></div>}
                    {a.raise?.allow.length ? <div><dt>Also, for now</dt><dd>{a.raise.allow.map((t) => <span key={t} className={`${styles.pillTag} mono`}>{t}</span>)}</dd></div> : null}
                    <div><dt>May pay</dt><dd>{a.policy.allowlist.length ? a.policy.allowlist.map((t) => <span key={t} className={`${styles.pillTag} mono`}>{t}</span>) : "Anyone"}</dd></div>
                    {a.policy.cooldown_secs > 0 && <div><dt>Between payments</dt><dd>{a.policy.cooldown_secs} s</dd></div>}
                    {expires && <div><dt>Key expires</dt><dd>{expires.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</dd></div>}
                    <div><dt>Key</dt><dd className="mono" title={a.key}>{shortKey(a.key)}</dd></div>
                  </dl>
                  <TaskList tasks={tasks.filter((t) => t.parent === a.key)} busy={busy} onClose={onCloseTask} />
                  <div className={styles.listActions}>
                    {a.raise && <button className="btn line" onClick={() => onEndRaise(a)} disabled={busy !== null}>End raise now</button>}
                    {a.policy.active && <button className="btn line danger" onClick={() => onRevoke(a)} disabled={busy !== null}>Revoke key</button>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/// The budgets this agent set aside for sub-agents: open ones first, with what each has spent.
function TaskList({ tasks, busy, onClose }: { tasks: Task[]; busy: string | null; onClose: (t: Task) => void }) {
  if (!tasks.length) return null;
  const now = Date.now() * 1e6;
  const open = (t: Task) => t.active && t.expires_at > now;
  const shown = [...tasks.filter(open), ...tasks.filter((t) => !open(t))].slice(0, 6);
  return (
    <div className={styles.tasks}>
      <span className={styles.tasksHead}>Tasks for sub-agents</span>
      {shown.map((t) => {
        const budget = BigInt(t.budget), spent = BigInt(t.spent);
        const live = open(t);
        return (
          <div key={t.id} className={styles.taskRow} data-off={!live || undefined}>
            <span className={styles.rowMain}><strong>{t.label}</strong><small>{live ? `Ends ${untilText(t.expires_at)}` : t.active ? "Ended" : "Closed"}{t.allow.length ? `, only ${t.allow.join(", ")}` : ""}</small></span>
            <span className={styles.budget}><span><b className="tabular">${toUsdc(spent)}</b> of ${toUsdc(budget)}</span><Track share={budget === BigInt(0) ? 0 : Number(((budget - spent) * BigInt(1000)) / budget) / 1000} /></span>
            {live ? <button className={styles.sectionLink} onClick={() => onClose(t)} disabled={busy !== null}>Close</button> : <span />}
          </div>
        );
      })}
    </div>
  );
}
