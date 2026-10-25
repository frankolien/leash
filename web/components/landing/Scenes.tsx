// The four product scenes: white panels from the product laid over a photograph, each showing one
// thing the owner sees. Amounts and names are illustrative and match the hero's story: claude has
// $3 a day, pays $1, asks for $5, and one tap stops every key.

import { ArrowDownLeft, ArrowRight, ArrowUpRight, Check, KeyRound, X } from "lucide-react";
import styles from "./chapters.module.css";

function Mark() {
  return <span className={styles.mark} aria-hidden="true" />;
}

function Badge({ letter, tone = "blue" }: { letter: string; tone?: "blue" | "sand" }) {
  return <span className={styles.badge} data-tone={tone} aria-hidden="true">{letter}</span>;
}

export function LimitsScene() {
  return (
    <figure className={styles.stage} data-scene="meadow" aria-label="Illustrative policy: claude may spend 3 dollars a day, 2 per payment, to two recipients">
      <div className={styles.policyPanel}>
        <div className={styles.windowHeader}><span><Mark />New agent</span><span>USDC</span></div>
        <div className={styles.fieldGrid}>
          <div className={styles.field}><span className={styles.label}>Name</span><strong>claude</strong></div>
          <div className={styles.field}><span className={styles.label}>Daily cap</span><strong className="tabular">$3.00</strong></div>
          <div className={styles.field}><span className={styles.label}>Per payment</span><strong className="tabular">$2.00</strong></div>
          <div className={styles.field}><span className={styles.label}>Cooldown</span><strong>60 s</strong></div>
        </div>
        <div className={styles.recipients}><span className={styles.label}>Only to</span><div><span className="mono">vendor.near</span><span className="mono">frank.near</span></div></div>
      </div>
      <span className={styles.floatPill} data-at="top-right"><KeyRound size={14} /> Key can call pay, request</span>
      <div className={styles.legend}><span><b>01</b>You set limits</span><span><b>02</b>The agent gets a key</span><span><b>03</b>NEAR enforces both</span></div>
    </figure>
  );
}

export function PaymentsScene() {
  return (
    <figure className={styles.stage} data-scene="sky" aria-label="Illustrative activity: claude paid vendor.near 1 dollar and has 2 of 3 dollars left today">
      <div className={styles.accountPanel}>
        <div className={styles.windowHeader}><span><Mark />claude</span><span>Today</span></div>
        <div className={styles.accountMain}>
          <span className={styles.label}>Left today</span>
          <strong className={styles.bigAmount}>$2<span>.00</span></strong>
          <div className={styles.track}><span style={{ width: "66%" }} /></div>
          <small className={styles.trackNote}>of $3.00 · resets 24 hours after the first payment</small>
        </div>
        <div className={styles.activityHeader}><strong>Activity</strong><span>on chain</span></div>
        <div className={styles.record}><span className={styles.recordIcon} data-tone="good"><ArrowUpRight size={15} /></span><div><strong>claude paid vendor.near</strong><span>API credits · 14:02</span></div><b className="tabular">−$1.00</b></div>
        <div className={styles.record}><span className={styles.recordIcon}><ArrowDownLeft size={15} /></span><div><strong>You added money</strong><span>Vault · 13:40</span></div><b className="tabular">+$8.00</b></div>
      </div>
      <span className={styles.floatPill} data-at="top-left"><span className={styles.dotGood} /> Settled in about a second</span>
    </figure>
  );
}

export function ApprovalsScene() {
  return (
    <figure className={styles.stage} data-scene="shore" aria-label="Illustrative request: claude asks to pay vendor.near 5 dollars, over its per-payment cap">
      <Badge letter="C" />
      <Badge letter="X" tone="sand" />
      <div className={styles.requestPanel}>
        <div className={styles.requestHeader}><span>claude wants to pay</span><span className={styles.reason}>over per-payment cap</span></div>
        <div className={styles.requestAmount}><span className={styles.label}>Amount</span><strong className="tabular">$5<span>.00</span></strong></div>
        <div className={styles.requestTo}><span className={styles.label}>To</span><strong className="mono">vendor.near</strong></div>
        <p className={styles.memo}>“Monthly API plan, renews today.”</p>
        <div className={styles.track} data-tone="warn"><span style={{ width: "82%" }} /></div>
        <small className={styles.trackNote}>49 min left to decide</small>
        <div className={styles.requestButtons}><span className="pill">Deny</span><span className="pill primary"><Check size={15} />Approve</span></div>
      </div>
      <span className={styles.floatPill} data-at="bottom-left">Approves exactly this payment</span>
    </figure>
  );
}

export function KillScene() {
  return (
    <figure className={styles.stage} data-scene="ridge" aria-label="Illustrative kill switch: every agent paused, claude's key revoked">
      <div className={styles.switchPanel}>
        <span className={styles.switchIcon} aria-hidden="true"><X size={22} /></span>
        <span className={styles.label}>Kill switch</span>
        <strong>Paused</strong>
        <small>No agent can pay</small>
      </div>
      <div className={styles.agentsPanel}>
        <div className={styles.windowHeader}><span><Mark />Agents</span><span>2 keys</span></div>
        <div className={styles.agentRow}><span className={styles.statusDot} data-tone="bad" /><div><strong>claude</strong><span>Revoked · key deleted</span></div><b>Off</b></div>
        <div className={styles.agentRow}><span className={styles.statusDot} data-tone="warn" /><div><strong>codex</strong><span>Paused by you</span></div><b className="tabular">$1.00</b></div>
        <div className={styles.protocolNote}>The next call from claude is rejected by NEAR before the contract runs.</div>
      </div>
      <div className={styles.legendLine}>Pause all <ArrowRight size={12} aria-hidden="true" /> every key stops <ArrowRight size={12} aria-hidden="true" /> resume when ready</div>
    </figure>
  );
}
