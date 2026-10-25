// The overview's shape while the first read is in flight, so the page never opens empty.

import styles from "./dashboard.module.css";

export default function Skeleton() {
  return (
    <div className={styles.overview} aria-busy="true" aria-label="Reading the chain">
      <div className={styles.ovHead}><span className={styles.bone} style={{ width: 260, height: 48 }} /><span className={styles.bone} style={{ width: 260, height: 43, borderRadius: 999 }} /></div>
      <span className={styles.bone} style={{ gridColumn: "1 / 3", borderRadius: 24 }} />
      <span className={styles.bone} style={{ gridColumn: 3, gridRow: "2 / 4", borderRadius: 24 }} />
      <span className={styles.bone} style={{ borderRadius: 24 }} />
      <span className={styles.bone} style={{ borderRadius: 24 }} />
    </div>
  );
}
