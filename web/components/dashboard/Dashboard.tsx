"use client";

// The owner's dashboard as an app: a sidebar with the views, the kill switch and the wallet, and
// six views addressed by the URL hash, each opening with a title, its state and one main action.
// State lives in the hooks; the cards only draw and call back.

import { useCallback, useEffect, useState } from "react";
import { Check, Pause, Play, Plus } from "lucide-react";
import type { Agent as SetupAgent } from "@/components/setup/agents";
import { useLiveActivity } from "@/hooks/useLiveActivity";
import { useNames } from "@/hooks/useNames";
import { useNow, useSnapshot } from "@/hooks/useSnapshot";
import { useToast } from "@/hooks/useToast";
import { useWallet } from "@/hooks/useWallet";
import { agentLabel, toUnits, toUsdc } from "@/lib/format";
import { askLength, duration } from "@/lib/raise";
import { greeting, recipients } from "@/lib/insights";
import { USDC, contractOf, networkOf } from "@/lib/config";
import { FundAccount, ReceiveAddress } from "./DepositDetail";
import { useAuth } from "@/components/auth/AuthContext";
import type { Agent, Proposal, Request, Snapshot, Task } from "@/lib/types";
import ActivityCard from "./ActivityCard";
import AgentList from "./AgentList";
import AgentsCard from "./AgentsCard";
import AmountPanel, { type AmountAsk } from "./AmountPanel";
import ApprovalCard from "./ApprovalCard";
import NewAgentPanel from "./NewAgentPanel";
import ApprovalPanel, { useApprovalQueue } from "./ApprovalPanel";
import ChatGptPanel from "./ChatGptPanel";
import ConnectCard from "./ConnectCard";
import PageHeader from "./PageHeader";
import ProposalCard from "./ProposalCard";
import RecipientsView from "./RecipientsView";
import SettingsView from "./SettingsView";
import Sidebar from "./Sidebar";
import Skeleton from "./Skeleton";
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

