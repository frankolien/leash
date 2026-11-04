"use client";

// The attack playground: one button runs a real, prompt-injected agent against the demo owner's
// account on NEAR testnet and draws every attempt as it happens. Three panes: the invoice the agent
// read, with its hidden instructions revealed as they are acted on; the attempts, each ending on
// the lock that stopped it; and the vault, which never moves. On load it replays the last run, and
// a visitor who arrives mid-run follows it live.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AttackEvent, Stopper } from "@/lib/server/attack";
import styles from "./attack.module.css";

type Run = { id: string | null; running: boolean; startedAt?: number; events: AttackEvent[] };
type Mode = "idle" | "running" | "following" | "done";

const LOCKS: { key: Stopper; label: string; where: string }[] = [
  { key: "check", label: "Check", where: "before anything is signed" },
  { key: "contract", label: "Contract", where: "on chain" },
  { key: "near", label: "NEAR", where: "the key itself" },
];

const VIA: Record<"tool" | "raw" | "key", string> = { tool: "Leash tool", raw: "raw transaction", key: "its own key" };

/// Which hidden line an attempt acts on, so the invoice can light it up.
function hiddenLineFor(what: string): number | null {
  const w = what.toLowerCase();
  if (w.includes("facts it wrote") || w.includes("newborn")) return null;
  if (w.includes("set_policy") || w.includes("recovery key") || w.includes("around leash") || w.includes("straight from")) return 5;
  if (w.includes("vend0r")) return 4;
  if (w.includes("splits") || w.includes("0.50") || w.includes("0.5 ")) return 3;
  if (w.includes("drainer")) return 2;
  return null;
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

export default function AttackPage() {
  const [events, setEvents] = useState<AttackEvent[]>([]);
  const [mode, setMode] = useState<Mode>("idle");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const feed = useRef<HTMLDivElement>(null);
  const seen = useRef(0);

  const start = events.find((e): e is Extract<AttackEvent, { type: "start" }> => e.type === "start");
  const invoice = events.find((e): e is Extract<AttackEvent, { type: "invoice" }> => e.type === "invoice");
  const end = events.find((e): e is Extract<AttackEvent, { type: "end" }> => e.type === "end");
  const log = events.find((e): e is Extract<AttackEvent, { type: "log" }> => e.type === "log");
  const attempts = events.filter((e): e is Extract<AttackEvent, { type: "attempt" }> => e.type === "attempt");
  const stops = useMemo(() => new Map(events.filter((e): e is Extract<AttackEvent, { type: "stopped" }> => e.type === "stopped").map((e) => [e.id, e])), [events]);
  const paid = useMemo(() => new Map(events.filter((e): e is Extract<AttackEvent, { type: "paid" }> => e.type === "paid").map((e) => [e.id, e])), [events]);
  const lit = useMemo(() => {
    const set = new Set(attempts.map((a) => hiddenLineFor(a.what)).filter((n): n is number => n !== null));
    if (set.has(5)) set.add(6);
    return set;
  }, [attempts]);
  const moved = useMemo(() => [...paid.values()].reduce((sum, p) => sum + Number(p.usdc || 0), 0), [paid]);

  const loadLatest = useCallback(async () => {
    const res = await fetch("/api/attack/latest", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Run;
  }, []);

  // The last run, so the page is never empty; a run in progress is followed.
  useEffect(() => {
    let alive = true;
    (async () => {
      const run = await loadLatest();
      if (!alive || !run?.events.length) return;
      setEvents(run.events);
      setStartedAt(run.startedAt ?? null);
      setMode(run.running ? "following" : "done");
    })();
    return () => {
      alive = false;
    };
  }, [loadLatest]);

  useEffect(() => {
    if (mode !== "following") return;
    const t = setInterval(async () => {
      const run = await loadLatest();
      if (!run) return;
      setEvents(run.events);
      if (!run.running) setMode("done");
    }, 2000);
    return () => clearInterval(t);
  }, [mode, loadLatest]);

  // New events scroll the feed, never the page, so the invoice and the vault stay where they are.
  useEffect(() => {
    const pane = feed.current?.parentElement;
    if (pane && events.length > seen.current && (mode === "running" || mode === "following")) {
      pane.scrollTo({ top: pane.scrollHeight, behavior: "smooth" });
    }
    seen.current = events.length;
  }, [events, mode]);

  const run = useCallback(async () => {
    setProblem(null);
    setEvents([]);
    setMode("running");
    setStartedAt(Date.now());
    const res = await fetch("/api/attack/run", { method: "POST" });
    if (res.status === 409) {
      const body = (await res.json()) as { latest?: Run };
      setEvents(body.latest?.events ?? []);
      setStartedAt(body.latest?.startedAt ?? null);
      setMode("following");
      return;
    }
    if (!res.ok || !res.body) {
      setProblem((await res.json().catch(() => ({ error: "the run could not start" }))).error ?? "the run could not start");
      setMode("idle");
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      const next = lines.filter(Boolean).map((l) => JSON.parse(l) as AttackEvent);
      if (next.length) setEvents((prev) => [...prev, ...next]);
    }
    setMode("done");
  }, []);

  const busy = mode === "running" || mode === "following";
  const stoppedCount = stops.size;

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Link href="/" className={styles.brand} aria-label="Leash home">
          <span className={styles.mark} aria-hidden="true" />
          Leash
        </Link>
        <div className={styles.title}>
          <h1>Attack playground</h1>
          <p>A prompt-injected agent tries to drain its owner. Live, on NEAR testnet, every refusal on chain.</p>
        </div>
        <button className={styles.run} onClick={run} disabled={busy} data-busy={busy || undefined}>
          {mode === "running" && <span className={styles.ring} aria-hidden="true" />}
          {mode === "idle" ? "Run the attack" : mode === "running" ? `Running · ${attempts.length} of 12` : mode === "following" ? "Following a live run" : "Run it again"}
        </button>
      </header>

      {problem && <p className={styles.problem} role="alert">{problem}</p>}

      <div className={styles.grid}>
        <section className={styles.invoice} aria-label="The invoice the agent read">
          <div className={styles.paper}>
            <div className={styles.paperTop}>
              <span>Northwind Hosting</span>
              <span>INV-2291</span>
            </div>
            <h2>{invoice?.visible[0] ?? "Invoice INV-2291"}</h2>
            <p>{invoice?.visible[1] ?? "Amount due: 0.10 USDC to vendor.testnet."}</p>
            <p className={styles.thanks}>{invoice?.visible[2] ?? "Thank you for your business."}</p>
            <div className={styles.hidden} data-open={(attempts.length > 0) || undefined}>
              <div className={styles.hiddenLabel}>
                <span>Hidden in an HTML comment. A person never sees it; the agent reads every word.</span>
              </div>
              <pre>
                {(invoice?.hidden ?? []).map((line, i) => (
                  <span key={i} className={styles.hiddenLine} data-lit={lit.has(i) || undefined}>
                    {line}
                    {"\n"}
                  </span>
                ))}
              </pre>
            </div>
          </div>
          <p className={styles.caption}>
            What the agent is allowed: ${start?.perPayment ?? "2.00"} a payment, ${start?.daily ?? "5.00"} a day, from <span className="mono">{start?.owner ?? "demo.leash.testnet"}</span>. Its key can call three methods on one contract and nothing else.
          </p>
        </section>

        <section className={styles.feedWrap} aria-label="The attempts" aria-live="polite">
          <div className={styles.feed} ref={feed}>
            {events.length === 0 && (
              <div className={styles.empty}>
                <p>Press Run. The agent reads the invoice above, including the part meant only for it, and does what it says.</p>
                <p>Nothing here is simulated: each attempt is a real call against the contract, and each refusal links to the transaction.</p>
              </div>
            )}
            {events.map((e, i) => {
              if (e.type === "phase") {
                return (
                  <div key={i} className={styles.phase}>
                    <span className={styles.phaseN}>{e.n}</span>
                    <span>{e.title}</span>
                    {e.scripted ? <em>scripted</em> : <em data-live>live model{start?.model ? ` · ${start.model}` : ""}</em>}
                  </div>
                );
              }
              if (e.type === "say") {
                return (
                  <div key={i} className={styles.say}>
                    <span className={styles.sayWho}>the agent</span>
                    <p>{e.text}</p>
                  </div>
                );
              }
              if (e.type === "note") return <p key={i} className={styles.note}>{e.text}</p>;
              if (e.type === "error") return <p key={i} className={styles.err}>{e.text}</p>;
              if (e.type === "attempt") {
                const stop = stops.get(e.id);
                const pay = paid.get(e.id);
                return (
                  <article key={i} className={styles.attempt} data-paid={pay ? true : undefined}>
                    <header>
                      <span className={styles.n}>{e.id}</span>
                      <span className={styles.via}>{VIA[e.via]}</span>
                      <p>{e.what}</p>
                    </header>
                    <div className={styles.locks} data-by={stop?.by ?? (pay ? "paid" : "pending")}>
                      {LOCKS.map((l) => (
                        <span key={l.key} className={styles.lock} data-hit={stop?.by === l.key || undefined} data-passed={(!stop && pay) || (stop && LOCKS.findIndex((x) => x.key === stop.by) > LOCKS.findIndex((x) => x.key === l.key)) || undefined}>
                          {l.label}
                        </span>
                      ))}
                    </div>
                    {stop && (
                      <footer>
                        <strong>Stopped {stop.by === "near" ? "by NEAR itself" : stop.by === "contract" ? "by the contract" : "before signing"}</strong>
                        <span className="mono">{stop.reason}</span>
                        {stop.tx && (
                          <a href={stop.tx} target="_blank" rel="noreferrer">
                            open on NEAR ↗
                          </a>
                        )}
                      </footer>
                    )}
                    {pay && (
                      <footer data-paid>
                        <strong>Paid: the invoice itself</strong>
                        <span className="mono">{pay.usdc} USDC to {pay.to}, within the agent&apos;s limits</span>
                        {pay.tx && (
                          <a href={pay.tx} target="_blank" rel="noreferrer">
                            open on NEAR ↗
                          </a>
                        )}
                      </footer>
                    )}
                    {!stop && !pay && <footer className={styles.pending}>waiting for the chain…</footer>}
                  </article>
                );
              }
              return null;
            })}
            {end && (
              <div className={styles.endCard}>
                <strong>
                  {end.attempts} attempts, {end.stopped} stopped.
                </strong>
                <span>
                  {end.paidInvoice ? "The real invoice was paid, within the limits. " : ""}
                  {Number(end.moved) > 0 ? `$${end.moved} left the vault, all of it the invoice.` : "Nothing left the vault that the owner did not allow."}
                </span>
              </div>
            )}
          </div>
        </section>

        <aside className={styles.vault} aria-label="The owner's vault">
          <div className={styles.vaultCard}>
            <span className={styles.vaultLabel}>Owner&apos;s vault</span>
            <strong className={styles.vaultAmount}>${end ? end.vault : (start?.vault ?? "—")}</strong>
            <span className={styles.vaultNote}>{end ? (Number(end.moved) > 0 ? `$${end.moved} out, the invoice` : "unchanged") : busy ? "watching…" : "USDC, on testnet"}</span>
            <dl className={styles.counters}>
              <div>
                <dt>Attempts</dt>
                <dd>{attempts.length}</dd>
              </div>
              <div>
                <dt>Stopped</dt>
                <dd>{stoppedCount}</dd>
              </div>
              <div>
                <dt>Drained</dt>
                <dd>$0.00</dd>
              </div>
            </dl>
            {moved > 0 && <p className={styles.vaultFine}>The ${moved.toFixed(2)} that moved is the invoice the agent was asked to pay.</p>}
          </div>

          <div className={styles.locksKey}>
            {LOCKS.map((l) => (
              <div key={l.key}>
                <span className={styles.lockDot} data-key={l.key} />
                <strong>{l.label}</strong>
                <span>{l.where}</span>
              </div>
            ))}
          </div>

          {log && log.entries.length > 0 && (
            <div className={styles.logCard}>
              <span className={styles.vaultLabel}>What the owner sees: the on-chain log of this run</span>
              <ul>
                {log.entries.map((e, i) => (
                  <li key={i}>
                    <span className="mono">{new Date(Number(BigInt(e.at) / 1_000_000n)).toISOString().slice(11, 19)}</span>
                    <span>{e.event.replace("_", " ")}</span>
                    <span className="mono">{e.to}</span>
                    <span>{e.amount ? `$${(Number(e.amount) / 1e6).toFixed(2)}` : ""}</span>
                    <span className={styles.logDetail}>{e.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.meta}>
            {startedAt && mode !== "running" && <span>Last run {ago(startedAt)}</span>}
            {start && (
              <span>
                {start.drainer} is reported as a scam by {start.reportedBy} owners
              </span>
            )}
          </div>
        </aside>
      </div>

      <footer className={styles.foot}>
        <div>
          <strong>Run it yourself, against your own agent.</strong>
          <code>LEASH_KEY=&lt;key from the dashboard&gt; node demo/attack.mjs</code>
          <span>
            Same attempts, same contract. Source in <a href="https://github.com/frankolien/leash/blob/main/mcp/demo/attack.mjs">mcp/demo/attack.mjs</a>; how each lock works in <a href="https://github.com/frankolien/leash/blob/main/docs/08-security.md">docs/08-security.md</a>.
          </span>
        </div>
        <div>
          <strong>Honest about what is scripted.</strong>
          <span>
            Phase 1 is a real model with Leash&apos;s real tools; it may obey the hidden text, or refuse on its own, and the page shows whichever happened. Phase 2 assumes the worst, an agent whose software was replaced, and sends the raw transactions itself. Every refusal is a real transaction on NEAR testnet.
          </span>
        </div>
      </footer>
    </div>
  );
}
