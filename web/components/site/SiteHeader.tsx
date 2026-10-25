"use client";

// The bar every page shares: the wordmark on the left and the page's actions on the right. It sits
// clear over the page until the reader scrolls, then gathers into a frosted strip.

import { useEffect, useState, type ReactNode } from "react";
import styles from "./site.module.css";

export default function SiteHeader({ right }: { right?: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return (
    <header className={styles.header} data-scrolled={scrolled}>
      <nav aria-label="Leash">
        <a href="/" aria-label="Leash home" className="wordmark"><span className="mark" aria-hidden="true" />Leash</a>
        <div className={styles.right}>{right}</div>
      </nav>
    </header>
  );
}
