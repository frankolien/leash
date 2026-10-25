// What the film closes into: the Leash dashboard itself, as an app window. Sidebar, the vault with
// the week's spending, the payment waiting on the owner, each agent's budget, and the activity
// feed. Illustrative figures; the live one runs on NEAR testnet.

import { forwardRef } from "react";
import { Activity, ArrowDownLeft, ArrowUpRight, Ban, Bell, Check, KeyRound, LayoutGrid, Pause, Plus, Settings, SquareTerminal, Users } from "lucide-react";
import { siClaude, siCursor } from "simple-icons";
import styles from "./dashboard-scene.module.css";

const WEEK = [1.2, 3.4, 2.1, 4.8, 3.9, 6.4, 5.1];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Logo({ path, size = 16 }: { path: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d={path} fill="currentColor" /></svg>;
}

/// The week's spending as an area chart: one scale for line, fill and labels, the last day marked.
function Spend() {
  const w = 300, h = 96, pad = 6, max = 8;
  const x = (i: number) => pad + (i * (w - pad * 2)) / (WEEK.length - 1);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const line = WEEK.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(WEEK.length - 1)},${h - pad} L${x(0)},${h - pad} Z`;
  const last = WEEK.length - 1;
  return (
    <figure className={styles.chart} aria-label="Spent by agents this week, highest on Saturday at $6.40">
      <div className={styles.plot}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs><linearGradient id="spendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#111312" stopOpacity=".14" /><stop offset="1" stopColor="#111312" stopOpacity="0" /></linearGradient></defs>
        {[2, 4, 6].map((g) => <line key={g} x1={pad} x2={w - pad} y1={y(g)} y2={y(g)} stroke="#111312" strokeOpacity=".06" />)}
        <path d={area} fill="url(#spendFill)" />
        <path d={line} fill="none" stroke="#111312" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      {/* The chart stretches to fill the card, so the endpoint is drawn outside the SVG to stay round. */}
      <span className={styles.endpoint} style={{ left: `${(x(last) / w) * 100}%`, top: `${(y(WEEK[last]) / h) * 100}%` }} />
      </div>
      <figcaption>{DAYS.map((d) => <span key={d}>{d}</span>)}</figcaption>
    </figure>
  );
}

const AGENTS = [
  { name: "claude", icon: <Logo path={siClaude.path} />, mode: "Up to $2, then asks", left: 2, cap: 3, state: "Active" },
  { name: "codex", icon: <SquareTerminal size={16} />, mode: "Pays up to $5", left: 3.6, cap: 10, state: "Active" },
  { name: "cursor", icon: <Logo path={siCursor.path} />, mode: "Asks every time", left: 0, cap: 0, state: "Revoked" },
];

const FEED = [
  { icon: <ArrowUpRight size={14} />, title: "claude paid vendor.near", when: "2 min ago", amount: "−$1.00" },
  { icon: <Ban size={14} />, title: "Refused codex: over its daily limit", when: "18 min ago", amount: "$12.00", refused: true },
  { icon: <KeyRound size={14} />, title: "You revoked cursor", when: "1 h ago", amount: "" },
  { icon: <ArrowDownLeft size={14} />, title: "You added to the vault", when: "Today, 09:12", amount: "+$50.00" },
];

export const DashboardScene = forwardRef<HTMLDivElement>(function DashboardScene(_, ref) {
  return (
    <div ref={ref} className={styles.window} role="img" aria-label="The Leash dashboard: a $184.20 vault, a $5 payment waiting for approval, three agents and recent activity">
      <aside className={styles.sidebar}>
        <span className={`wordmark ${styles.brand}`}><span className="mark" aria-hidden="true" />Leash</span>
        <nav>
          <span data-on><LayoutGrid size={16} />Overview</span>
          <span><Users size={16} />Agents</span>
          <span><Bell size={16} />Approvals<em>1</em></span>
          <span><Activity size={16} />Activity</span>
          <span><Settings size={16} />Settings</span>
        </nav>
        <div className={styles.account}><img src="/people/hero.jpg" alt="" /><span>maya.near<small>Testnet</small></span></div>
      </aside>

      <div className={styles.main}>
        <header className={styles.top}>
          <div><span className={styles.muted}>Saturday</span><strong>Good evening, Maya</strong></div>
          <div className={styles.topActions}><span className={styles.ghost}><Pause size={14} />Pause all</span><span className={styles.ink}><Plus size={14} />Add money</span></div>
        </header>

        <section className={`${styles.card} ${styles.vault}`}>
          <div>
            <span className={styles.muted}>Vault balance</span>
            <strong className={styles.balance}>$184<span>.20</span></strong>
            <span className={styles.sub}>USDC on NEAR</span>
            <div className={styles.today}><span>Spent today</span><b>$6.40</b><span>of $18 across agents</span></div>
          </div>
          <Spend />
        </section>

        <section className={`${styles.card} ${styles.approval}`}>
          <div className={styles.cardHead}><span className={styles.who}><span className={styles.agentIcon}><Logo path={siClaude.path} size={14} /></span>claude wants to pay</span><span className={styles.reason}>over $2 limit</span></div>
          <strong className={styles.amount}>$5<span>.00</span></strong>
          <span className={styles.sub}>to <span className="mono">vendor.near</span></span>
          <p className={styles.memo}>“Monthly API plan, renews today.”</p>
          <dl className={styles.facts}>
            <div><dt>claude may pay alone</dt><dd>up to $2.00</dd></div>
            <div><dt>Left today</dt><dd>$2.00 of $3.00</dd></div>
            <div><dt>vendor.near</dt><dd>On its list</dd></div>
            <div><dt>Approving</dt><dd>This payment only</dd></div>
          </dl>
          <div className={styles.timer}><span style={{ width: "72%" }} /></div>
          <span className={styles.muted}>43 min left to decide</span>
          <div className={styles.decide}><span className={styles.ghost}>Deny</span><span className={styles.ink}><Check size={14} />Approve</span></div>
        </section>

        <section className={`${styles.card} ${styles.agents}`}>
          <div className={styles.cardHead}><strong>Agents</strong><span className={styles.muted}>Limits reset daily</span></div>
          {AGENTS.map((a) => (
            <div key={a.name} className={styles.agentRow} data-off={a.state !== "Active" || undefined}>
              <span className={styles.agentIcon}>{a.icon}</span>
              <span className={styles.agentName}>{a.name}<small>{a.mode}</small></span>
              <span className={styles.budget}>
                {a.cap ? <><span><b>${a.left.toFixed(2)}</b> of ${a.cap}</span><span className={styles.bar}><span style={{ width: `${(a.left / a.cap) * 100}%` }} /></span></> : <span>Key deleted</span>}
              </span>
              <span className={styles.state}>{a.state}</span>
            </div>
          ))}
          <div className={styles.addRow}><span className={styles.addIcon}><Plus size={14} /></span>Add an agent<span className={styles.muted}>leash grant</span></div>
        </section>

        <section className={`${styles.card} ${styles.feed}`}>
          <div className={styles.cardHead}><strong>Activity</strong><span className={styles.muted}>On chain</span></div>
          {FEED.map((f) => (
            <div key={f.title} className={styles.feedRow}>
              <span className={styles.feedIcon} data-refused={f.refused || undefined}>{f.icon}</span>
              <span className={styles.feedTitle}>{f.title}<small>{f.when}</small></span>
              <b data-refused={f.refused || undefined}>{f.amount}</b>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
});