export default function Dashboard({ owner, contract: contractOverride }: { owner: string; contract?: string }) {
  const network = networkOf(owner);
  const contract = contractOverride ?? contractOf(owner);
  const { snapshot: snap, error, refresh } = useSnapshot(owner, contract, network);
  const { toast, say } = useToast();
  const wallet = useWallet(owner, refresh, say);
  const names = useNames(owner, snap?.agents, snap?.tasks);
  const now = useNow();
  const view = useView();
  const [moving, setMoving] = useState<"deposit" | "withdraw" | null>(null);
  const { testUsdc } = useAuth();
  const [setup, setSetup] = useState<SetupAgent | null>(null);
  const [chatGpt, setChatGpt] = useState(false);
  const queue = useApprovalQueue(snap?.requests);
  useLiveActivity(snap?.log, names, say);

  const { act, call, busy } = wallet;
  const approve = useCallback((r: Request) => act("approve", () => call(contract, "approve", { request_id: r.id }), `Approved ${toUsdc(r.amount)} USDC to ${r.to}`), [act, call, contract]);
  const deny = useCallback((r: Request) => act("deny", () => call(contract, "deny", { request_id: r.id }), `Denied request ${r.id}. Nothing moved.`), [act, call, contract]);
  const dismiss = useCallback((p: Proposal) => act("dismiss", () => call(contract, "dismiss_proposal", { proposal_id: p.id }), "Dismissed"), [act, call, contract]);
  const grant = useCallback((p: Proposal) => act("grant", () => call(contract, "grant", { proposal_id: p.id }), `Granted to ${agentLabel(p.key, names)} for ${duration(askLength(p.ask ?? { allow: [], for_secs: 0 }))}. It ends on its own.`), [act, call, contract, names]);
  const endTask = useCallback((t: Task) => act("close the task", () => call(contract, "close_task", { task_id: t.id }), `Closed ${t.label}. What it did not spend stays in the vault.`), [act, call, contract]);
  const endRaise = useCallback((a: Agent) => act("end the raise", () => call(contract, "end_raise", { public_key: a.key }), `${agentLabel(a.key, names)} is back to its usual limits`), [act, call, contract, names]);
  // Revoke stops the policy on Leash, then deletes the key from the owner's account, so NEAR
  // rejects the agent's next call before the contract runs.
  const revoke = useCallback((a: Agent) => act("revoke", async () => {
    await call(contract, "revoke", { public_key: a.key });
    await wallet.session?.deleteKey(a.key).catch(() => undefined);
  }, `${agentLabel(a.key, names)} can no longer pay`), [act, call, contract, names, wallet.session]);
  const pause = useCallback(() => act("pause", () => call(contract, "pause", {}), "Paused. No agent can pay until you resume."), [act, call, contract]);
  const resume = useCallback(() => act("resume", () => call(contract, "resume", {}), "Resumed"), [act, call, contract]);
  const setWindow = useCallback((secs: number) => act("set the approval window", () => call(contract, "set_request_ttl", { secs }), `Requests now wait ${Math.round(secs / 60)} minutes`), [act, call, contract]);
  // One side panel: opening a task replaces whatever task was open.
  const deposit = useCallback(() => {
    setSetup(null);
    setChatGpt(false);
    setMoving("deposit");
  }, []);
  const withdraw = useCallback(() => {
    setSetup(null);
    setChatGpt(false);
    setMoving("withdraw");
  }, []);
  const funded = useCallback(async (text: string, bad?: boolean) => {
    say(text, bad);
    await refresh();
  }, [say, refresh]);

  // Built from the latest snapshot on every render, so the panel sees money as it arrives.
  let ask: AmountAsk | null = null;
  if (snap && moving === "deposit") {
    ask = {
      title: "Add money",
      hint: "Moves USDC from your account into the vault your agents spend from.",
      detail: <ReceiveAddress owner={owner} />,
      confirm: "Add to vault",
      initial: toUsdc(snap.held < toUnits("10") ? snap.held : toUnits("10")),
      max: snap.held,
      source: "in your account",
      empty: <FundAccount owner={owner} testnet={network === "testnet"} testUsdc={wallet.isOwner ? testUsdc : null} onFunded={funded} />,
      onConfirm: (usdc) => act("deposit", () => call(snap.token, "ft_transfer_call", { receiver_id: contract, amount: toUnits(usdc).toString(), msg: "" }, ONE_YOCTO), `Added ${usdc} USDC to the vault`),
    };
  } else if (snap && moving === "withdraw") {
    ask = {
      title: "Withdraw",
      hint: "Moves USDC from the vault back to your account. Agents keep their limits.",
      confirm: "Withdraw",
      initial: toUsdc(snap.vault),
      max: snap.vault,
      source: "in the vault",
      empty: <p className={styles.panelHint}>The vault is empty, so there is nothing to withdraw.</p>,
      onConfirm: (usdc) => act("withdraw", () => call(contract, "withdraw", { token: snap.token, amount: toUnits(usdc).toString() }), `Withdrew ${usdc} USDC`),
    };
  }
  const pickSetup = useCallback((kind: SetupAgent) => {
    setMoving(null);
    setChatGpt(false);
    setSetup(kind);
  }, []);
  const openSetup = useCallback(() => pickSetup("claude"), [pickSetup]);
  const openChatGpt = useCallback(() => {
    setMoving(null);
    setSetup(null);
    setChatGpt(true);
  }, []);
  const closeTask = useCallback(() => {
    setMoving(null);
    setChatGpt(false);
    setSetup(null);
  }, []);
  const task = moving !== null || setup !== null || chatGpt;
  const showApprovals = useCallback(() => {
    closeTask();
    queue.reopen();
  }, [closeTask, queue]);
  const afterAgent = useCallback(async () => { await refresh(); }, [refresh]);

  const waiting = snap ? snap.requests.length + snap.proposals.length : 0;

  const waitingCards = (s: Snapshot, limit?: number) => {
    const cards = [
      ...s.requests.map((r) => <ApprovalCard key={`r${r.id}`} request={r} agent={s.agents.find((a) => a.key === r.key)} log={s.log} network={network} names={names} now={now} busy={busy} onApprove={() => approve(r)} onDeny={() => deny(r)} />),
      ...s.proposals.map((p) => <ProposalCard key={`p${p.id}`} proposal={p} agent={s.agents.find((a) => a.key === p.key)} names={names} busy={busy} onGrant={() => grant(p)} onDismiss={() => dismiss(p)} />),
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
        <div className={styles.overview}>
          <header className={styles.ovHead}>
            <div><span className={styles.muted}>{new Date(now).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</span><h1>{greeting(now)}</h1></div>
            <div className={styles.ovActions}>
              {queue.pending.length > 0 && (task || !queue.next) && <button className={styles.waitingPill} onClick={showApprovals}><span className={styles.pulse} aria-hidden="true" />{queue.pending.length} waiting</button>}
              {snap.paused
                ? <button className={styles.dark} onClick={resume} disabled={busy !== null || !wallet.isOwner}><Play size={16} /> Resume</button>
                : <button className={styles.dark} onClick={pause} disabled={busy !== null || !wallet.isOwner} title="Stops every agent key at once"><Pause size={16} /> Pause all</button>}
              <button className={styles.whiteSm} onClick={deposit} disabled={busy !== null}><Plus size={16} /> Add money</button>
            </div>
          </header>
          <VaultCard snapshot={snap} now={now} busy={busy} onWithdraw={withdraw} onDeposit={deposit} />
          <AgentsCard agents={snap.agents} names={names} paused={snap.paused} proposals={snap.proposals} tasks={snap.tasks} busy={busy} onGrant={grant} onDismiss={dismiss} onAdd={openSetup} />
          <ActivityCard log={snap.log} names={names} limit={6} />
        </div>
      );
    } else if (view === "agents") {
      page = (
        <div className={styles.column}>
          <PageHeader title="Agents" status={`${active} active${revoked ? `, ${revoked} revoked` : ""}`} action={<button className={styles.dark} onClick={openSetup}><Plus size={17} /> New agent</button>} />
          <ConnectCard onPick={pickSetup} onChatGpt={openChatGpt} />
          <AgentList agents={snap.agents} tasks={snap.tasks} names={names} paused={snap.paused} busy={busy} onRevoke={revoke} onEndRaise={endRaise} onCloseTask={endTask} />
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
    <div className={styles.app} data-panel={snap && (task || queue.next) ? "" : undefined}>
      <Sidebar
        view={view}
        waiting={waiting}
        owner={owner}
        network={network}
        account={wallet.account}
        accountLabel={wallet.session?.label}
        paused={snap?.paused}
        canAct={wallet.isOwner}
        busy={busy}
        onConnect={wallet.onConnect}
        authReady={wallet.ready}
        preparing={wallet.preparing}
        onDisconnect={wallet.onDisconnect}
        onPause={pause}
        onResume={resume}
      />
      <main className={styles.main}>
        <div className={styles.phoneBar}>
          <a href="/" className="wordmark" aria-label="Leash home"><span className="mark" aria-hidden="true" />Leash</a>
          {wallet.account
            ? <button className={styles.dark} onClick={wallet.onDisconnect}>Sign out</button>
            : wallet.ready && !wallet.preparing && <button className={styles.white} onClick={wallet.onConnect}>Sign in</button>}
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
      {ask && <AmountPanel key={`${moving}-${ask.max > BigInt(0)}`} ask={ask} onClose={closeTask} />}
      {snap && chatGpt && <ChatGptPanel onClose={closeTask} />}
      {snap && setup && <NewAgentPanel key={setup} kind={setup} session={wallet.session} owner={owner} contract={contract} token={snap.token ?? USDC[network]} onClose={closeTask} onSignIn={wallet.onConnect} onCreated={afterAgent} />}
      {snap && !task && queue.next && <ApprovalPanel request={queue.next} total={queue.pending.length} agents={snap.agents} log={snap.log} network={network} names={names} now={now} busy={busy} onApprove={approve} onDeny={deny} onClose={queue.later} />}
      {toast && <div className={styles.toast} data-bad={toast.bad || undefined} role="status">{toast.text}</div>}
    </div>
  );
}
