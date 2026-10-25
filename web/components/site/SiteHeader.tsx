"use client";

// The bar every page shares: the wordmark on the left and the page's actions on the right. It sits
// clear over the page until the reader scrolls, then gathers into a frosted strip.

import { useEffect, useState, type ReactNode } from "react";
import styles from "./site.module.css";

/// Over a full-screen film (`overFilm`) the bar is clear with white type until the film has
/// scrolled away.
export default function SiteHeader({ right, overFilm = false }: { right?: ReactNode; overFilm?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > (overFilm ? window.innerHeight - 90 : 12));
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [overFilm]);
  return (
    <header className={styles.header} data-scrolled={scrolled} data-light={overFilm && !scrolled}>
      <nav aria-label="Leash">
        <a href="/" aria-label="Leash home" className="wordmark"><span className="mark" aria-hidden="true" />Leash</a>
        <div className={styles.right}>{right}</div>
      </nav>
    </header>
  );
}
