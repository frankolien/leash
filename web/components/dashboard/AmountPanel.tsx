"use client";

// Asks how much to add or take back, in the side panel. It knows how much there is to move, so an
// amount that cannot go through is caught here, in words, before anything is signed; with nothing
// to move it shows how to get some instead.

import { useState, type ReactNode } from "react";
import { toUnits, toUsdc } from "@/lib/format";
import SidePanel from "./SidePanel";
import styles from "./dashboard.module.css";

export type AmountAsk = {
  title: string;
  hint: string;
  detail?: ReactNode;
  confirm: string;
  initial: string;
  /// Most that can move, in USDC units, and where it sits, for the note when an amount is too big.
  max: bigint;
  source: string;
  /// Shown instead of the amount when max is zero.
  empty: ReactNode;
  onConfirm: (usdc: string) => void;
};

function units(value: string): bigint | null {
  try {
    return toUnits(value);
  } catch {
    return null;
  }
}

export default function AmountPanel({ ask, onClose }: { ask: AmountAsk; onClose: () => void }) {
  const [value, setValue] = useState(ask.initial);
  const amount = units(value);
  const over = amount !== null && amount > ask.max;
  const valid = amount !== null && amount > BigInt(0) && !over;

  return (
    <SidePanel title={ask.title} onClose={onClose}>
      {ask.max === BigInt(0) ? ask.empty : (
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
          <label className={styles.amountField} data-over={over || undefined}>
            <span>$</span>
            <input autoFocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Amount in USDC" aria-describedby="amount-note" />
            <small>USDC</small>
          </label>
          <div className={styles.amountNote} id="amount-note">
            <span>{over ? `Only $${toUsdc(ask.max)} ${ask.source}.` : `$${toUsdc(ask.max)} ${ask.source}`}</span>
            <button type="button" className={styles.sectionLink} onClick={() => setValue(toUsdc(ask.max))}>Use all</button>
          </div>
          {ask.detail}
          <div className={styles.dialogActions}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn ink" disabled={!valid}>{ask.confirm}</button>
          </div>
        </form>
      )}
    </SidePanel>
  );
}
