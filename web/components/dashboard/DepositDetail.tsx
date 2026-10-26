"use client";

// Where USDC comes from before it goes into the vault: the owner's own account. Shows the account
// to send to (with a code a phone wallet can scan) and, on testnet, a tap for test USDC.

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import QRCode from "qrcode";
import { plainError } from "@/lib/errors";
import styles from "./dashboard.module.css";

function useQr(text: string) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#ffffff", light: "#00000000" } }).then(setSvg, () => setSvg(null));
  }, [text]);
  return svg;
}

export function ReceiveAddress({ owner, scan = false }: { owner: string; scan?: boolean }) {
  const [copied, setCopied] = useState(false);
  const qr = useQr(owner);
  return (
    <div className={styles.receive} data-scan={scan || undefined}>
      {scan && qr && <span className={styles.qr} role="img" aria-label="Code for your account" dangerouslySetInnerHTML={{ __html: qr }} />}
      <span className={styles.muted}>Send USDC on NEAR to</span>
      <button className={styles.copyAddress} onClick={async () => { await navigator.clipboard.writeText(owner); setCopied(true); setTimeout(() => setCopied(false), 1500); }} aria-label="Copy your account">
        <span className="mono">{owner}</span>{copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
}

/// The empty state of Add money: nothing in the owner's account yet.
function useTapInStock(enabled: boolean) {
  const [inStock, setInStock] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    fetch("/api/test-usdc").then((r) => r.json()).then((b: { available?: boolean }) => setInStock(!!b.available), () => setInStock(false));
  }, [enabled]);
  return inStock;
}

export function FundAccount({ owner, testnet, testUsdc, onFunded }: { owner: string; testnet: boolean; testUsdc: (() => Promise<void>) | null; onFunded: (text: string, bad?: boolean) => void }) {
  const inStock = useTapInStock(testnet && testUsdc !== null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function tap() {
    if (!testUsdc) return;
    setBusy(true);
    setProblem(null);
    try {
      await testUsdc();
      onFunded("$5 of test USDC is in your account");
    } catch (e) {
      setProblem(plainError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.fund}>
      <div className={styles.fundHead}>
        <strong>Your account has no USDC yet</strong>
        <span className={styles.muted}>Add some to your account first, then move it into the vault for your agents.</span>
      </div>
      {testnet && testUsdc && inStock && (
        <button className={`${styles.white} ${styles.wide}`} onClick={tap} disabled={busy}>{busy && <Loader2 size={17} className={styles.spin} />}Get $5 of test USDC</button>
      )}
      {problem && <p className={styles.formError} role="alert">{problem}</p>}
      <ReceiveAddress owner={owner} scan />
      {testnet && (
        <a className={styles.faucet} href="https://faucet.circle.com" target="_blank" rel="noreferrer">
          Or use Circle's testnet faucet: pick NEAR Testnet and paste your account <ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}
