"use client";

// The app's navigation. The views sit at the top; the kill switch, a setup card for a first agent,
// the owner's wallet and Settings are pinned to the bottom so they are always one tap away. On a
// phone the views become a bar along the bottom.

import { useEffect, useState } from "react";
import { Activity, Bell, LayoutGrid, Pause, Play, Settings, Users, X, BookUser } from "lucide-react";
import { shortAccount } from "@/lib/config";
import { claudeInstallLink, siteOrigin } from "@/lib/connector";
import type { View } from "./views";
import styles from "./dashboard.module.css";

const LINKS: { view: View; label: string; icon: typeof Activity }[] = [
  { view: "overview", label: "Overview", icon: LayoutGrid },
  { view: "agents", label: "Agents", icon: Users },
  { view: "approvals", label: "Approvals", icon: Bell },
  { view: "activity", label: "Activity", icon: Activity },
  { view: "recipients", label: "Recipients", icon: BookUser },
];

const PROMO_KEY = "leash.promo.dismissed";

export default function Sidebar(props: {
  view: View;
  waiting: number;
  owner: string;
  network: string;
  account: string | null;
  /// The signed-in person in their own terms (an email), when they signed in that way.
  accountLabel?: string;
  paused?: boolean;
  canAct: boolean;
  busy: string | null;
  onConnect: () => void;
  /// False until the sign-in providers have restored any session, so a returning owner never sees
  /// "Sign in" flash; preparing names the account setup running in the background.
  authReady: boolean;
  preparing: string | null;
  onDisconnect: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const { view, waiting, owner, network, account, accountLabel, paused, canAct, busy, onConnect, onDisconnect, onPause, onResume, authReady, preparing } = props;
  const [promo, setPromo] = useState(false);
  useEffect(() => {
    try { setPromo(window.localStorage.getItem(PROMO_KEY) !== "1"); } catch { setPromo(true); }
  }, []);
  const dismiss = () => {
    setPromo(false);
    try { window.localStorage.setItem(PROMO_KEY, "1"); } catch {}
  };

  return (
    <aside className={styles.sidebar}>
      <a href="/" className={`wordmark ${styles.brand}`} aria-label="Leash home"><span className="mark" aria-hidden="true" />Leash</a>
      <nav className={styles.nav} aria-label="Dashboard">
        {LINKS.map(({ view: v, label, icon: Icon }) => (
          <a key={v} href={`#${v}`} aria-current={view === v ? "page" : undefined}>
            <Icon size={20} strokeWidth={1.8} />
            <span>{label}</span>
            {v === "approvals" && waiting > 0 && <em aria-label={`${waiting} waiting`}>{waiting}</em>}
          </a>
        ))}
        <a href="#settings" className={styles.phoneTab} aria-current={view === "settings" ? "page" : undefined}><Settings size={20} strokeWidth={1.8} /><span>Settings</span></a>
      </nav>

      <div className={styles.sideBottom}>
        {paused !== undefined && (
          <button className={styles.kill} data-paused={paused} onClick={paused ? onResume : onPause} disabled={busy !== null || !canAct} title={canAct ? undefined : `Connect ${owner} to use the kill switch`}>
            {paused ? <Play size={16} /> : <Pause size={16} />}
            <span>{paused ? "Paused. Resume agents" : "Pause all agents"}</span>
          </button>
        )}
        {promo && (
          <div className={styles.promo}>
            <button className={styles.promoClose} onClick={dismiss} aria-label="Dismiss"><X size={14} /></button>
            <strong>Put Claude on a leash.</strong>
            <span>In the Claude app on your Mac or phone. About a minute.</span>
            <a className={styles.promoGo} href={claudeInstallLink(siteOrigin())} target="_blank" rel="noreferrer">Open in Claude</a>
          </div>
        )}
        <div className={styles.account}>
          {account ? (
            <>
              <span className={styles.accountId}>{accountLabel ?? shortAccount(account)}<small>{account === owner ? (accountLabel ? `${shortAccount(account)}, ${network}` : network === "mainnet" ? "Mainnet" : "Testnet") : `Viewing ${shortAccount(owner)}`}</small></span>
              <button className={styles.accountButton} onClick={onDisconnect}>Sign out</button>
            </>
          ) : !authReady || preparing ? (
            <span className={styles.accountId}>{shortAccount(owner)}<small>{preparing ? `${preparing}…` : "Signing you in…"}</small></span>
          ) : (
            <>
              <span className={styles.accountId}>{shortAccount(owner)}<small>{network === "mainnet" ? "Mainnet" : "Testnet"}, read only</small></span>
              <button className="btn ink" onClick={onConnect}>Sign in</button>
            </>
          )}
        </div>
        <a href="#settings" className={styles.settingsLink} aria-current={view === "settings" ? "page" : undefined}><Settings size={20} strokeWidth={1.8} /><span>Settings</span></a>
      </div>
    </aside>
  );
}
