// An agent's mark: the product's logo when the agent is named after one, otherwise its initial.

import { SquareTerminal } from "lucide-react";
import { siClaude, siCursor, siGithubcopilot, siGooglegemini } from "simple-icons";
import styles from "./dashboard.module.css";

const BRANDS: Record<string, string> = { claude: siClaude.path, cursor: siCursor.path, gemini: siGooglegemini.path, copilot: siGithubcopilot.path };

export default function AgentIcon({ name, size = 30, off = false }: { name: string; size?: number; off?: boolean }) {
  const key = name.toLowerCase();
  const brand = Object.keys(BRANDS).find((b) => key.includes(b));
  return (
    <span className={styles.agentIcon} data-off={off || undefined} style={{ width: size, height: size }} aria-hidden="true">
      {brand ? (
        <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5}><path d={BRANDS[brand]} fill="currentColor" /></svg>
      ) : key.includes("codex") ? (
        <SquareTerminal size={size * 0.52} />
      ) : (
        <span style={{ fontSize: size * 0.42 }}>{name.charAt(0).toUpperCase()}</span>
      )}
    </span>
  );
}
