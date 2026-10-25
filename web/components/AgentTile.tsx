"use client";

// One agent key: its name, its mode in words, and what is left today as a budget line.

import { agentLabel, modeOf, shortKey, toUsdc } from "@/lib/format";
import type { Agent, Names } from "@/lib/types";

export default function AgentTile({ agent: a, names, paused, busy, onRevoke }: { agent: Agent; names: Names; paused: boolean; busy: string | null; onRevoke: () => void }) {
  const daily = BigInt(a.policy.daily_cap);
  const share = daily === BigInt(0) ? 0 : Number((a.remaining * BigInt(1000)) / daily) / 1000;
  const on = a.policy.active && !paused;
  const expires = a.policy.expires_at ? new Date(a.policy.expires_at * 1000) : null;
  return (
    <article className={`tile agent${on ? "" : " off"}`}>
      <div className="name-row">
        <div className="name">
          <span className={`dot ${on ? "good" : "bad"}`} />
          {agentLabel(a.key, names)}
        </div>
        {a.policy.active && (
          <button className="pill bad" style={{ height: 30, fontSize: 12 }} onClick={onRevoke} disabled={busy !== null}>Revoke</button>
        )}
      </div>
      <div className="key mono" title={a.key}>{shortKey(a.key)}</div>
      <div className="mode">{a.policy.active ? (paused ? "Paused by you" : modeOf(a.policy)) : "Revoked"}</div>
      <div className="budget">
        <div className="line">
          <span><strong>${toUsdc(a.remaining)}</strong> of ${toUsdc(daily)} left today</span>
          <span className="quiet">${toUsdc(a.policy.per_payment_cap)} per payment</span>
        </div>
        <div className="bar-track"><div className={`bar-fill ${share < 0.2 ? "warn" : ""}`} style={{ width: `${share * 100}%` }} /></div>
      </div>
      <div className="meta">
        {a.policy.allowlist.length > 0 ? (
          <div className="chips">{a.policy.allowlist.map((to) => <span className="chip mono" key={to}>{to}</span>)}</div>
        ) : (
          <span>Any recipient</span>
        )}
        {a.policy.cooldown_secs > 0 && <span>{a.policy.cooldown_secs}s between payments</span>}
        {expires && <span>until {expires.toLocaleString()}</span>}
      </div>
    </article>
  );
}
