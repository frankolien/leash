// Questions, then the way in over a photograph.

import { Plus } from "lucide-react";
import OpenForm from "./OpenForm";
import styles from "./sections.module.css";

const QUESTIONS = [
  { q: "What is Leash?", a: "A contract on NEAR that holds USDC for you and lets each AI agent spend it under limits you set: a daily cap, a per-payment cap, the accounts it may pay, a cooldown and an expiry." },
  { q: "Who holds the money?", a: "You do. The vault is a contract on your own account, leash.<you>. You can withdraw at any time. An agent's key can only call pay, request and ask for more." },
  { q: "What stops an agent from overspending?", a: "Two layers. NEAR lets the agent's key call only those three methods on that one contract, and the contract checks every payment against the limits before any token moves." },
  { q: "What happens above the limit?", a: "The payment waits as a request. You see who, how much, to whom and why, and approve or deny it before the window closes. An hour by default; you choose." },
  { q: "How fast is revoke?", a: "Immediate. Revoke deletes the agent's key, so its next call is rejected by the protocol before the contract runs." },
  { q: "Is it live?", a: "On NEAR testnet today with Circle's test USDC. Mainnet follows in November 2026." },
];

export function Questions() {
  return (
    <section id="faq" className={styles.faq} aria-labelledby="faq-title">
      <div className={`${styles.shell} ${styles.faqGrid}`}>
        <h2 id="faq-title" className="display">Questions people ask first.</h2>
        <div className={styles.faqList}>
          {QUESTIONS.map(({ q, a }) => (
            <details key={q}>
              <summary>{q}<Plus size={18} aria-hidden="true" /></summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Invitation() {
  return (
    <section id="open" className={styles.invite} aria-labelledby="open-title">
      <img src="/people/closing.jpg" alt="" loading="lazy" />
      <div className={styles.inviteScrim} aria-hidden="true" />
      <div className={`${styles.shell} ${styles.inviteInner}`}>
        <h2 id="open-title" className="display">Give your agent a budget, not your wallet.</h2>
        <div className={styles.inviteActions}>
          <a className="btn light" href="/app">Get started with Google, Apple or email</a>
          <OpenForm />
        </div>
      </div>
    </section>
  );
}
