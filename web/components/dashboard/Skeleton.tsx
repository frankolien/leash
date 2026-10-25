// The overview's shape while the first read is in flight, so the page never opens empty.

import styles from "./dashboard.module.css";

export default function Skeleton() {
  return (
    <div className={styles.column} aria-busy="true" aria-label="Reading the chain">
      <span className={styles.bone} style={{ width: 200, height: 18 }} />
      <span className={styles.bone} style={{ width: 220, height: 56 }} />
      <div className={styles.heroActions}><span className={styles.bone} style={{ height: 56, borderRadius: 999 }} /><span className={styles.bone} style={{ height: 56, borderRadius: 999 }} /></div>
      <span className={styles.bone} style={{ width: 160, height: 22, marginTop: 10 }} />
      <span className={styles.bone} style={{ height: 220, borderRadius: 24 }} />
      <span className={styles.bone} style={{ width: 140, height: 22, marginTop: 10 }} />
      <span className={styles.bone} style={{ height: 86, borderRadius: 24 }} />
      <span className={styles.bone} style={{ height: 86, borderRadius: 24 }} />
    </div>
  );
}
