// The overview's shape while the first read is in flight, so the page never opens empty.

import styles from "./dashboard.module.css";

export default function Skeleton() {
  return (
    <div className={styles.wide} aria-busy="true" aria-label="Reading the chain">
      <span className={styles.bone} style={{ width: 220, height: 16 }} />
      <span className={styles.bone} style={{ width: 160, height: 16, marginTop: 10 }} />
      <span className={styles.bone} style={{ width: 240, height: 72 }} />
      <div className={styles.heroActions}><span className={styles.bone} style={{ height: 52, borderRadius: 999 }} /><span className={styles.bone} style={{ height: 52, borderRadius: 999 }} /></div>
      <div className={styles.overview}>
        <div className={styles.column}><span className={styles.bone} style={{ height: 250, borderRadius: 20 }} /><span className={styles.bone} style={{ height: 230, borderRadius: 20 }} /></div>
        <div className={styles.column}><span className={styles.bone} style={{ height: 230, borderRadius: 20 }} /><span className={styles.bone} style={{ height: 250, borderRadius: 20 }} /></div>
      </div>
    </div>
  );
}
