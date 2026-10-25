// Small pieces the dashboard cards share.

import styles from "./dashboard.module.css";

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

export function CardHead({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return <div className={styles.cardHead}><strong>{title}</strong>{aside}</div>;
}
