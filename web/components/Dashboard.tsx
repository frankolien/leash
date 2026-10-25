"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  agentLabel,
  contractOf,
  LeashReader,
  modeOf,
  msOf,
  nearOf,
  networkOf,
  shortKey,
  splitUsdc,
  toUnits,
  toUsdc,
  type Agent,
  type LogEntry,
  type Proposal,
  type Request,
  type Snapshot,
} from "@/lib/leash";
import { callAs, connect, connectedAccount, disconnect } from "@/lib/wallet";

const POLL_MS = 10_000;
const ONE_YOCTO = BigInt(1);
const STORAGE_DEPOSIT = BigInt(1_250_000_000_000_000_000_000);

type Toast = { text: string; bad?: boolean };

export default function Dashboard({ owner, contract: contractOverride }: { owner: string; contract?: string }) {
  const network = networkOf(owner);
  const contract = contractOverride ?? contractOf(owner);
  const reader = useMemo(() => new LeashReader(network), [network]);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const localNames = useNames(owner);
  // The name the owner gave the key lives on chain with its policy; a local name, if any, wins.
  const names = useMemo(() => {
    const onChain = Object.fromEntries((snap?.agents ?? []).filter((a) => a.policy.name).map((a) => [a.key, a.policy.name as string]));
    return { ...onChain, ...localNames };
  }, [snap, localNames]);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await reader.snapshot(owner, contract);
      setSnap(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [reader, owner, contract]);

  useEffect(() => {
    refresh();
    const poll = window.setInterval(refresh, POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    connectedAccount(network).then(setWallet);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [refresh, network]);

  const isOwner = wallet === owner;

  function say(text: string, bad = false) {
    setToast({ text, bad });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 4000);
  }

  async function act(label: string, run: () => Promise<unknown>, done: string) {
    if (!isOwner) {
      say(`Connect ${owner} to ${label}`, true);
      return;
    }
    setBusy(label);
    try {
      await run();
      say(done);
      await refresh();
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(null);
    }
  }

  const onConnect = async () => {
    try {
      const account = await connect(network);
      setWallet(account);
      if (account && account !== owner) say(`Connected ${account}; this dashboard belongs to ${owner}`, true);
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), true);
    }
  };

  const onDisconnect = async () => {
    await disconnect(network);
    setWallet(null);
  };

  const approve = (r: Request) =>
    act("approve", () => callAs(network, contract, "approve", { request_id: r.id }), `Approved ${toUsdc(r.amount)} USDC to ${r.to}`);
  const deny = (r: Request) => act("deny", () => callAs(network, contract, "deny", { request_id: r.id }), `Denied request ${r.id}. Nothing moved.`);
  const dismiss = (p: Proposal) => act("dismiss", () => callAs(network, contract, "dismiss_proposal", { proposal_id: p.id }), "Dismissed");
  const revoke = (a: Agent) =>
    act("revoke", () => callAs(network, contract, "revoke", { public_key: a.key }), `${agentLabel(a.key, names)} can no longer pay`);
  const pause = () => act("pause", () => callAs(network, contract, "pause", {}), "Paused. No agent can pay until you resume.");
  const resume = () => act("resume", () => callAs(network, contract, "resume", {}), "Resumed");
  const deposit = () => {
    const usdc = window.prompt("How much USDC to move into the vault?", "10");
    if (!usdc) return;
    act(
      "deposit",
      () => callAs(network, snap!.token, "ft_transfer_call", { receiver_id: contract, amount: toUnits(usdc).toString(), msg: "" }, ONE_YOCTO),
      `Deposited ${usdc} USDC`,
    );
  };
  const withdraw = () => {
    const usdc = window.prompt("How much USDC to take back?", toUsdc(snap?.vault ?? BigInt(0)));
    if (!usdc) return;
    act("withdraw", () => callAs(network, contract, "withdraw", { token: snap!.token, amount: toUnits(usdc).toString() }), `Withdrew ${usdc} USDC`);
  };

  if (error && !snap) {
    return (
      <main className="page">
        <Bar owner={owner} network={network} wallet={null} onConnect={onConnect} onDisconnect={onDisconnect} paused={false} />
        <div className="empty">
          <h1 className="statement">Nothing here yet.</h1>
          <p className="quiet">
            No Leash contract at <span className="mono">{contract}</span>. The owner runs <span className="mono">leash init</span> to create it.
          </p>
        </div>
      </main>
    );
  }

  if (!snap) {
    return (
      <main className="page">
        <Bar owner={owner} network={network} wallet={wallet} onConnect={onConnect} onDisconnect={onDisconnect} paused={false} />
        <p className="quiet">Reading the chain…</p>
      </main>
    );
  }

  const { whole, cents } = splitUsdc(snap.vault);
  const waiting = snap.requests.length + snap.proposals.length;

  return (
    <main className="page">
      <Bar
        owner={owner}
        network={network}
        wallet={wallet}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        paused={snap.paused}
        onPause={pause}
        onResume={resume}
        busy={busy}
        canAct={isOwner}
      />

      <section className="balance" aria-label="Vault">
        <div className="amount" aria-label={`${toUsdc(snap.vault)} USDC in the vault`}>
          ${whole}
          <span className="cents">.{cents}</span>
        </div>
        <div className="sub">
          <span>in the vault</span>
          <span className="mono">{nearOf(snap.storage)} NEAR for storage</span>
          <span>{snap.agents.filter((a) => a.policy.active).length} active {snap.agents.filter((a) => a.policy.active).length === 1 ? "agent" : "agents"}</span>
        </div>
        <div className="actions">
          <button className="pill ghost" onClick={deposit} disabled={busy !== null}>Deposit</button>
          <button className="pill ghost" onClick={withdraw} disabled={busy !== null || snap.vault === BigInt(0)}>Withdraw</button>
        </div>
      </section>

      <section className="section" aria-label="Waiting on you">
        <div className="section-head">
          <span className="eyebrow">Waiting on you</span>
          {waiting > 0 && <span className="chip warn">{waiting}</span>}
        </div>
        {waiting === 0 ? (
          <div className="empty">
            <h2 className="statement">Nothing needs you.</h2>
            <p className="quiet">Every agent is inside its limits. Refusals, if any, are in the activity below.</p>
          </div>
        ) : (
          <>
            {snap.requests.map((r) => (
              <RequestCard key={r.id} request={r} names={names} now={now} ttl={snap.requestTtl} busy={busy} onApprove={() => approve(r)} onDeny={() => deny(r)} />
            ))}
            {snap.proposals.map((p) => (
              <div className="tile proposal" key={`p${p.id}`}>
                <span className="eyebrow">{agentLabel(p.key, names)} asks for more</span>
                <p className="memo">{p.note}</p>
                <div className="chips">
                  <button className="pill ghost" onClick={() => dismiss(p)} disabled={busy !== null}>Dismiss</button>
                  <span className="chip">change the policy with <span className="mono">leash grant</span></span>
                </div>
              </div>
            ))}
          </>
        )}
      </section>

      <section className="section" aria-label="Agents">
        <div className="section-head">
          <span className="eyebrow">Agents</span>
          <span className="quiet" style={{ fontSize: 12 }}>limits reset {snap.requestTtl >= 86400 ? "daily" : "every 24 hours from the first payment"}</span>
        </div>
        <div className="agents">
          {snap.agents.map((a) => (
            <AgentTile key={a.key} agent={a} names={names} paused={snap.paused} busy={busy} onRevoke={() => revoke(a)} />
          ))}
          <div className="agent-new">
            <span className="eyebrow">New agent</span>
            <span>Grant a key from the CLI; it appears here within ten seconds.</span>
            <code>leash grant --name codex --daily 5 --per-payment 2</code>
          </div>
        </div>
      </section>

      <section className="section" aria-label="Activity">
        <div className="section-head">
          <span className="eyebrow">Activity</span>
          <span className="quiet" style={{ fontSize: 12 }}>last {snap.log.length} on chain</span>
        </div>
        <div className="rows">
          {snap.log.length === 0 && <div className="row"><div className="icon">·</div><div><div className="title quiet">No activity yet</div></div><div /></div>}
          {snap.log.map((e, i) => (
            <ActivityRow key={`${e.at}-${i}`} entry={e} names={names} />
          ))}
        </div>
      </section>

      {toast && <div className={`toast${toast.bad ? " bad" : ""}`} role="status">{toast.text}</div>}
    </main>
  );
}

