"use client";

// The owner's one page, composed from the sections. State lives in the hooks; the sections only
// draw and call back.

import { useCallback } from "react";
import Activity from "@/components/Activity";
import AgentTile from "@/components/AgentTile";
import Balance from "@/components/Balance";
import Bar from "@/components/Bar";
import NewAgent from "@/components/NewAgent";
import ProposalCard from "@/components/ProposalCard";
import RequestCard from "@/components/RequestCard";
import { useNames } from "@/hooks/useNames";
import { useNow, useSnapshot } from "@/hooks/useSnapshot";
import { useToast } from "@/hooks/useToast";
import { useWallet } from "@/hooks/useWallet";
import { agentLabel, toUnits, toUsdc } from "@/lib/format";
import { contractOf, networkOf } from "@/lib/reader";
import type { Agent, Proposal, Request } from "@/lib/types";

const ONE_YOCTO = BigInt(1);

export default function Dashboard({ owner, contract: contractOverride }: { owner: string; contract?: string }) {
  const network = networkOf(owner);
  const contract = contractOverride ?? contractOf(owner);
  const { snapshot: snap, error, refresh } = useSnapshot(owner, contract, network);
  const { toast, say } = useToast();
  const wallet = useWallet(owner, network, refresh, say);
  const names = useNames(owner, snap?.agents);
  const now = useNow();

  const { act, call, busy } = wallet;
  const approve = useCallback((r: Request) => act("approve", () => call(contract, "approve", { request_id: r.id }), `Approved ${toUsdc(r.amount)} USDC to ${r.to}`), [act, call, contract]);
  const deny = useCallback((r: Request) => act("deny", () => call(contract, "deny", { request_id: r.id }), `Denied request ${r.id}. Nothing moved.`), [act, call, contract]);
  const dismiss = useCallback((p: Proposal) => act("dismiss", () => call(contract, "dismiss_proposal", { proposal_id: p.id }), "Dismissed"), [act, call, contract]);
  const revoke = useCallback((a: Agent) => act("revoke", () => call(contract, "revoke", { public_key: a.key }), `${agentLabel(a.key, names)} can no longer pay`), [act, call, contract, names]);
  const pause = useCallback(() => act("pause", () => call(contract, "pause", {}), "Paused. No agent can pay until you resume."), [act, call, contract]);
  const resume = useCallback(() => act("resume", () => call(contract, "resume", {}), "Resumed"), [act, call, contract]);
  const deposit = useCallback(() => {
    const usdc = window.prompt("How much USDC to move into the vault?", "10");
    if (!usdc || !snap) return;
    act("deposit", () => call(snap.token, "ft_transfer_call", { receiver_id: contract, amount: toUnits(usdc).toString(), msg: "" }, ONE_YOCTO), `Deposited ${usdc} USDC`);
  }, [act, call, contract, snap]);
  const withdraw = useCallback(() => {
    const usdc = window.prompt("How much USDC to take back?", toUsdc(snap?.vault ?? BigInt(0)));
    if (!usdc || !snap) return;
    act("withdraw", () => call(contract, "withdraw", { token: snap.token, amount: toUnits(usdc).toString() }), `Withdrew ${usdc} USDC`);
  }, [act, call, contract, snap]);

  const bar = (
    <Bar
      owner={owner}
      network={network}
      account={wallet.account}
      onConnect={wallet.onConnect}
      onDisconnect={wallet.onDisconnect}
      paused={snap?.paused}
      onPause={snap ? pause : undefined}
      onResume={snap ? resume : undefined}
      busy={busy}
      canAct={wallet.isOwner}
    />
  );

  if (error && !snap) {
    return (
      <main className="page">
        {bar}
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
        {bar}
        <p className="quiet">Reading the chain…</p>
      </main>
    );
  }

  const waiting = snap.requests.length + snap.proposals.length;

  return (
    <main className="page">
      {bar}

      <Balance snapshot={snap} busy={busy} onDeposit={deposit} onWithdraw={withdraw} />

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
              <RequestCard key={r.id} request={r} names={names} now={now} busy={busy} onApprove={() => approve(r)} onDeny={() => deny(r)} />
            ))}
            {snap.proposals.map((p) => (
              <ProposalCard key={`p${p.id}`} proposal={p} names={names} busy={busy} onDismiss={() => dismiss(p)} />
            ))}
          </>
        )}
      </section>

      <section className="section" aria-label="Agents">
        <div className="section-head">
          <span className="eyebrow">Agents</span>
          <span className="quiet" style={{ fontSize: 12 }}>limits reset 24 hours after the first payment</span>
        </div>
        <div className="agents">
          {snap.agents.map((a) => (
            <AgentTile key={a.key} agent={a} names={names} paused={snap.paused} busy={busy} onRevoke={() => revoke(a)} />
          ))}
          <NewAgent />
        </div>
      </section>

      <section className="section" aria-label="Activity">
        <div className="section-head">
          <span className="eyebrow">Activity</span>
          <span className="quiet" style={{ fontSize: 12 }}>last {snap.log.length} on chain</span>
        </div>
        <Activity log={snap.log} names={names} />
      </section>

      {toast && <div className={`toast${toast.bad ? " bad" : ""}`} role="status">{toast.text}</div>}
    </main>
  );
}
