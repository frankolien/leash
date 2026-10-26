"use client";

// Payments waiting for the owner open a panel on the right of the app, on whatever page is open,
// and only while one is waiting. The live poll brings each new request in; approving or denying it
// shows the next. Closing the panel snoozes the queue until the owner reopens it from the header,
// and the tab title carries the count.

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Agent, LogEntry, Names, Network, Request } from "@/lib/types";
import ApprovalCard from "./ApprovalCard";
import styles from "./dashboard.module.css";

export function useApprovalQueue(requests: Request[] | undefined) {
  const [snoozed, setSnoozed] = useState<Set<number>>(new Set());
  const pending = useMemo(() => requests ?? [], [requests]);
  const next = pending.find((r) => !snoozed.has(r.id)) ?? null;

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = pending.length ? `(${pending.length}) ${base}` : base;
  }, [pending.length]);

  return {
    pending,
    next,
    later: () => setSnoozed(new Set(pending.map((r) => r.id))),
    reopen: () => setSnoozed(new Set()),
  };
}

export default function ApprovalPanel(props: { request: Request; total: number; agents: Agent[]; log: LogEntry[]; network: Network; names: Names; now: number; busy: string | null; onApprove: (r: Request) => void; onDeny: (r: Request) => void; onClose: () => void }) {
  const { request: r, total, agents, log, network, names, now, busy, onApprove, onDeny, onClose } = props;
  return (
    <aside className={styles.approvalPanel} aria-label="Payment waiting for approval">
      <div className={styles.panelBar}>
        <span>{total > 1 ? `1 of ${total} waiting` : "Waiting for you"}</span>
        <button onClick={onClose} aria-label="Hide until later"><X size={17} /></button>
      </div>
      <ApprovalCard key={r.id} request={r} agent={agents.find((a) => a.key === r.key)} log={log} network={network} names={names} now={now} busy={busy} onApprove={() => onApprove(r)} onDeny={() => onDeny(r)} />
    </aside>
  );
}