function Bar(props: {
  owner: string;
  network: string;
  wallet: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  paused: boolean;
  onPause?: () => void;
  onResume?: () => void;
  busy?: string | null;
  canAct?: boolean;
}) {
  const { owner, network, wallet, onConnect, onDisconnect, paused, onPause, onResume, busy, canAct } = props;
  return (
    <header className="bar">
      <span className="owner mono">{owner}</span>
      <span className="pill glass" style={{ height: 28, fontSize: 12 }}>{network}</span>
      <span className="spacer" />
      {wallet ? (
        <button className="pill glass" onClick={onDisconnect} title="Disconnect">
          <span className={`dot ${wallet === owner ? "good" : "warn"}`} />
          <span className="mono">{wallet === owner ? "you" : wallet}</span>
        </button>
      ) : (
        <button className="pill glass" onClick={onConnect}>Connect</button>
      )}
      {onPause && (
        paused ? (
          <button className="pill bad on" onClick={onResume} disabled={busy !== null || !canAct}>Paused · Resume</button>
        ) : (
          <button className="pill bad" onClick={onPause} disabled={busy !== null || !canAct} title="Kill switch: no agent can pay until you resume">
            Pause all
          </button>
        )
      )}
    </header>
  );
}

function RequestCard(props: { request: Request; names: Record<string, string>; now: number; ttl: number; busy: string | null; onApprove: () => void; onDeny: () => void }) {
  const { request: r, names, now, ttl, busy, onApprove, onDeny } = props;
  const expires = msOf(r.expires_at);
  const created = msOf(r.created_at);
  const total = Math.max(1, expires - created || ttl * 1000);
  const left = Math.max(0, expires - now);
  const share = Math.min(1, left / total);
  const minutes = Math.ceil(left / 60_000);
  const { whole, cents } = splitUsdc(BigInt(r.amount));
  const tone = share < 0.15 ? "bad" : share < 0.4 ? "warn" : "";
  return (
    <article className="tile request" aria-label={`Request ${r.id}`}>
      <div className="top">
        <span className="eyebrow">{agentLabel(r.key, names)} wants to pay</span>
        <span className="chip warn">{r.reason}</span>
      </div>
      <div className="amount">
        ${whole}
        <span style={{ fontSize: "0.5em", opacity: 0.6 }}>.{cents}</span>
      </div>
      <div className="to">
        to <span className="mono">{r.to}</span>
      </div>
      {r.memo && <blockquote className="memo">{r.memo}</blockquote>}
      <div className="timer">
        <div className="bar-track"><div className={`bar-fill ${tone}`} style={{ width: `${share * 100}%` }} /></div>
        <span>{left === 0 ? "expired; the next touch drops it" : `${minutes} min left to decide · approves exactly this payment`}</span>
      </div>
      <div className="actions">
        <button className="pill ghost" onClick={onDeny} disabled={busy !== null}>Deny</button>
        <button className="pill accent" onClick={onApprove} disabled={busy !== null || left === 0}>Approve</button>
      </div>
    </article>
  );
}

