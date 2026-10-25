// An agent's mark in a round tile: the product's logo in its own colour when the agent is named
// after one, otherwise its initial.

import { SquareTerminal } from "lucide-react";
import { siClaude, siCursor, siGithubcopilot, siGooglegemini } from "simple-icons";
import styles from "./dashboard.module.css";

const BRANDS: Record<string, { path: string; color: string }> = {
  claude: { path: siClaude.path, color: "#D97757" },
  cursor: { path: siCursor.path, color: "#ffffff" },
  gemini: { path: siGooglegemini.path, color: "#8E75FF" },
  copilot: { path: siGithubcopilot.path, color: "#ffffff" },
};

export function brandOf(name: string) {
  const key = name.toLowerCase();
  return Object.keys(BRANDS).find((b) => key.includes(b));
}

export function BrandLogo({ name, size = 18 }: { name: string; size?: number }) {
  const brand = brandOf(name);
  if (brand) return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d={BRANDS[brand].path} fill={BRANDS[brand].color} /></svg>;
  if (name.toLowerCase().includes("codex")) return <SquareTerminal size={size} aria-hidden="true" />;
  return null;
}

export default function AgentIcon({ name, size = 44, off = false }: { name: string; size?: number; off?: boolean }) {
  const logo = <BrandLogo name={name} size={size * 0.46} />;
  return (
    <span className={styles.agentIcon} data-off={off || undefined} style={{ width: size, height: size }} aria-hidden="true">
      {logo ?? <span style={{ fontSize: size * 0.4 }}>{name.charAt(0).toUpperCase()}</span>}
    </span>
  );
}
