"use client";

// ChatGPT has no install link, so the side panel walks the owner through adding Leash by hand, with
// the URL ready to copy. Once added, ChatGPT opens Leash's Allow page like Claude does.

import { useState } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import { connectorUrl, siteOrigin } from "@/lib/connector";
import SidePanel from "./SidePanel";
import styles from "./dashboard.module.css";

export default function ChatGptPanel({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = connectorUrl(siteOrigin());
  return (
    <SidePanel title="Connect ChatGPT" onClose={onClose}>
      <ol className={styles.madeSteps}>
        <li>
          <strong>Turn on developer mode</strong>
          <span className={styles.muted}>On chatgpt.com, in Settings, Security and login, Developer mode. It is on the web only, not the phone app.</span>
          <a className={styles.dark} href="https://chatgpt.com/#settings" target="_blank" rel="noreferrer">Open ChatGPT <ArrowUpRight size={15} /></a>
        </li>
        <li>
          <strong>Add Leash</strong>
          <span className={styles.muted}>Plugins, Browse plugins, +, New plugin. Name it Leash, paste this server URL and choose OAuth.</span>
          <div className={styles.codeBox}>
            <pre>{url}</pre>
            <button aria-label="Copy" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
          </div>
        </li>
        <li>
          <strong>Connect and allow</strong>
          <span className={styles.muted}>ChatGPT opens Leash. Sign in, set its daily limit and what it may pay alone, then Allow.</span>
        </li>
      </ol>
    </SidePanel>
  );
}