function AgentTile(props: { agent: Agent; names: Record<string, string>; paused: boolean; busy: string | null; onRevoke: () => void }) {
  const { agent: a, names, paused, busy, onRevoke } = props;
  const daily = BigInt(a.policy.daily_cap);
  const share = daily === BigInt(0) ? 0 : Number((a.remaining * BigInt(1000)) / daily) / 1000;
  const on = a.policy.active && !paused;
  const expires = a.policy.expires_at ? new Date(a.policy.expires_at * 1000) : null;
  return (
    <article className={`tile agent${on ? "" : " off"}`}>
      <div className="name-row">
        <div className="name">
          <span className={`dot ${on ? "good" : "bad"}`} />
          {agentLabel(a.key, names)}
        </div>
        {a.policy.active && (
          <button className="pill bad" style={{ height: 30, fontSize: 12 }} onClick={onRevoke} disabled={busy !== null}>Revoke</button>
        )}
      </div>
      <div className="key mono" title={a.key}>{shortKey(a.key)}</div>
      <div className="mode">{a.policy.active ? (paused ? "Paused by you" : modeOf(a.policy)) : "Revoked"}</div>
      <div className="budget">
        <div className="line">
          <span><strong>${toUsdc(a.remaining)}</strong> of ${toUsdc(daily)} left today</span>
          <span className="quiet">${toUsdc(a.policy.per_payment_cap)} per payment</span>
        </div>
        <div className="bar-track"><div className={`bar-fill ${share < 0.2 ? "warn" : ""}`} style={{ width: `${share * 100}%` }} /></div>
      </div>
      <div className="meta">
        {a.policy.allowlist.length > 0 ? (
          <div className="chips">{a.policy.allowlist.map((to) => <span className="chip mono" key={to}>{to}</span>)}</div>
        ) : (
          <span>Any recipient</span>
        )}
        {a.policy.cooldown_secs > 0 && <span>{a.policy.cooldown_secs}s between payments</span>}
        {expires && <span>until {expires.toLocaleString()}</span>}
      </div>
    </article>
  );
}

