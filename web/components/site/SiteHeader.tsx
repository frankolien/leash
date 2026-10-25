// The bar every page shares: the wordmark on the left, the page's own links in the middle, and its
// actions on the right. Over the landing hero it is transparent and takes the hero's ink.

import type { ReactNode } from "react";
import styles from "./site.module.css";

export default function SiteHeader({ overHero = false, middle, right }: { overHero?: boolean; middle?: ReactNode; right?: ReactNode }) {
  return (
    <header className={styles.header} data-over-hero={overHero}>
      <nav aria-label="Leash">
        <a href="/" aria-label="Leash home" className="wordmark"><span className="mark" aria-hidden="true" />Leash</a>
        <div className={styles.middle}>{middle}</div>
        <div className={styles.right}>{right}</div>
      </nav>
    </header>
  );
}

/// Section links that underline the chapter in view.
export function ChapterLinks({ chapters, active }: { chapters: readonly { id: string; label: string }[]; active: string }) {
  return (
    <div className={styles.chapters} role="group" aria-label="Sections">
      {chapters.map((c) => (
        <a key={c.id} href={`#${c.id}`} aria-current={active === c.id ? "location" : undefined}>{c.label}</a>
      ))}
    </div>
  );
}
