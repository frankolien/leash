"use client";

// Where Claude or ChatGPT sends the owner to connect Leash. They sign in (or make an account), set
// this agent's limits and allow it; the browser makes the agent's key and limits on chain, then hands
// the key back to the app through the OAuth code. Each connection is its own agent, so each can be
// revoked on its own from the dashboard.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthContext";
import { SignInCard } from "@/components/auth/SignInDialog";
import { BrandLogo, brandOf } from "@/components/dashboard/AgentIcon";
import { createAgent, limitsProblem } from "@/lib/agents";
import { USDC, contractOf, shortAccount } from "@/lib/config";
import { plainError } from "@/lib/errors";
import { LeashReader } from "@/lib/reader";
import styles from "./connect.module.css";

type App = { name: string } | { error: string } | null;

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "agent";
}

/// The app's name as a free agent name: "claude", then "claude-2" and so on.
function freeName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) if (!taken.includes(`${base}-${n}`)) return `${base}-${n}`;
}

export default function ConnectPage() {
  const params = useSearchParams();
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const state = params.get("state");
  const { session, card, showInline, signOut } = useAuth();
  const [app, setApp] = useState<App>(null);
  const [name, setName] = useState("");
  const [daily, setDaily] = useState("5");
  const [perPayment, setPerPayment] = useState("2");
  const [recipients, setRecipients] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => showInline(), [showInline]);

  useEffect(() => {
    if (!clientId || !redirectUri) return setApp({ error: "This page opens from Claude or ChatGPT when you connect Leash there." });
    fetch(`/api/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}`)
      .then((r) => r.json())
      .then((b: { name?: string; error?: string }) => setApp(b.name ? { name: b.name } : { error: b.error ?? "This connection link is not valid." }))
      .catch(() => setApp({ error: "Leash could not check this connection. Try again." }));
  }, [clientId, redirectUri]);

  const appName = app && "name" in app ? app.name : "";

  useEffect(() => {
    if (!session || !appName) return;
    const base = slug(appName);
    new LeashReader(session.network)
      .view<[string, { name: string | null; active: boolean }][]>(contractOf(session.accountId), "get_policies", { owner: session.accountId })
      .then((policies) => setName(freeName(base, policies.filter(([, p]) => p.active).map(([, p]) => p.name ?? ""))), () => setName(base));
  }, [session, appName]);

  const limits = { name, daily, perPayment, recipients: recipients.split(",").map((s) => s.trim()).filter(Boolean) };
  const invalid = limitsProblem(limits);

  function back(extra: Record<string, string>) {
    const url = new URL(redirectUri!);
    for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
    if (state) url.searchParams.set("state", state);
    window.location.assign(url.toString());
  }

  async function allow() {
    if (!session || invalid) return;
    setProblem(null);
    try {
      const key = await createAgent(session, contractOf(session.accountId), USDC[session.network], limits, setStep);
      setStep(`Connecting ${appName}`);
      const res = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_id: clientId, redirect_uri: redirectUri, state, code_challenge: params.get("code_challenge"), code_challenge_method: params.get("code_challenge_method"), key }),
      });
      const body = (await res.json()) as { redirect?: string; error?: string };
      if (!res.ok || !body.redirect) throw new Error(body.error ?? "the connection did not finish");
      window.location.assign(body.redirect);
    } catch (e) {
      console.warn("Leash: connecting failed", e);
      setProblem(plainError(e));
      setStep(null);
    }
  }

  const branded = brandOf(appName) !== undefined;

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="connect-title">
        <div className={styles.pair} aria-hidden="true">
          <span className={styles.appMark}>{branded ? <BrandLogo name={appName} size={30} /> : <b>{(appName || "?").charAt(0).toUpperCase()}</b>}</span>
          <span className={styles.link} />
          <span className={styles.leashMark} />
        </div>

        {!app ? (
          <div className={styles.status}><Loader2 size={20} className={styles.spin} /></div>
        ) : "error" in app ? (
          <>
            <h1 id="connect-title">Can't connect</h1>
            <p className={styles.lead}>{app.error}</p>
          </>
        ) : !session ? (
          <>
            <p className={styles.kicker}>{app.name} wants to connect to Leash</p>
            <div className={styles.signIn}>{card.ready ? <SignInCard {...card} /> : <div className={styles.status}><Loader2 size={20} className={styles.spin} /></div>}</div>
          </>
        ) : step ? (
          <>
            <h1 id="connect-title">Connecting {app.name}</h1>
            <div className={styles.status} role="status"><Loader2 size={20} className={styles.spin} />{step}…</div>
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); allow(); }} className={styles.allow}>
            <h1 id="connect-title">Let {app.name} pay for you</h1>
            <p className={styles.lead}>
              From the vault of <b>{shortAccount(session.accountId)}</b>.{" "}
              <button type="button" className={styles.textButton} onClick={() => signOut()}>Not you?</button>
            </p>
            <div className={styles.fields}>
              <div className={styles.pairFields}>
                <label><span>Daily limit</span><div className={styles.money}><b>$</b><input inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} /></div></label>
                <label><span>Pays alone up to</span><div className={styles.money}><b>$</b><input inputMode="decimal" value={perPayment} onChange={(e) => setPerPayment(e.target.value)} /></div></label>
              </div>
              <label><span>Only these accounts <i>(optional)</i></span><input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="Anyone" spellCheck={false} /></label>
            </div>
            <ul className={styles.terms}>
              <li>Up to ${perPayment || "0"} a payment, it pays on its own.</li>
              <li>Above that, it asks you first in your dashboard.</li>
              <li>Never more than ${daily || "0"} a day. Revoke it any time.</li>
            </ul>
            {(problem || (invalid && name)) && <p className={styles.error} role="alert">{problem ?? invalid}</p>}
            <button className={styles.white} disabled={!!invalid}>Allow</button>
            <button type="button" className={styles.textButton} onClick={() => back({ error: "access_denied" })}>Cancel</button>
            <small className={styles.fine}>It appears in your dashboard as <span className="mono">{name || "…"}</span>. You sign twice: once for its key, once for its limits.</small>
          </form>
        )}
      </section>
    </main>
  );
}
