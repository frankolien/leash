// How the leash holds, as the four things that happen in order. Each step has a small turning
// figure: the box of limits, the one piece handed to the agent, the checks it passes through, and
// the empty slot after a revoke.

import Wireframe, { type Figure } from "./Wireframe";
import styles from "./sections.module.css";

const STEPS: { figure: Figure; title: string; body: string; label: string }[] = [
  { figure: "limits", title: "You set the limits.", body: "A daily cap, a per-payment cap, who it may pay, how often, and until when.", label: "A block of eight cubes inside a green frame" },
  { figure: "key", title: "The agent gets one key.", body: "A NEAR key that can only call pay, request and ask for more. Never your account.", label: "One green cube lifting out of the block" },
  { figure: "checks", title: "Every payment is checked.", body: "Your contract checks the limits before any USDC moves. Above them, it asks you.", label: "Three layers with the middle one in green" },
  { figure: "revoke", title: "Revoke, and it is gone.", body: "Revoking deletes the key. NEAR rejects its next call before your contract runs.", label: "The block with one cube fading away" },
];

export default function HowItHolds() {
  return (
    <section id="how" className={styles.how} aria-labelledby="how-title">
      <div className={styles.shell}>
        <div className={styles.lead}>
          <h2 id="how-title" className="display">The leash is a contract, not a promise.</h2>
          <p>Limits are not instructions in a prompt that a model can talk its way around. They live in a contract on your own NEAR account, and the chain enforces them.</p>
        </div>
        <ol className={styles.steps}>
          {STEPS.map((s, i) => (
            <li key={s.figure}>
              <span className={styles.stepNum}>{String(i + 1).padStart(2, "0")}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              <div className={styles.figure}><Wireframe figure={s.figure} label={s.label} /></div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
