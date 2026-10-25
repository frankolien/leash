"use client";

// The log, newest first. One row per on-chain event: an icon toned by meaning, a line, a time, and
// the amount on the right.

import { ArrowDownLeft, ArrowUpRight, Ban, Check, Clock, KeyRound, Minus, Pause, Play, RotateCcw, MessageCircleQuestion } from "lucide-react";
import { DETAIL_IN_TITLE, describe, type Icon } from "@/lib/activity";
import { agentLabel, msOf, toUsdc } from "@/lib/format";
import type { LogEntry, Names } from "@/lib/types";
import styles from "./dashboard.module.css";

const ICONS: Record<Icon, typeof Check> = {
  out: ArrowUpRight, in: ArrowDownLeft, back: RotateCcw, refused: Ban, ask: MessageCircleQuestion,
  check: Check, minus: Minus, clock: Clock, key: KeyRound, pause: Pause, play: Play,
};

export default function Activity({ log, names }: { log: LogEntry[]; names: Names }) {
  if (log.length === 0) return <p className={styles.note}>Nothing yet. The first payment, refusal or request lands here.</p>;
  return <div className={styles.rows}>{log.map((e, i) => <Row key={`${e.at}-${i}`} entry={e} names={names} />)}</div>;
}

function Row({ entry: e, names }: { entry: LogEntry; names: Names }) {
  const who = e.key ? agentLabel(e.key, names) : "you";
  const { tone, icon, title } = describe(e, who);
  const Glyph = ICONS[icon];
  const when = new Date(msOf(e.at)).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const detail = e.detail && !DETAIL_IN_TITLE.has(e.event) ? ` · ${e.detail}` : "";
  const outgoing = e.event === "pay" || e.event === "withdraw" || e.event === "request_approved";
  return (
    <div className={styles.row}>
      <span className={styles.rowIcon} data-tone={tone || undefined}><Glyph size={15} /></span>
      <div><strong>{title}</strong><span>{when}{detail}</span></div>
      <b className="tabular" data-muted={e.event === "pay_refused" || undefined}>{e.amount ? `${outgoing ? "−" : e.event === "deposit" ? "+" : ""}$${toUsdc(e.amount)}` : ""}</b>
    </div>
  );
}
