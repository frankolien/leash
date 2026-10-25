"use client";

// The owner's one page, composed from the sections. State lives in the hooks; the sections only
// draw and call back.

import { useCallback, useState } from "react";
import SiteFooter from "@/components/site/SiteFooter";
import Atmosphere from "@/components/site/Atmosphere";
import SiteHeader from "@/components/site/SiteHeader";
import { useNames } from "@/hooks/useNames";
import { useNow, useSnapshot } from "@/hooks/useSnapshot";
import { useToast } from "@/hooks/useToast";
import { useWallet } from "@/hooks/useWallet";
import { agentLabel, toUnits, toUsdc } from "@/lib/format";
import { contractOf, networkOf } from "@/lib/reader";
import type { Agent, Proposal, Request } from "@/lib/types";
import Activity from "./Activity";
import AgentCard from "./AgentCard";
import AmountDialog, { type AmountAsk } from "./AmountDialog";
import NewAgent from "./NewAgent";
import Overview from "./Overview";
import ProposalCard from "./ProposalCard";
import RequestCard from "./RequestCard";
import Wallet from "./Wallet";
import styles from "./dashboard.module.css";

const ONE_YOCTO = BigInt(1);

export default function Dashboard({ owner, contract: contractOverride }: { owner: string; contract?: string }) {
  const network = networkOf(owner);
  const contract = contractOverride ?? contractOf(owner);
  const { snapshot: snap, error, refresh } = useSnapshot(owner, contract, network);
  const { toast, say } = useToast();
  const wallet = useWallet(owner, network, refresh, say);
  const names = useNames(owner, snap?.agents);
  const now = useNow();
  const [ask, setAsk] = useState<AmountAsk | null>(null);

  const { act, call, busy } = wallet;
  const approve = useCallback((r: Request) => act("approve", () => call(contract, "approve", { request_id: r.id }), `Approved ${toUsdc(r.amount)} USDC to ${r.to}`), [act, call, contract]);
  const deny = useCallback((r: Request) => act("deny", () => call(contract, "deny", { request_id: r.id }), `Denied request ${r.id}. Nothing moved.`), [act, call, contract]);
  const dismiss = useCallback((p: Proposal) => act("dismiss", () => call(contract, "dismiss_proposal", { proposal_id: p.id }), "Dismissed"), [act, call, contract]);
  const revoke = useCallback((a: Agent) => act("revoke", () => call(contract, "revoke", { public_key: a.key }), `${agentLabel(a.key, names)} can no longer pay`), [act, call, contract, names]);
  const pause = useCallback(() => act("pause", () => call(contract, "pause", {}), "Paused. No agent can pay until you resume."), [act, call, contract]);
  const resume = useCallback(() => act("resume", () => call(contract, "resume", {}), "Resumed"), [act, call, contract]);
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

  const header = (
    <SiteHeader
      right={<Wallet owner={owner} network={network} account={wallet.account} onConnect={wallet.onConnect} onDisconnect={wallet.onDisconnect} />}
    />
  );

  if (!snap) {
    return (
      <main className={styles.page}>
        <Atmosphere />
        {header}
        <div className={styles.state}>
          {error ? (
            <>
              <span className="tag">{owner}</span>
              <h1>No vault here yet.</h1>
              <p>There is no Leash contract at <span className="mono">{contract}</span>. The owner creates one with <span className="mono">leash init</span>.</p>
              <a className="btn" href="/">Back to Leash</a>
            </>
          ) : (
            <>
              <span className="tag">{owner}</span>
              <h1>Reading the chain…</h1>
            </>
          )}
        </div>
      </main>
    );
  }

  const waiting = snap.requests.length + snap.proposals.length;
  const live = snap.agents.filter((a) => a.policy.active).length;
  const agentsTitle = snap.agents.length === 0 ? "No agents yet." : snap.paused ? "Paused. No agent can pay." : `${live} ${live === 1 ? "agent can" : "agents can"} pay.`;

  return (
    <main className={styles.page}>
      <Atmosphere />
      {header}
      <div className={styles.shell}>
        <Overview snapshot={snap} busy={busy} canAct={wallet.isOwner} onDeposit={deposit} onWithdraw={withdraw} onPause={pause} onResume={resume} waiting={waiting}>
          {snap.requests.map((r) => <RequestCard key={r.id} request={r} names={names} now={now} busy={busy} onApprove={() => approve(r)} onDeny={() => deny(r)} />)}
          {snap.proposals.map((p) => <ProposalCard key={`p${p.id}`} proposal={p} names={names} busy={busy} onDismiss={() => dismiss(p)} />)}
        </Overview>

        <section id="agents" className={styles.section} aria-labelledby="agents-title">
          <div className={styles.sectionHead}>
            <span className="tag">Agents</span>
            <h2 id="agents-title">{agentsTitle}</h2>
            <p>Limits reset 24 hours after an agent&apos;s first payment of the day.</p>
          </div>
          <div className={styles.agents}>
            {snap.agents.map((a) => <AgentCard key={a.key} agent={a} names={names} paused={snap.paused} busy={busy} onRevoke={() => revoke(a)} />)}
            <NewAgent />
          </div>
        </section>

        <section id="activity" className={`${styles.section} ${styles.activity}`} aria-labelledby="activity-title">
          <div className={styles.sectionHead}>
            <span className="tag">Activity</span>
            <h2 id="activity-title">Every move, on chain.</h2>
            <p>The last {snap.log.length} events, newest first. Refusals belong here too: they are the limits working.</p>
          </div>
          <Activity log={snap.log} names={names} />
        </section>
      </div>
      <SiteFooter />
      <AmountDialog ask={ask} onClose={() => setAsk(null)} />
      {toast && <div className={styles.toast} data-bad={toast.bad || undefined} role="status">{toast.text}</div>}
    </main>
  );
}
