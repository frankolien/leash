"use client";

// The header's right side: which network this dashboard reads, and who is connected. The owner's
// own wallet reads "you"; any other account is named, because it cannot act here.

import { Wallet as WalletIcon } from "lucide-react";
import styles from "./dashboard.module.css";

export default function Wallet({ owner, network, account, onConnect, onDisconnect }: { owner: string; network: string; account: string | null; onConnect: () => void; onDisconnect: () => void }) {
  return (
    <>
      <span className={styles.network}><span data-network={network} />{network === "mainnet" ? "Mainnet" : "Testnet"}</span>
      {account ? (
        <button className="pill" onClick={onDisconnect} title="Disconnect">
          <span className={styles.statusDot} data-tone={account === owner ? "good" : "warn"} />
          <span className="mono">{account === owner ? "you" : account}</span>
        </button>
      ) : (
        <button className="pill primary" onClick={onConnect}><WalletIcon size={15} /> Connect wallet</button>
      )}
    </>
  );
}
