"use client";

// An agent wants more than it may spend, and the owner decides. The amount is the loudest thing in
// the panel; the time bar drains in real time; Approve is the only filled button.

import { Check } from "lucide-react";
import { agentLabel, msOf, shareLeft, splitUsdc } from "@/lib/format";
import type { Names, Request } from "@/lib/types";
import { AgentBadge, Money, Track } from "./parts";
import styles from "./dashboard.module.css";

export default function RequestCard(props: { request: Request; names: Names; now: number; busy: string | null; onApprove: () => void; onDeny: () => void }) {
  const { request: r, names, now, busy, onApprove, onDeny } = props;
  const who = agentLabel(r.key, names);
  const expires = msOf(r.expires_at);
  const share = shareLeft(msOf(r.created_at), expires, now);
  const left = Math.max(0, expires - now);
  const minutes = Math.ceil(left / 60_000);
  const { whole, cents } = splitUsdc(BigInt(r.amount));
  return (
    <article className={styles.panel} aria-label={`Request ${r.id} from ${who}`}>
      <div className={styles.panelHeader}>
        <span className={styles.who}><AgentBadge name={who} size={28} />{who} wants to pay</span>
        <span className={styles.chip} data-tone="warn">{r.reason}</span>
      </div>
      <div className={styles.split}>
        <div><span className={styles.label}>Amount</span><Money whole={whole} cents={cents} className={styles.requestAmount} /></div>
        <div><span className={styles.label}>To</span><strong className={`${styles.recipient} mono`}>{r.to}</strong></div>
      </div>
      {r.memo && <p className={styles.memo}>“{r.memo}”</p>}
      <Track share={share} tone={share < 0.15 ? "bad" : "warn"} />
      <small className={styles.note}>{left === 0 ? "Expired. It drops on the next change." : `${minutes} min left to decide · approves exactly this payment`}</small>
      <div className={styles.decide}>
        <button className="pill" onClick={onDeny} disabled={busy !== null}>Deny</button>
        <button className="pill primary" onClick={onApprove} disabled={busy !== null || left === 0}><Check size={15} /> Approve</button>
      </div>
    </article>
  );
}
