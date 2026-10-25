"use client";

// The app's navigation and the owner's wallet. On a phone the links become a bar along the bottom.

import { Activity, Bell, LayoutGrid, Settings, Users, Wallet } from "lucide-react";
import type { View } from "./views";
import styles from "./dashboard.module.css";

const LINKS: { view: View; label: string; icon: typeof Activity }[] = [
  { view: "overview", label: "Overview", icon: LayoutGrid },
  { view: "agents", label: "Agents", icon: Users },
  { view: "approvals", label: "Approvals", icon: Bell },
  { view: "activity", label: "Activity", icon: Activity },
  { view: "settings", label: "Settings", icon: Settings },
];

export default function Sidebar(props: { view: View; waiting: number; owner: string; network: string; account: string | null; onConnect: () => void; onDisconnect: () => void }) {
  const { view, waiting, owner, network, account, onConnect, onDisconnect } = props;
  return (
    <aside className={styles.sidebar}>
      <a href="/" className={`wordmark ${styles.brand}`} aria-label="Leash home"><span className="mark" aria-hidden="true" />Leash</a>
      <nav className={styles.nav} aria-label="Dashboard">
        {LINKS.map(({ view: v, label, icon: Icon }) => (
          <a key={v} href={`#${v}`} aria-current={view === v ? "page" : undefined}>
            <Icon size={17} />
            <span>{label}</span>
            {v === "approvals" && waiting > 0 && <em aria-label={`${waiting} waiting`}>{waiting}</em>}
          </a>
        ))}
      </nav>
      <div className={styles.wallet}>
        <span className={styles.walletOwner}>
          <span className="mono">{owner}</span>
          <small>{network === "mainnet" ? "Mainnet" : "Testnet"}</small>
        </span>
        {account ? (
          <button className={styles.walletButton} onClick={onDisconnect} title="Disconnect">
            {account === owner ? "Connected" : <>Connected as <span className="mono">{account}</span></>}
          </button>
        ) : (
          <button className="btn ink" onClick={onConnect}><Wallet size={15} /> Connect wallet</button>
        )}
      </div>
    </aside>
  );
}
