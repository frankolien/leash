"use client";

// The owner's dashboard as an app: a sidebar, a header with the kill switch and Add money, and five
// views addressed by the URL hash. State lives in the hooks; the cards only draw and call back.

import { useCallback, useEffect, useState } from "react";
import { Pause, Play, Plus, Wallet } from "lucide-react";
import { useNames } from "@/hooks/useNames";
import { useNow, useSnapshot } from "@/hooks/useSnapshot";
import { useToast } from "@/hooks/useToast";
import { useWallet } from "@/hooks/useWallet";
import { agentLabel, toUnits, toUsdc } from "@/lib/format";
import { greeting } from "@/lib/insights";
import { contractOf, networkOf } from "@/lib/reader";
import type { Agent, Proposal, Request, Snapshot } from "@/lib/types";
import ActivityCard from "./ActivityCard";
import AgentCard from "./AgentCard";
import AgentsCard from "./AgentsCard";
import AmountDialog, { type AmountAsk } from "./AmountDialog";
import ApprovalCard from "./ApprovalCard";
import NewAgent from "./NewAgent";
import ProposalCard from "./ProposalCard";
import SettingsView from "./SettingsView";
import Sidebar from "./Sidebar";
import VaultCard from "./VaultCard";
import { viewFromHash, type View } from "./views";
import styles from "./dashboard.module.css";

const ONE_YOCTO = BigInt(1);

