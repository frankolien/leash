// The last card in the agents grid: how a new agent gets its key.

import { Plus } from "lucide-react";
import styles from "./dashboard.module.css";

export default function NewAgent() {
  return (
    <div className={styles.newAgent}>
      <span className={styles.newIcon} aria-hidden="true"><Plus size={20} /></span>
      <strong>Add an agent</strong>
      <span>Grant a key from your terminal. It shows up here within ten seconds.</span>
      <code className="mono"><span>leash grant --name codex</span><span>&nbsp;&nbsp;--daily 5 --per-payment 2</span></code>
    </div>
  );
}
