"use client";

// Four steps to connect an agent, opened from the header shortcuts. A native dialog, so focus,
// Escape and the backdrop behave as the platform expects.

import { useEffect, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { AGENTS, steps, type Agent } from "./agents";
import styles from "./setup.module.css";

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.code}>
      <pre>{code}</pre>
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy"}
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
}

export default function SetupDialog({ agent, onClose, onSwitch }: { agent: Agent | null; onClose: () => void; onSwitch: (a: Agent) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (agent && !d.open) d.showModal();
    if (!agent && d.open) d.close();
  }, [agent]);

  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-labelledby="setup-title">
      {agent && (
        <div className={styles.body}>
          <div className={styles.head}>
            <h2 id="setup-title" className="display">Put {AGENTS[agent].label} on a leash</h2>
            <button className={styles.close} onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
          <div className={styles.switch} role="tablist" aria-label="Agent">
            {(Object.keys(AGENTS) as Agent[]).map((a) => (
              <button key={a} role="tab" aria-selected={a === agent} onClick={() => onSwitch(a)}>{AGENTS[a].label}</button>
            ))}
          </div>
          <ol className={styles.steps}>
            {steps(agent).map((s, i) => (
              <li key={s.title}>
                <span className={styles.num}>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{s.title}</h3>
                  <span className={styles.where}>{s.where}</span>
                  <CopyCode code={s.code} />
                </div>
              </li>
            ))}
          </ol>
          <p className={styles.foot}>The key file stays on your machine. It can only call pay, request and ask for more on your vault, and revoking it deletes the key on chain.</p>
        </div>
      )}
    </dialog>
  );
}
