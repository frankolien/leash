"use client";

// The on-chain log, newest first: an icon for what happened, one line, when, and the amount.
// A refusal's amount is struck through, because nothing moved.

import { ArrowDownLeft, ArrowUpRight, Ban, Check, Clock, KeyRound, MessageCircleQuestion, Minus, Pause, Play, RotateCcw } from "lucide-react";
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

export default function ActivityCard({ log, names, limit, full }: { log: LogEntry[]; names: Names; limit?: number; full?: boolean }) {
  const rows = limit ? log.slice(0, limit) : log;
  return (
    <section className={`${styles.card} ${styles.activityCard}`} data-full={full || undefined} aria-label="Activity">
      <CardHead title="Activity" aside={full ? <span className={styles.muted}>Last {log.length} on chain</span> : <a className={styles.link} href="#activity">All activity</a>} />
      {rows.length === 0 && <p className={styles.muted}>Nothing yet. The first payment, refusal or request lands here.</p>}
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
  );
}
