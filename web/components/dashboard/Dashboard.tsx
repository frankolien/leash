"use client";

// The owner's dashboard as an app: a sidebar with the views, the kill switch and the wallet, and
// six views addressed by the URL hash, each opening with a title, its state and one main action.
// State lives in the hooks; the cards only draw and call back.

import { useCallback, useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import SetupDialog from "@/components/setup/SetupDialog";
import type { Agent as SetupAgent } from "@/components/setup/agents";
import { useNames } from "@/hooks/useNames";
import { useNow, useSnapshot } from "@/hooks/useSnapshot";
import { useToast } from "@/hooks/useToast";
import { useWallet } from "@/hooks/useWallet";
import { agentLabel, toUnits, toUsdc } from "@/lib/format";
import { recipients } from "@/lib/insights";
import { contractOf, networkOf } from "@/lib/reader";
import type { Agent, Proposal, Request, Snapshot } from "@/lib/types";
import ActivityCard from "./ActivityCard";
import AgentList from "./AgentList";
import AgentsCard from "./AgentsCard";
import AmountDialog, { type AmountAsk } from "./AmountDialog";
import ApprovalCard from "./ApprovalCard";
import BalanceHero from "./BalanceHero";
import ConnectCard from "./ConnectCard";
import PageHeader from "./PageHeader";
import ProposalCard from "./ProposalCard";
import RecipientsView from "./RecipientsView";
import SettingsView from "./SettingsView";
import Sidebar from "./Sidebar";
import Skeleton from "./Skeleton";
import Section from "./Section";
import SpendCard from "./SpendCard";
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
  const [setup, setSetup] = useState<SetupAgent | null>(null);

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
  const openSetup = useCallback(() => setSetup("claude"), []);

  const waiting = snap ? snap.requests.length + snap.proposals.length : 0;

  const waitingCards = (s: Snapshot, limit?: number) => {
    const cards = [
      ...s.requests.map((r) => <ApprovalCard key={`r${r.id}`} request={r} agent={s.agents.find((a) => a.key === r.key)} names={names} now={now} busy={busy} onApprove={() => approve(r)} onDeny={() => deny(r)} />),
      ...s.proposals.map((p) => <ProposalCard key={`p${p.id}`} proposal={p} names={names} busy={busy} onDismiss={() => dismiss(p)} />),
    ];
    return limit ? cards.slice(0, limit) : cards;
  };

  const caughtUp = (
    <section className={`${styles.card} ${styles.caughtUp}`}>
      <Check size={20} className={styles.good} aria-hidden="true" />
      <strong>Nothing waiting</strong>
      <span>When an agent asks to pay above its limit, it lands here.</span>
    </section>
  );

  let page: React.ReactNode = null;
  if (snap) {
    const active = snap.agents.filter((a) => a.policy.active).length;
    const revoked = snap.agents.length - active;
    if (view === "overview") {
      page = (
        <div className={styles.column}>
          <BalanceHero vault={snap.vault} contract={snap.contract} busy={busy} onDeposit={deposit} onSetup={openSetup} />
          {waiting > 0 && (
            <Section title="Waiting on you" count={waiting} aside={waiting > 1 ? <a className={styles.sectionLink} href="#approvals">See all</a> : undefined}>
              {waitingCards(snap, 1)}
            </Section>
          )}
          <Section title="Spending" aside={<button className={styles.sectionLink} onClick={withdraw} disabled={busy !== null || snap.vault === BigInt(0)}>Withdraw</button>}>
            <SpendCard snapshot={snap} now={now} />
          </Section>
          <Section title="Your agents" count={active} aside={<a className={styles.sectionLink} href="#agents">Manage</a>}>
            <AgentsCard agents={snap.agents} names={names} paused={snap.paused} />
          </Section>
          <Section title="Recent activity" aside={<a className={styles.sectionLink} href="#activity">See all</a>}>
            <ActivityCard log={snap.log} names={names} limit={5} />
          </Section>
        </div>
      );
    } else if (view === "agents") {
      page = (
        <div className={styles.column}>
          <PageHeader title="Agents" status={`${active} active${revoked ? `, ${revoked} revoked` : ""}`} action={<button className={styles.dark} onClick={openSetup}><Plus size={17} /> New agent</button>} />
          <ConnectCard onPick={setSetup} />
          <AgentList agents={snap.agents} names={names} paused={snap.paused} busy={busy} onRevoke={revoke} />
        </div>
      );
    } else if (view === "approvals") {
      page = (
        <div className={styles.column}>
          <PageHeader title="Approvals" status={waiting ? `${waiting} waiting on you` : "All caught up"} action={waiting ? undefined : <span className={styles.caughtBadge} aria-hidden="true"><Check size={18} /></span>} />
          <div className={styles.approvalList}>{waiting ? waitingCards(snap) : caughtUp}</div>
        </div>
      );
    } else if (view === "activity") {
      page = (
        <div className={styles.column}>
          <PageHeader title="Activity" status={`Last ${snap.log.length} events on chain`} />
          <ActivityCard log={snap.log} names={names} full />
        </div>
      );
    } else if (view === "recipients") {
      const count = recipients(snap.agents, snap.log).list.length;
      page = (
        <div className={styles.column}>
          <PageHeader title="Recipients" status={`${count} ${count === 1 ? "account" : "accounts"} your agents may pay`} action={<button className={styles.dark} onClick={() => (window.location.hash = "agents")}>Edit lists</button>} />
          <RecipientsView agents={snap.agents} log={snap.log} names={names} />
        </div>
      );
    } else {
      page = (
        <div className={styles.column}>
          <PageHeader title="Settings" status="How your vault behaves and where it lives" />
          <SettingsView snapshot={snap} busy={busy} canAct={wallet.isOwner} onWindow={setWindow} onPause={pause} onResume={resume} />
        </div>
      );
    }
  }

  return (
    <div className={styles.app}>
      <Sidebar
        view={view}
        waiting={waiting}
        owner={owner}
        network={network}
        account={wallet.account}
        paused={snap?.paused}
        canAct={wallet.isOwner}
        busy={busy}
        onConnect={wallet.onConnect}
        onDisconnect={wallet.onDisconnect}
        onPause={pause}
        onResume={resume}
        onSetup={openSetup}
      />
      <main className={styles.main}>
        <div className={styles.phoneBar}>
          <a href="/" className="wordmark" aria-label="Leash home"><span className="mark" aria-hidden="true" />Leash</a>
          {wallet.account
            ? <button className={styles.dark} onClick={wallet.onDisconnect}>Connected</button>
            : <button className={styles.white} onClick={wallet.onConnect}>Connect wallet</button>}
        </div>
        {snap?.paused && <div className={styles.banner}>Paused. No agent can pay until you resume.</div>}
        {!snap && error && (
          <div className={styles.empty}>
            <h1 className="display">No vault here yet.</h1>
            <p>There is no Leash contract at <span className="mono">{contract}</span>. The owner creates one with <span className="mono">leash init</span>.</p>
            <a className={styles.dark} href="/">Back to Leash</a>
          </div>
        )}
        {!snap && !error && <Skeleton />}
        {page}
      </main>
      <AmountDialog ask={ask} onClose={() => setAsk(null)} />
      <SetupDialog agent={setup} onClose={() => setSetup(null)} onSwitch={setSetup} />
      {toast && <div className={styles.toast} data-bad={toast.bad || undefined} role="status">{toast.text}</div>}
    </div>
  );
}
