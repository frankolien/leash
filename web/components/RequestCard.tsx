"use client";

// The screen that matters: an agent wants more than it may spend, and the owner decides. The amount
// is the loudest thing on the page; the time bar drains in real time; Approve is the only filled
// button.

import { agentLabel, msOf, shareLeft, splitUsdc } from "@/lib/format";
import type { Names, Request } from "@/lib/types";

export default function RequestCard(props: { request: Request; names: Names; now: number; busy: string | null; onApprove: () => void; onDeny: () => void }) {
  const { request: r, names, now, busy, onApprove, onDeny } = props;
  const expires = msOf(r.expires_at);
  const created = msOf(r.created_at);
  const share = shareLeft(created, expires, now);
  const left = Math.max(0, expires - now);
  const minutes = Math.ceil(left / 60_000);
  const { whole, cents } = splitUsdc(BigInt(r.amount));
  const tone = share < 0.15 ? "bad" : share < 0.4 ? "warn" : "";
  return (
    <article className="tile request" aria-label={`Request ${r.id}`}>
      <div className="top">
        <span className="eyebrow">{agentLabel(r.key, names)} wants to pay</span>
        <span className="chip warn">{r.reason}</span>
      </div>
      <div className="amount">
        ${whole}
        <span style={{ fontSize: "0.5em", opacity: 0.6 }}>.{cents}</span>
      </div>
      <div className="to">
        to <span className="mono">{r.to}</span>
      </div>
      {r.memo && <blockquote className="memo">{r.memo}</blockquote>}
      <div className="timer">
        <div className="bar-track"><div className={`bar-fill ${tone}`} style={{ width: `${share * 100}%` }} /></div>
        <span>{left === 0 ? "expired; the next touch drops it" : `${minutes} min left to decide · approves exactly this payment`}</span>
      </div>
      <div className="actions">
        <button className="pill ghost" onClick={onDeny} disabled={busy !== null}>Deny</button>
        <button className="pill accent" onClick={onApprove} disabled={busy !== null || left === 0}>Approve</button>
      </div>
    </article>
  );
}
