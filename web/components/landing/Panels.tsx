// What the film closes into: three panels from the product, the vault in the middle. Layout follows
// PRYDD's three-panel scene; the content is Leash's own: set a limit, the vault and what moved, and
// a payment above the limit waiting for one tap.

import { forwardRef } from "react";
import { ArrowRight, Check, KeyRound } from "lucide-react";
import { siClaude } from "simple-icons";
import styles from "./sequence.module.css";

function ClaudeAvatar({ size }: { size: number }) {
  return (
    <span className={styles.claude} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5}><path d={siClaude.path} fill="currentColor" /></svg>
    </span>
  );
}

export function PanelsHeading() {
  return (
    <div className={styles.heading}>
      <span>Everything your agents may spend. One place.</span>
      <h2 className="display">You hold the leash.</h2>
    </div>
  );
}

export function LimitCard() {
  return (
    <>
      <span className={styles.cardTitle}>Set a limit</span>
      <div className={styles.flow}><span className={styles.soft}><KeyRound size={28} strokeWidth={1.6} /></span><ArrowRight size={20} /><span className={styles.dark}>$3</span></div>
      <p className={styles.small}>Agent key <ArrowRight size={13} /> $3 a day</p>
    </>
  );
}

export const VaultCard = forwardRef<HTMLDivElement>(function VaultCard(_, ref) {
  return (
    <div ref={ref} className={styles.vaultInner}>
      <span className={styles.cardTitle}>Your vault</span>
      <span className={styles.label}>USDC balance</span>
      <strong className={styles.balance}>$184<span>.20</span></strong>
      <div className={styles.rows}>
        <div><img src="/people/hero.jpg" alt="" className={styles.avatar} /><span>You added<small>Vault, today</small></span><b>+$50.00</b></div>
        <div><ClaudeAvatar size={38} /><span>claude paid vendor.near<small>API credits, today</small></span><b>−$1.00</b></div>
      </div>
    </div>
  );
});

export function ApproveCard() {
  return (
    <>
      <span className={styles.cardTitle}>Above the limit</span>
      <ClaudeAvatar size={64} />
      <strong className={styles.who}>claude asks</strong>
      <div className={styles.pill}><span>$5.00</span><span className={styles.check} aria-label="Approve"><Check size={20} /></span></div>
    </>
  );
}
