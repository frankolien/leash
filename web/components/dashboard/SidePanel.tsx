"use client";

// The right-hand panel for anything the owner starts from the dashboard (adding money, a new
// agent), the same place payments waiting for approval appear, so the page stays in view while they
// finish it. Escape closes it.

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./dashboard.module.css";

export default function SidePanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside className={styles.sidePanel} aria-label={title}>
      <div className={styles.panelBar}>
        <span>{title}</span>
        <button onClick={onClose} aria-label="Close"><X size={17} /></button>
      </div>
      <div className={styles.panelCard}>{children}</div>
    </aside>
  );
}
