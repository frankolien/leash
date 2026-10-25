// The page's ground: three soft washes of sage, sand and sky that drift slowly behind everything,
// with a fine grain so the gradients read as light rather than as a fill.

import styles from "./atmosphere.module.css";

export default function Atmosphere() {
  return (
    <div className={styles.atmosphere} aria-hidden="true">
      <span className={styles.sage} />
      <span className={styles.sand} />
      <span className={styles.sky} />
      <span className={styles.grain} />
    </div>
  );
}
