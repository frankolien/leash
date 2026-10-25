// After the chapters: where Leash plugs in, the questions people ask, and the way in.

import { ChevronDown, SquareTerminal, Wallet, Bot } from "lucide-react";
import OpenForm from "./OpenForm";
import styles from "./closing.module.css";

export function WorksWith() {
  return (
    <section className={styles.worksSection} aria-labelledby="works-title">
      <div className={styles.shell}>
        <div className={styles.worksSplit}>
          <div className={styles.worksPhoto}><h2 id="works-title">Works with the agents you already run.</h2></div>
          <ul className={styles.worksList}>
            <li><Bot size={22} strokeWidth={1.5} aria-hidden="true" /><div><h3>Claude Code and Codex</h3><p>An MCP server with six tools: status, preflight, pay, request, ask for more, and history. Every answer says plainly whether money moved.</p></div></li>
            <li><SquareTerminal size={22} strokeWidth={1.5} aria-hidden="true" /><div><h3>Anything with a shell</h3><p>The <span className="mono">leash</span> CLI grants and revokes keys, approves requests and reads the log.</p></div></li>
            <li><Wallet size={22} strokeWidth={1.5} aria-hidden="true" /><div><h3>Your own wallet</h3><p>Approve, pause and revoke from the dashboard with any NEAR wallet. No account with us.</p></div></li>
          </ul>
        </div>
      </div>
    </section>
  );
}

const QUESTIONS = [
  { q: "What is Leash?", a: "A contract on NEAR that holds USDC for you and lets each AI agent spend it under limits you set: a daily cap, a per-payment cap, the accounts it may pay, a cooldown and an expiry." },
  { q: "Who holds the money?", a: "You do. The vault is a contract on your own account, leash.<you>. You can withdraw at any time. An agent's key can only call pay, request and ask for more." },
  { q: "What stops an agent from overspending?", a: "Two layers. NEAR lets the agent's key call only those three methods on that one contract, and the contract checks every payment against the policy before any token moves." },
  { q: "What happens above the limit?", a: "The payment waits as a request. You see who, how much, to whom and why, and approve or deny it before the window closes. An hour by default; you choose." },
  { q: "How fast is revoke?", a: "Immediate. Revoke deletes the agent's key, so its next call is rejected by the protocol before the contract runs." },
  { q: "Is it live?", a: "On NEAR testnet today with Circle's test USDC. Mainnet follows in November 2026." },
];

export function Questions() {
  return (
    <section id="faq" className={styles.faqSection} aria-labelledby="faq-title">
      <div className={styles.faqInner}>
        <div className={styles.faqIntro}>
          <h2 id="faq-title">Frequently<br />asked questions</h2>
          <p>About the vault, the limits and what an agent can and cannot do.</p>
          <a className="pill" href="#open">Open a dashboard</a>
        </div>
        <div>
          {QUESTIONS.map(({ q, a }) => (
            <details key={q} className={styles.question}>
              <summary>{q}<ChevronDown size={18} aria-hidden="true" /></summary>
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
    <section id="open" className={styles.invitation} aria-labelledby="open-title">
      <div className={styles.invitationInner}>
        <h2 id="open-title">Give your agents a budget, not your wallet.</h2>
        <OpenForm />
      </div>
    </section>
  );
}
