"use client";

// The on-chain log, newest first: an icon for what happened, one line, when, and the amount.
// A refusal's amount is struck through, because nothing moved.

import { useState } from "react";
import { Search, ArrowDownLeft, ArrowUpRight, Ban, Check, Clock, KeyRound, MessageCircleQuestion, Minus, Pause, Play, RotateCcw } from "lucide-react";
import { DETAIL_IN_TITLE, describe, type Icon } from "@/lib/activity";
import { agentLabel, msOf, toUsdc } from "@/lib/format";
import type { LogEntry, Names } from "@/lib/types";
import { CardHead } from "./parts";
import styles from "./dashboard.module.css";

const ICONS: Record<Icon, typeof Check> = {
  out: ArrowUpRight, in: ArrowDownLeft, back: RotateCcw, refused: Ban, ask: MessageCircleQuestion,
  check: Check, minus: Minus, clock: Clock, key: KeyRound, pause: Pause, play: Play,
};

function when(at: number): string {
  const ms = msOf(at);
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const FILTERS = {
  all: { label: "All", match: () => true },
  payments: { label: "Payments", match: (e: LogEntry) => ["pay", "request_approved", "pay_failed", "deposit", "withdraw"].includes(e.event) },
  refusals: { label: "Refusals", match: (e: LogEntry) => e.event === "pay_refused" },
  requests: { label: "Requests", match: (e: LogEntry) => e.event.startsWith("request_") || e.event.startsWith("proposal_") },
  changes: { label: "Changes", match: (e: LogEntry) => ["policy_set", "policy_revoked", "paused", "resumed"].includes(e.event) },
} as const;
type Filter = keyof typeof FILTERS;

export default function ActivityCard({ log, names, limit, full }: { log: LogEntry[]; names: Names; limit?: number; full?: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = full
    ? log.filter((e) => FILTERS[filter].match(e) && (!q || describe(e, e.key ? agentLabel(e.key, names) : "you").title.toLowerCase().includes(q)))
    : log;
  const rows = limit ? filtered.slice(0, limit) : filtered;
  return (
    <>
    {full && (
      <div className={styles.toolbar}>
        <label className={styles.search}><Search size={17} aria-hidden="true" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search activity" aria-label="Search activity" /></label>
        <div className={styles.chips} role="group" aria-label="Show">
          {(Object.keys(FILTERS) as Filter[]).map((f) => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{FILTERS[f].label}</button>)}
        </div>
      </div>
    )}
    <section className={`${styles.card} ${styles.activityCard}`} data-full={full || undefined} aria-label="Activity">
      {!full && <CardHead title="Activity" aside={<a className={styles.link} href="#activity">All activity</a>} />}
      {rows.length === 0 && <p className={styles.muted}>{log.length ? "Nothing matches." : "Nothing yet. The first payment, refusal or request lands here."}</p>}
      {rows.map((e, i) => {
        const who = e.key ? agentLabel(e.key, names) : "you";
        const { tone, icon, title } = describe(e, who);
        const Glyph = ICONS[icon];
        const detail = e.detail && !DETAIL_IN_TITLE.has(e.event) ? ` · ${e.detail}` : "";
        const out = e.event === "pay" || e.event === "withdraw" || e.event === "request_approved";
        const refused = e.event === "pay_refused";
        return (
          <div key={`${e.at}-${i}`} className={styles.feedRow}>
            <span className={styles.feedIcon} data-bad={tone === "bad" || undefined}><Glyph size={14} /></span>
            <span className={styles.feedTitle}>{title}<small>{when(e.at)}{full ? detail : ""}</small></span>
            <b data-refused={refused || undefined}>{e.amount ? `${out ? "−" : e.event === "deposit" ? "+" : ""}$${toUsdc(e.amount)}` : ""}</b>
          </div>
        );
      })}
    </section>
    </>
  );
}
