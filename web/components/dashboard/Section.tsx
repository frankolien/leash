// A titled block on the overview, with its small controls on the right.

import type { ReactNode } from "react";
import styles from "./dashboard.module.css";

export default function Section({ title, count, aside, children }: { title: string; count?: number; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.section} aria-label={title}>
      <div className={styles.sectionHead}>
        <h2>{title}{count !== undefined && <span>{count}</span>}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