function ActivityRow({ entry: e, names }: { entry: LogEntry; names: Record<string, string> }) {
  const who = e.key ? agentLabel(e.key, names) : "you";
  const [tone, glyph, title] = describe(e, who);
  const when = new Date(msOf(e.at));
  return (
    <div className="row">
      <div className={`icon ${tone}`}>{glyph}</div>
      <div>
        <div className="title">{title}</div>
        <div className="when">{when.toLocaleString()}{e.detail && !["pay", "request_parked", "pay_refused"].includes(e.event) ? ` · ${e.detail}` : ""}</div>
      </div>
      <div className={`value${e.amount ? "" : " muted"}`}>{e.amount ? `$${toUsdc(e.amount)}` : ""}</div>
    </div>
  );
}

function describe(e: LogEntry, who: string): [string, string, string] {
  switch (e.event) {
    case "pay": return ["good", "→", `${who} paid ${e.to}${e.detail ? ` · ${e.detail}` : ""}`];
    case "pay_failed": return ["bad", "↩", `Transfer to ${e.to} failed; refunded`];
    case "pay_refused": return ["bad", "×", `Refused ${who}: ${e.detail}. Nothing moved.`];
    case "request_parked": return ["warn", "?", `${who} asked to pay ${e.to} (${e.detail})`];
    case "request_approved": return ["good", "✓", `You approved ${who}'s payment to ${e.to}`];
    case "request_denied": return ["", "–", `You denied ${who}'s request`];
    case "request_expired": return ["", "⏱", `${who}'s request expired`];
    case "proposal_made": return ["warn", "!", `${who} asks for more`];
    case "proposal_dismissed": return ["", "–", `You dismissed ${who}'s proposal`];
    case "policy_set": return ["", "+", `You granted ${who}`];
    case "policy_revoked": return ["bad", "×", `You revoked ${who}`];
    case "paused": return ["bad", "■", "You paused every agent"];
    case "resumed": return ["good", "▶", "You resumed"];
    case "deposit": return ["good", "+", "You added to the vault"];
    case "withdraw": return ["", "−", "You took from the vault"];
    default: return ["", "·", e.event];
  }
}

/// Agent names live only on the owner's machine (the CLI's key files), so the page lets the owner
/// name keys locally and remembers it in this browser. Everyone else sees a short stable label.
function useNames(owner: string): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`leash.names.${owner}`);
      if (raw) setNames(JSON.parse(raw));
    } catch {
      setNames({});
    }
  }, [owner]);
  return names;
}
