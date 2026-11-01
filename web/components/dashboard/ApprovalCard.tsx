"use client";

// A payment above an agent's limit, waiting on the owner: who, how much, to whom and why, the
// facts that decide it, the time left, and the two answers.

import { AlertTriangle, Check, Info } from "lucide-react";
import { useRecipientFacts } from "@/hooks/useRecipientFacts";
import { agentLabel, msOf, shareLeft, splitUsdc, toUsdc } from "@/lib/format";
import { requestFacts } from "@/lib/insights";
import { assess, hasDanger } from "@/lib/safety";
import type { Agent, LogEntry, Names, Network, Request } from "@/lib/types";
import AgentIcon from "./AgentIcon";
import { Money, Track } from "./parts";
import styles from "./dashboard.module.css";

export default function ApprovalCard(props: { request: Request; agent: Agent | undefined; log: LogEntry[]; network: Network; names: Names; now: number; busy: string | null; onApprove: () => void; onDeny: () => void }) {
  const { request: r, agent, log, network, names, now, busy, onApprove, onDeny } = props;
  const facts = useRecipientFacts(network, r.token, r.to);
  const checks = assess(r, agent, log, facts, r.owner);
  const danger = hasDanger(checks);
  const who = agentLabel(r.key, names);
  const expires = msOf(r.expires_at);
  const left = Math.max(0, expires - now);
  const { whole, cents } = splitUsdc(BigInt(r.amount));
  // The contract's reason, said the short way the owner thinks of it.
  const chip = agent && r.reason.includes("per-payment") ? `over $${toUsdc(agent.policy.per_payment_cap)} limit`
    : agent && r.reason.includes("daily") ? `over $${toUsdc(agent.policy.daily_cap)} a day`
    : r.reason;
  return (
    <section className={`${styles.card} ${styles.approval}`} aria-label={`${who} wants to pay ${toUsdc(r.amount)} USDC`}>
      <div className={styles.cardHead}>
        <span className={styles.who}><AgentIcon name={who} size={38} />{who} wants to pay</span>
        <span className={styles.reason} title={r.reason}>{chip}</span>
      </div>
      <Money whole={whole} cents={cents} className={styles.amount} />
      <span className={styles.sub}>to <span className="mono">{r.to}</span></span>
      {r.memo && <p className={styles.memo}>“{r.memo}”</p>}
      <dl className={styles.facts}>
        {requestFacts(r, agent, names, toUsdc).map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
      </dl>
      <ul className={styles.checks} aria-label="Checks on the recipient">
        {facts === null && <li className={styles.checkPending}>Checking {r.to} on chain…</li>}
        {checks.map((c) => (
          <li key={c.text} data-tone={c.tone}>
            {c.tone === "danger" ? <AlertTriangle size={15} /> : c.tone === "note" ? <Info size={15} /> : <Check size={15} />}
            <span>{c.text}</span>
          </li>
        ))}
      </ul>
      <Track share={shareLeft(msOf(r.created_at), expires, now)} />
      <span className={styles.muted}>{left === 0 ? "Expired. It drops on the next change." : `${Math.ceil(left / 60_000)} min left to decide`}</span>
      <div className={styles.decide}>
        <button className="btn" onClick={onDeny} disabled={busy !== null}>Deny</button>
        <button className="btn ink" onClick={onApprove} disabled={busy !== null || left === 0}><Check size={15} /> {danger ? "Approve anyway" : "Approve"}</button>
      </div>
    </section>
  );
}
