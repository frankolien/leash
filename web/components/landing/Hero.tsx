// Right after the film: what Leash is in plain words, and one payment played start to finish.

import { ArrowUpRight } from "lucide-react";
import LiveMoment from "./LiveMoment";
import styles from "./hero.module.css";

export default function Hero() {
  return (
    <section id="moment" className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.copy}>
        <h2 id="hero-title" className="display">One payment, start to finish.</h2>
        <div className={styles.side}>
          <p>Leash is a spending account for AI agents on NEAR. Each agent gets its own key and a daily limit. Below the limit it just pays. Above it, your phone asks you first.</p>
          <div className={styles.actions}>
            <a className="btn ink" href="#open">Open your dashboard</a>
            <a className="btn line" href="/frankolien.testnet">See a live one <ArrowUpRight size={16} /></a>
          </div>
        </div>
      </div>
      <LiveMoment />
    </section>
  );
}