function useView(): View {
  const [view, setView] = useState<View>("overview");
  useEffect(() => {
    const update = () => setView(viewFromHash(window.location.hash));
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return view;
}

const TITLES: Record<Exclude<View, "overview">, { title: string; sub: string }> = {
  agents: { title: "Agents", sub: "Each key, its limits, and what it has left today." },
  approvals: { title: "Approvals", sub: "Payments above a limit and requests for more, waiting on you." },
  activity: { title: "Activity", sub: "Every payment, refusal and change, as it landed on chain." },
  settings: { title: "Settings", sub: "How your vault behaves and where it lives." },
};

export default function Dashboard({ owner, contract: contractOverride }: { owner: string; contract?: string }) {
  const network = networkOf(owner);
  const contract = contractOverride ?? contractOf(owner);
  const { snapshot: snap, error, refresh } = useSnapshot(owner, contract, network);
  const { toast, say } = useToast();
  const wallet = useWallet(owner, network, refresh, say);
  const names = useNames(owner, snap?.agents);
  const now = useNow();
  const view = useView();
  const [ask, setAsk] = useState<AmountAsk | null>(null);

  const { act, call, busy } = wallet;
  const approve = useCallback((r: Request) => act("approve", () => call(contract, "approve", { request_id: r.id }), `Approved ${toUsdc(r.amount)} USDC to ${r.to}`), [act, call, contract]);
  const deny = useCallback((r: Request) => act("deny", () => call(contract, "deny", { request_id: r.id }), `Denied request ${r.id}. Nothing moved.`), [act, call, contract]);
  const dismiss = useCallback((p: Proposal) => act("dismiss", () => call(contract, "dismiss_proposal", { proposal_id: p.id }), "Dismissed"), [act, call, contract]);
  const revoke = useCallback((a: Agent) => act("revoke", () => call(contract, "revoke", { public_key: a.key }), `${agentLabel(a.key, names)} can no longer pay`), [act, call, contract, names]);
  const pause = useCallback(() => act("pause", () => call(contract, "pause", {}), "Paused. No agent can pay until you resume."), [act, call, contract]);
  const resume = useCallback(() => act("resume", () => call(contract, "resume", {}), "Resumed"), [act, call, contract]);
  const setWindow = useCallback((secs: number) => act("set the approval window", () => call(contract, "set_request_ttl", { secs }), `Requests now wait ${Math.round(secs / 60)} minutes`), [act, call, contract]);
  const deposit = useCallback(() => {
    if (!snap) return;
    setAsk({
      title: "Add money",
      hint: "Moves USDC from your account into the vault your agents spend from.",
      confirm: "Add to vault",
      initial: "10",
      onConfirm: (usdc) => act("deposit", () => call(snap.token, "ft_transfer_call", { receiver_id: contract, amount: toUnits(usdc).toString(), msg: "" }, ONE_YOCTO), `Added ${usdc} USDC`),
    });
  }, [act, call, contract, snap]);
  const withdraw = useCallback(() => {
    if (!snap) return;
    setAsk({
      title: "Withdraw",
      hint: "Moves USDC from the vault back to your account. Agents keep their limits.",
      confirm: "Withdraw",
      initial: toUsdc(snap.vault),
      onConfirm: (usdc) => act("withdraw", () => call(contract, "withdraw", { token: snap.token, amount: toUnits(usdc).toString() }), `Withdrew ${usdc} USDC`),
    });
  }, [act, call, contract, snap]);

  const waiting = snap ? snap.requests.length + snap.proposals.length : 0;
  const agentOf = (key: string) => snap?.agents.find((a) => a.key === key);

  const waitingCards = (s: Snapshot, limit?: number) => {
    const cards = [
      ...s.requests.map((r) => <ApprovalCard key={`r${r.id}`} request={r} agent={agentOf(r.key)} names={names} now={now} busy={busy} onApprove={() => approve(r)} onDeny={() => deny(r)} />),
      ...s.proposals.map((p) => <ProposalCard key={`p${p.id}`} proposal={p} names={names} busy={busy} onDismiss={() => dismiss(p)} />),
    ];
    return limit ? cards.slice(0, limit) : cards;
  };

  const calm = (
    <section className={`${styles.card} ${styles.calm}`}>
      <strong>Nothing needs you.</strong>
      <span>Every agent is inside its limits. When one asks to pay more, it lands here.</span>
    </section>
  );

  let body: React.ReactNode = null;
  if (snap) {
    if (view === "overview") {
      body = (
        <div className={styles.overview}>
          <div className={styles.column}>
            <VaultCard snapshot={snap} now={now} busy={busy} onWithdraw={withdraw} />
            <AgentsCard agents={snap.agents} names={names} paused={snap.paused} />
          </div>
          <div className={`${styles.column} ${styles.decisions}`}>
            <div className={styles.waiting}>
              {waiting ? waitingCards(snap, 1) : calm}
              {waiting > 1 && <a className={styles.more} href="#approvals">{waiting - 1} more waiting</a>}
            </div>
            <ActivityCard log={snap.log} names={names} limit={5} />
          </div>
        </div>
      );
    } else if (view === "agents") {
      body = (
        <div className={styles.agentGrid}>
          {snap.agents.map((a) => <AgentCard key={a.key} agent={a} names={names} paused={snap.paused} busy={busy} onRevoke={() => revoke(a)} />)}
          <NewAgent />
        </div>
      );
    } else if (view === "approvals") {
      body = <div className={styles.approvalList}>{waiting ? waitingCards(snap) : calm}</div>;
    } else if (view === "activity") {
      body = <ActivityCard log={snap.log} names={names} full />;
    } else {
      body = <SettingsView snapshot={snap} busy={busy} canAct={wallet.isOwner} onWindow={setWindow} onPause={pause} onResume={resume} />;
    }
  }

  const heading = view === "overview"
    ? { title: `${greeting(now)}`, sub: new Date(now).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) }
    : TITLES[view];

  return (
    <div className={styles.app}>
      <Sidebar view={view} waiting={waiting} owner={owner} network={network} account={wallet.account} onConnect={wallet.onConnect} onDisconnect={wallet.onDisconnect} />
      <main className={styles.main}>
        <header className={styles.top}>
          <div>
            <span className={styles.muted}>{heading.sub}</span>
            <h1 className="display">{heading.title}</h1>
          </div>
          {snap && (
            <div className={styles.topActions}>
              {snap.paused
                ? <button className="btn danger on" onClick={resume} disabled={busy !== null || !wallet.isOwner}><Play size={15} /> Resume</button>
                : <button className="btn" onClick={pause} disabled={busy !== null || !wallet.isOwner} title="Stops every agent key at once"><Pause size={15} /> Pause all</button>}
              <button className="btn ink" onClick={deposit} disabled={busy !== null}><Plus size={15} /> Add money</button>
              {wallet.account
                ? <button className={`btn line ${styles.phoneOnly}`} onClick={wallet.onDisconnect}>Connected</button>
                : <button className={`btn line ${styles.phoneOnly}`} onClick={wallet.onConnect}><Wallet size={15} /> Connect</button>}
            </div>
          )}
        </header>
        {snap?.paused && <div className={styles.banner}>Paused. No agent can pay until you resume.</div>}
        {!snap && (
          <div className={styles.empty}>
            {error ? (
              <>
                <h2 className="display">No vault here yet.</h2>
                <p>There is no Leash contract at <span className="mono">{contract}</span>. The owner creates one with <span className="mono">leash init</span>.</p>
                <a className="btn" href="/">Back to Leash</a>
              </>
            ) : (
              <p className={styles.muted}>Reading the chain…</p>
            )}
          </div>
        )}
        {body}
      </main>
      <AmountDialog ask={ask} onClose={() => setAsk(null)} />
      {toast && <div className={styles.toast} data-bad={toast.bad || undefined} role="status">{toast.text}</div>}
    </div>
  );
}
