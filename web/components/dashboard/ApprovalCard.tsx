"use client";

// A payment above an agent's limit, waiting on the owner: who, how much, to whom and why, the
// facts that decide it, the time left, and the two answers.

import { Check } from "lucide-react";
import { agentLabel, msOf, shareLeft, splitUsdc, toUsdc } from "@/lib/format";
import { requestFacts } from "@/lib/insights";
import type { Agent, Names, Request } from "@/lib/types";
import AgentIcon from "./AgentIcon";
import { Money, Track } from "./parts";
import styles from "./dashboard.module.css";

export default function ApprovalCard(props: { request: Request; agent: Agent | undefined; names: Names; now: number; busy: string | null; onApprove: () => void; onDeny: () => void }) {
  const { request: r, agent, names, now, busy, onApprove, onDeny } = props;
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
      <Track share={shareLeft(msOf(r.created_at), expires, now)} />
      <span className={styles.muted}>{left === 0 ? "Expired. It drops on the next change." : `${Math.ceil(left / 60_000)} min left to decide`}</span>
      <div className={styles.decide}>
        <button className="btn" onClick={onDeny} disabled={busy !== null}>Deny</button>
        <button className="btn ink" onClick={onApprove} disabled={busy !== null || left === 0}><Check size={15} /> Approve</button>
      </div>
    </section>
  );
}
