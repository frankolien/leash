"use client";

// The hero's one orchestrated moment, played over a photograph: Maya asks her agent to renew a
// plan, Leash stops it at the cap, her phone asks her, she approves, and it pays once. The rail
// underneath names each beat and lets the reader step through it; reduced motion shows the end.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import styles from "./hero.module.css";

const BEATS = ["Maya asks her agent", "Leash stops it at the cap", "Her phone asks her", "Paid, this once"] as const;
const BEAT_MS = 3200;

const enter = { initial: { opacity: 0, y: 14, scale: .98 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -8 }, transition: { duration: .45, ease: [.2, .8, .2, 1] as const } };

export default function LiveMoment() {
  const [beat, setBeat] = useState(0);
  const [held, setHeld] = useState(false);
  const [seen, setSeen] = useState(false);
  const [calm, setCalm] = useState(false);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    setCalm(q.matches);
    if (q.matches) setBeat(3);
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold: .35 });
    if (frame.current) io.observe(frame.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (calm || held || !seen) return;
    const t = window.setTimeout(() => setBeat((b) => (b + 1) % BEATS.length), beat === 3 ? BEAT_MS + 1400 : BEAT_MS);
    return () => window.clearTimeout(t);
  }, [beat, held, seen, calm]);

  const running = !calm && !held && seen;

  return (
    <div className={styles.moment} onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
      <div ref={frame} className={styles.frame}>
        <img src="/people/hero.jpg" alt="Maya on her sofa with a laptop, glancing at her phone" />
        <div className={styles.scrim} aria-hidden="true" />

        <AnimatePresence>
          {beat >= 0 && (
            <motion.p key="ask" className={styles.ask} {...enter}>
              <span>Maya to Claude</span>
              Renew my API plan with vendor.near. It&apos;s $5 this month.
            </motion.p>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {beat >= 1 && (
            <motion.div key="stop" className={styles.stop} {...enter}>
              <div className={styles.stopHead}><span className="wordmark"><span className="mark" aria-hidden="true" />Leash</span><span>{beat === 3 ? "Paid" : "Waiting on Maya"}</span></div>
              <strong className="tabular">$5<span>.00</span></strong>
              <span className={styles.stopTo}>Claude to <span className="mono">vendor.near</span></span>
              <p>{beat === 3 ? "Paid from Maya's vault. Claude's limits stay where they were." : "Over Claude's $2 per-payment limit, so it waits for Maya instead of paying."}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {beat === 2 && (
            <motion.div key="ask-phone" className={styles.sheet} {...enter}>
              <span className={styles.sheetApp}><span className="mark" aria-hidden="true" />Leash</span>
              <strong>Approve $5.00 to vendor.near?</strong>
              <span className={styles.sheetSub}>Claude asked 2 minutes ago. This approves this payment only.</span>
              <div className={styles.sheetActions}><span>Deny</span><motion.span className={styles.approve} animate={running ? { scale: [1, 1, .94, 1] } : {}} transition={{ duration: 1.6, times: [0, .7, .82, 1], delay: 1 }}>Approve</motion.span></div>
            </motion.div>
          )}
          {beat === 3 && (
            <motion.div key="paid" className={`${styles.sheet} ${styles.sheetDone}`} {...enter}>
              <span className={styles.doneIcon} aria-hidden="true"><Check size={18} /></span>
              <div><strong>Approved</strong><span className={styles.sheetSub}>$5.00 sent to vendor.near</span></div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ol className={styles.rail} aria-label="What happens">
        {BEATS.map((label, i) => (
          <li key={label} data-state={i < beat ? "done" : i === beat ? "now" : "next"}>
            <button type="button" onClick={() => setBeat(i)} aria-current={i === beat ? "step" : undefined}>
              <span className={styles.railTrack}><motion.span key={`${i}-${beat}`} initial={{ scaleX: i < beat ? 1 : 0 }} animate={{ scaleX: i <= beat ? 1 : 0 }} transition={{ duration: i === beat && running ? (beat === 3 ? BEAT_MS + 1400 : BEAT_MS) / 1000 : .3, ease: "linear" }} /></span>
              <span className={styles.railLabel}>{label}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
