"use client";

// Asks how much to add or take back, in the side panel.

import { useState, type ReactNode } from "react";
import SidePanel from "./SidePanel";
import styles from "./dashboard.module.css";

export type AmountAsk = { title: string; hint: string; detail?: ReactNode; confirm: string; initial: string; onConfirm: (usdc: string) => void };

export default function AmountPanel({ ask, onClose }: { ask: AmountAsk; onClose: () => void }) {
  const [value, setValue] = useState(ask.initial);
  const valid = /^\d+(\.\d{1,6})?$/.test(value.trim()) && Number(value) > 0;

  return (
    <SidePanel title={ask.title} onClose={onClose}>
      <form
        className={styles.amountForm}
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          ask.onConfirm(value.trim());
          onClose();
        }}
      >
        <p className={styles.panelHint}>{ask.hint}</p>
        <label className={styles.amountField}>
          <span>$</span>
          <input autoFocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Amount in USDC" />
          <small>USDC</small>
        </label>
        {ask.detail}
        <div className={styles.dialogActions}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn ink" disabled={!valid}>{ask.confirm}</button>
        </div>
      </form>
    </SidePanel>
  );
}
