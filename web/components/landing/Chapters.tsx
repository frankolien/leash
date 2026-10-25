// The product story after the hero: four chapters, copy on one side and a scene on the other,
// alternating. Geometry and type follow Altitude's body as PRYDD measured it.

import type { ReactNode } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { ApprovalsScene, KillScene, LimitsScene, PaymentsScene } from "./Scenes";
import styles from "./chapters.module.css";

export const CHAPTERS = [
  { id: "limits", label: "Limits" },
  { id: "payments", label: "Payments" },
  { id: "approvals", label: "Approvals" },
  { id: "kill-switch", label: "Kill switch" },
  { id: "faq", label: "FAQs" },
] as const;

function Chapter(props: { id: string; eyebrow: string; title: string; body: string; points: string[]; next: { href: string; label: string }; flip?: boolean; children: ReactNode }) {
  const { id, eyebrow, title, body, points, next, flip, children } = props;
  return (
    <section id={id} className={styles.row} data-flip={flip || undefined} aria-labelledby={`${id}-title`}>
      <div className={styles.copy}>
        <div className={styles.heading}><span className="eyebrow">{eyebrow}</span><h2 id={`${id}-title`}>{title}</h2></div>
        <div className={styles.body}>
          <p>{body}</p>
          <ul>{points.map((p) => <li key={p}><Check size={15} strokeWidth={1.6} aria-hidden="true" /><span>{p}</span></li>)}</ul>
          <a className="pill" href={next.href}>{next.label}<ArrowUpRight size={15} aria-hidden="true" /></a>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function Chapters() {
  return (
    <div className={styles.rows}>
      <Chapter
        id="limits"
        eyebrow="Limits"
        title="Each agent gets a budget, not your keys."
        body="Grant an agent its own key with a daily cap, a per-payment cap, the only accounts it may pay, a cooldown and an expiry."
        points={["A function-call key that can only pay, ask, or request.", "Limits live in a contract you own, not in a prompt.", "One policy per agent: claude and codex never share a budget."]}
        next={{ href: "#payments", label: "See a payment" }}
      >
        <LimitsScene />
      </Chapter>
      <Chapter
        id="payments"
        eyebrow="Payments"
        title="Inside its limits, the agent just pays."
        body="USDC leaves your vault for the recipient in about a second. Nothing for you to tap, and every payment is written to the log on chain."
        points={["The contract checks the caps, the recipient and the cooldown first.", "A refusal is an answer, not an error: the agent learns why.", "A transfer that fails comes back to the vault on its own."]}
        next={{ href: "#approvals", label: "When it asks" }}
        flip
      >
        <PaymentsScene />
      </Chapter>
      <Chapter
        id="approvals"
        eyebrow="Approvals"
        title="Above them, it asks you first."
        body="A payment over the cap waits as a request: who, how much, to whom and why. You approve exactly that payment, or let it expire."
        points={["Approving moves this payment only. The limits stay the same.", "Requests expire on their own after the window you choose.", "An agent can ask for a bigger budget in its own words."]}
        next={{ href: "#kill-switch", label: "Stopping an agent" }}
      >
        <ApprovalsScene />
      </Chapter>
      <Chapter
        id="kill-switch"
        eyebrow="Kill switch"
        title="One tap, and the key stops working."
        body="Pause every agent at once, or revoke one. Revoke deletes the key, so NEAR rejects its next call before your contract even runs."
        points={["Pause all is one call and undoes with resume.", "Revoke works at the protocol, not on trust.", "Your money stays in the vault; withdraw it any time."]}
        next={{ href: "#faq", label: "Questions" }}
        flip
      >
        <KillScene />
      </Chapter>
    </div>
  );
}
