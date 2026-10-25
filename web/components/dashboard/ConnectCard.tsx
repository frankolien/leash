"use client";

// Connecting an agent, the way the owner thinks of it: pick the assistant you already use.

import type { Agent as SetupAgent } from "@/components/setup/agents";
import { BrandLogo } from "./AgentIcon";
import styles from "./dashboard.module.css";

const OPTIONS: { agent: SetupAgent; label: string; logo: string }[] = [
  { agent: "claude", label: "Connect with Claude Code", logo: "claude" },
  { agent: "codex", label: "Connect with Codex", logo: "codex" },
  { agent: "cursor", label: "Connect with Cursor", logo: "cursor" },
];

export default function ConnectCard({ onPick }: { onPick: (a: SetupAgent) => void }) {
  return (
    <section className={`${styles.card} ${styles.connect}`} aria-label="Connect an agent">
      <strong>Connect an agent</strong>
      <span className={styles.muted}>Give the assistant you already use its own key and limits.</span>
      <div className={styles.connectOptions}>
        {OPTIONS.map((o) => <button key={o.agent} className={styles.white} onClick={() => onPick(o.agent)}><span className={styles.darkLogo}><BrandLogo name={o.logo} size={18} /></span>{o.label}</button>)}
      </div>
    </section>
  );
}
