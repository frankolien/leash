// The owner's side, shown as the dashboard's own pieces laid on a desk: the vault, an agent's day,
// and the request waiting for a decision.

import { ArrowUpRight, Check } from "lucide-react";
import styles from "./sections.module.css";

export default function YourSide() {
  return (
    <section id="dashboard" className={styles.side} aria-labelledby="side-title">
      <div className={`${styles.shell} ${styles.sideGrid}`}>
        <div className={styles.sideCopy}>
          <span className="tag">The dashboard</span>
          <h2 id="side-title" className="display">Your side of the leash.</h2>
          <p>Everything your agents may spend, what they spent, and what is waiting on you. Anyone can read it. Only your wallet can approve, pause or revoke.</p>
          <ul>
            <li>Approve or deny a payment in one tap.</li>
            <li>Pause every agent at once.</li>
            <li>See each payment and refusal as it lands on chain.</li>
          </ul>
          <a className="btn line" href="/frankolien.testnet">Open the live testnet dashboard <ArrowUpRight size={16} /></a>
        </div>
        <div className={styles.desk}>
          <img src="/people/desk.jpg" alt="" loading="lazy" />
          <div className={styles.vaultCard}>
            <span className={styles.small}>Vault</span>
            <strong className="tabular">$184<span>.20</span></strong>
            <span className={styles.small}>USDC your agents can spend from</span>
          </div>
          <div className={styles.agentCard}>
            <div className={styles.agentHead}><span className={styles.initial}>C</span><div><strong>claude</strong><span>Pays on its own up to $2</span></div></div>
            <div className={styles.budget}><strong className="tabular">$2.00</strong><span>of $3.00 left today</span></div>
            <div className={styles.bar}><span style={{ width: "66%" }} /></div>
          </div>
          <div className={styles.requestCard}>
            <span className={styles.small}>claude wants to pay</span>
            <strong className="tabular">$5.00 <em>to vendor.near</em></strong>
            <div className={styles.decide}><span>Deny</span><span className={styles.yes}><Check size={14} /> Approve</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}
