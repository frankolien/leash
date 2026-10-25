"use client";

// Connecting an agent, the way the owner thinks of it: pick the assistant you already use.

import { SquareTerminal } from "lucide-react";
import { siClaude, siCursor } from "simple-icons";
import type { Agent as SetupAgent } from "@/components/setup/agents";
import styles from "./dashboard.module.css";

const OPTIONS: { agent: SetupAgent; label: string; icon: React.ReactNode }[] = [
  { agent: "claude", label: "Connect Claude Code", icon: <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d={siClaude.path} fill="currentColor" /></svg> },
  { agent: "codex", label: "Connect Codex", icon: <SquareTerminal size={17} aria-hidden="true" /> },
  { agent: "cursor", label: "Connect Cursor", icon: <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d={siCursor.path} fill="currentColor" /></svg> },
];

export default function ConnectCard({ onPick }: { onPick: (a: SetupAgent) => void }) {
  return (
    <section className={`${styles.card} ${styles.connect}`} aria-label="Connect an agent">
      <strong>Connect an agent</strong>
      <span className={styles.muted}>Give the assistant you already use its own key and limits. Any MCP client works the same way.</span>
      <div className={styles.connectOptions}>
        {OPTIONS.map((o) => <button key={o.agent} onClick={() => onPick(o.agent)}>{o.icon}{o.label}</button>)}
      </div>
    </section>
  );
}
