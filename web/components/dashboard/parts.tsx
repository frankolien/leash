// Small pieces the dashboard sections share.

import styles from "./dashboard.module.css";

const TINTS = ["blue", "sand", "green", "lilac"] as const;

/// A round badge with the agent's initial, tinted by name so the same agent keeps its colour.
export function AgentBadge({ name, size = 40 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className={styles.badge} data-tint={TINTS[h % TINTS.length]} style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/// A thin budget or time bar. Share runs from 0 to 1.
export function Track({ share, tone }: { share: number; tone?: "warn" | "bad" }) {
  return (
    <div className={styles.track} data-tone={tone}>
      <span style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }} />
    </div>
  );
}

/// Dollars with the cents set smaller, the way a bank app shows money.
export function Money({ whole, cents, className }: { whole: string; cents: string; className?: string }) {
  return <strong className={className}>${whole}<span>.{cents}</span></strong>;
}
