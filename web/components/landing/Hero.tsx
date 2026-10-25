// The opening: what Leash is in one sentence, the way in, and the moment that shows it working.

import { ArrowUpRight } from "lucide-react";
import LiveMoment from "./LiveMoment";
import styles from "./hero.module.css";

export default function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.copy}>
        <h1 id="hero-title" className="display">Your agent can pay now. Only what you allow.</h1>
        <div className={styles.side}>
          <p>Leash is a spending account for AI agents on NEAR. Each agent gets a daily limit and its own key. Above the limit it asks you first, and you can revoke the key in one tap.</p>
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
