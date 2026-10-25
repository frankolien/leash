"use client";

// What sits in the owner's own account, ready to go into the vault, and where to send more.

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toUsdc } from "@/lib/format";
import styles from "./dashboard.module.css";

export default function DepositDetail({ owner, held }: { owner: string; held: bigint }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.depositDetail}>
      <div><span className={styles.muted}>In your account</span><b className="tabular">${toUsdc(held)} USDC</b></div>
      <div className={styles.address}>
        <span className={styles.muted}>Send USDC on NEAR to</span>
        <button onClick={async () => { await navigator.clipboard.writeText(owner); setCopied(true); setTimeout(() => setCopied(false), 1500); }} aria-label="Copy your account">
          <span className="mono">{owner}</span>{copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}
