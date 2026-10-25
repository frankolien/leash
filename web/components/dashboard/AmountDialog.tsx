"use client";

// Asks how much to add or take back. A native dialog, so focus, Escape and the backdrop behave as
// the platform expects.

import { useEffect, useRef, useState } from "react";
import styles from "./dashboard.module.css";

export type AmountAsk = { title: string; hint: string; confirm: string; initial: string; onConfirm: (usdc: string) => void };

export default function AmountDialog({ ask, onClose }: { ask: AmountAsk | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (ask) {
      setValue(ask.initial);
      if (!d.open) d.showModal();
    } else if (d.open) d.close();
  }, [ask]);

  const valid = /^\d+(\.\d{1,6})?$/.test(value.trim()) && Number(value) > 0;
  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      {ask && (
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            ask.onConfirm(value.trim());
            onClose();
          }}
        >
          <h2>{ask.title}</h2>
          <p>{ask.hint}</p>
          <label className={styles.amountField}>
            <span>$</span>
            <input autoFocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Amount in USDC" />
            <small>USDC</small>
          </label>
          <div className={styles.dialogActions}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn ink" disabled={!valid}>{ask.confirm}</button>
          </div>
        </form>
      )}
    </dialog>
  );
}
