"use client";

// Payments waiting for the owner arrive as a pop-up over whatever page is open. The live poll
// brings each new request in; approving or denying it shows the next one. "Later" snoozes the
// queue until the owner opens it again from the header, and the tab title carries the count.

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Agent, Names, Request } from "@/lib/types";
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

export default function ApprovalPopup(props: { request: Request | null; total: number; agents: Agent[]; names: Names; now: number; busy: string | null; onApprove: (r: Request) => void; onDeny: (r: Request) => void; onLater: () => void }) {
  const { request: r, total, agents, names, now, busy, onApprove, onDeny, onLater } = props;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (r && !d.open) d.showModal();
    if (!r && d.open) d.close();
  }, [r]);
  return (
    <dialog ref={ref} className={styles.approvalDialog} onCancel={(e) => { e.preventDefault(); onLater(); }} aria-label="Payment waiting for approval">
      {r && (
        <>
          <div className={styles.popupBar}>
            <span>{total > 1 ? `1 of ${total} waiting` : "Waiting for you"}</span>
            <button onClick={onLater} aria-label="Decide later"><X size={18} /></button>
          </div>
          <ApprovalCard key={r.id} request={r} agent={agents.find((a) => a.key === r.key)} names={names} now={now} busy={busy} onApprove={() => onApprove(r)} onDeny={() => onDeny(r)} />
          <button className={styles.laterButton} onClick={onLater}>Decide later</button>
        </>
      )}
    </dialog>
  );
}
