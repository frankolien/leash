"use client";

// Creates an agent from the dashboard, so an owner who signed in with Google never needs the CLI.
// The key pair is made in this browser; the owner signs twice (add the key to their account, set
// its limits on Leash); then the key file is handed over once, with the config for their agent.

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, X } from "lucide-react";
import { KeyPair } from "near-api-js";
import { AGENTS, mcpConfig, type Agent as AgentKind } from "@/components/setup/agents";
import { AGENT_ALLOWANCE, AGENT_METHODS } from "@/lib/config";
import { toUnits } from "@/lib/format";
import type { OwnerSession } from "@/lib/session";
import { BrandLogo } from "./AgentIcon";
import styles from "./dashboard.module.css";

type Made = { name: string; file: string; kind: AgentKind };

export default function NewAgentDialog(props: { kind: AgentKind | null; session: OwnerSession | null; owner: string; contract: string; token: string; onClose: () => void; onSignIn: () => void; onCreated: (name: string) => Promise<void> }) {
  const { kind, session, owner, contract, token, onClose, onSignIn, onCreated } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const [agent, setAgent] = useState<AgentKind>("claude");
  const [name, setName] = useState("claude");
  const [daily, setDaily] = useState("5");
  const [perPayment, setPerPayment] = useState("2");
  const [recipients, setRecipients] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<Made | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (kind) {
      setAgent(kind);
      setName(kind);
      setMade(null);
      setError(null);
      if (!d.open) d.showModal();
    } else if (d.open) d.close();
  }, [kind]);

  const owns = session?.accountId === owner;
  const valid = /^[a-z0-9-]{1,32}$/.test(name) && Number(daily) > 0 && Number(perPayment) > 0 && Number(perPayment) <= Number(daily);

  async function create() {
    if (!session || !owns || !valid) return;
    setError(null);
    try {
      const pair = KeyPair.fromRandom("ed25519");
      const publicKey = pair.getPublicKey().toString();
      setStep("Adding the agent's key to your account");
      await session.addAgentKey(publicKey, contract, AGENT_METHODS, AGENT_ALLOWANCE);
      setStep("Setting its limits on Leash");
      await session.call(contract, "set_policy", {
        public_key: publicKey,
        policy: {
          name,
          token,
          daily_cap: toUnits(daily).toString(),
          per_payment_cap: toUnits(perPayment).toString(),
          allowlist: recipients.split(",").map((s) => s.trim()).filter(Boolean),
          cooldown_secs: 0,
          expires_at: 0,
        },
      });
      const file = JSON.stringify({ name, owner, public_key: publicKey, private_key: pair.toString(), contract, network: session.network, token }, null, 2);
      setMade({ name, file, kind: agent });
      await onCreated(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStep(null);
    }
  }

  function download() {
    if (!made) return;
    const url = URL.createObjectURL(new Blob([made.file], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${made.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const setup = made ? mcpConfig(made.kind, `~/.leash/${made.name}.json`) : null;

  return (
    <dialog ref={ref} className={styles.sheet} onClose={onClose} aria-labelledby="new-agent-title">
      <div className={styles.sheetHead}>
        <h2 id="new-agent-title">{made ? `${made.name} is on a leash` : "New agent"}</h2>
        <button className={styles.iconButton} onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>

      {!made && (
        <>
          <div className={styles.kinds} role="radiogroup" aria-label="Agent">
            {(Object.keys(AGENTS) as AgentKind[]).map((k) => (
              <button key={k} role="radio" aria-checked={agent === k} onClick={() => { setAgent(k); setName(k); }}>
                <span className={styles.darkLogo}><BrandLogo name={k} size={17} /></span>{AGENTS[k].label}
              </button>
            ))}
          </div>
          <div className={styles.form}>
            <label><span>Name</span><input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} spellCheck={false} /></label>
            <div className={styles.pair}>
              <label><span>Daily limit</span><div className={styles.money}><b>$</b><input inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} /></div></label>
              <label><span>Pays alone up to</span><div className={styles.money}><b>$</b><input inputMode="decimal" value={perPayment} onChange={(e) => setPerPayment(e.target.value)} /></div></label>
            </div>
            <label><span>Only these accounts <i>(optional, comma separated)</i></span><input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="Anyone" spellCheck={false} /></label>
            <p className={styles.muted}>Above ${perPayment || "0"} it asks you first. It can never spend more than ${daily || "0"} a day.</p>
          </div>
          {error && <p className={styles.formError} role="alert">{error}</p>}
          {!session ? (
            <button className={styles.white} onClick={onSignIn}>Sign in to create an agent</button>
          ) : !owns ? (
            <p className={styles.formError}>You are signed in as another account; only the owner can add agents here.</p>
          ) : (
            <button className={styles.white} onClick={create} disabled={!valid || step !== null}>{step ? `${step}…` : `Create ${name || "agent"}`}</button>
          )}
        </>
      )}

      {made && setup && (
        <div className={styles.made}>
          <ol className={styles.madeSteps}>
            <li>
              <strong>Save the key file to <span className="mono">~/.leash/{made.name}.json</span></strong>
              <span className={styles.muted}>It is shown once. It can only pay, ask and request on your vault, within the limits you set.</span>
              <button className={styles.dark} onClick={download}><Download size={16} /> Download {made.name}.json</button>
            </li>
            <li>
              <strong>Add Leash to {AGENTS[made.kind].label}</strong>
              <span className={styles.muted}>{setup.where}</span>
              <div className={styles.codeBox}>
                <pre>{setup.code}</pre>
                <button aria-label="Copy" onClick={async () => { await navigator.clipboard.writeText(setup.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
              </div>
            </li>
            <li><strong>Ask it to pay</strong><span className={styles.muted}>Under ${perPayment} it pays on its own. Above, it shows up here for you to approve.</span></li>
          </ol>
          <button className={styles.white} onClick={onClose}>Done</button>
        </div>
      )}
    </dialog>
  );
}
