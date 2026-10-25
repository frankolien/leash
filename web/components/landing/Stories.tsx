"use client";

// A slow, endless strip of people and the one instruction they gave their agent, with the limit
// that holds it underneath. It pauses while the reader hovers or tabs into it; with reduced motion
// it becomes a strip the reader scrolls.

import { STORIES } from "./storyData";
import styles from "./stories.module.css";

function Card({ s, hidden }: { s: (typeof STORIES)[number]; hidden?: boolean }) {
  return (
    <article className={styles.card} aria-hidden={hidden || undefined}>
      <span className="tag">{s.tag}</span>
      <div className={styles.photo}>
        <img src={`/people/${s.photo}.jpg`} alt={hidden ? "" : s.alt} loading="lazy" />
        <p className={styles.ask}>{s.ask}</p>
      </div>
      <p className={styles.hold}>{s.hold}</p>
    </article>
  );
}

export default function Stories() {
  return (
    <section id="stories" className={styles.section} aria-labelledby="stories-title">
      <div className={styles.head}>
        <h2 id="stories-title" className="display">Tell it what to pay for. Leash holds the limit.</h2>
        <p>An agent with a card can spend anything. An agent with Leash spends what you set, where you set it, and asks you about the rest.</p>
      </div>
      <div className={styles.viewport}>
        <div className={styles.track}>
          {STORIES.map((s) => <Card key={s.tag} s={s} />)}
          {STORIES.map((s) => <Card key={`${s.tag}-again`} s={s} hidden />)}
        </div>
      </div>
    </section>
  );
}
