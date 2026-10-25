// Every view opens the same way: what it is, its state in a few words, and its one main action.

import type { ReactNode } from "react";
import styles from "./dashboard.module.css";

export default function PageHeader({ title, status, action }: { title: string; status: ReactNode; action?: ReactNode }) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <h1 className="display">{title}</h1>
        <span className={styles.status}>{status}</span>
      </div>
      {action}
    </header>
  );
}
