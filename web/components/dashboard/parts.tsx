// Small pieces the dashboard sections share.

import styles from "./dashboard.module.css";

/// A round badge with the agent's initial.
export function AgentBadge({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span className={styles.badge} style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/// A thin budget or time bar. Share runs from 0 to 1.
export function Track({ share }: { share: number }) {
  return (
    <div className={styles.track}>
      <span style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }} />
    </div>
  );
}

/// Dollars with the cents set smaller, the way a bank app shows money.
export function Money({ whole, cents, className }: { whole: string; cents: string; className?: string }) {
  return <strong className={className}>${whole}<span>.{cents}</span></strong>;
}
