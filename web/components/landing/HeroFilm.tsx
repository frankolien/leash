"use client";

// The film and its caption. `Film` fills its parent with the footage and the glass block; the
// caption names the agent on screen and changes on each cut. The sequence decides how both move.

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, SquareTerminal } from "lucide-react";
import { siClaude, siCursor, siGithubcopilot, siGooglegemini } from "simple-icons";
import GlassBlock from "./GlassBlock";
import { FILM, agentAt, type AgentName } from "./film";
import styles from "./film.module.css";

const ICON: Record<AgentName, React.ReactNode> = {
  Claude: <svg viewBox="0 0 24 24" aria-hidden="true"><path d={siClaude.path} /></svg>,
  Codex: <SquareTerminal aria-hidden="true" strokeWidth={1.8} />,
  Cursor: <svg viewBox="0 0 24 24" aria-hidden="true"><path d={siCursor.path} /></svg>,
  Gemini: <svg viewBox="0 0 24 24" aria-hidden="true"><path d={siGooglegemini.path} /></svg>,
  Copilot: <svg viewBox="0 0 24 24" aria-hidden="true"><path d={siGithubcopilot.path} /></svg>,
};

export function Film({ onTime }: { onTime: (seconds: number) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [glass, setGlass] = useState<boolean | null>(null);
  const onReady = useCallback((ok: boolean) => setGlass(ok), []);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (window.matchMedia("(max-width: 700px)").matches) v.src = FILM.small;
    v.play().catch(() => {});
    const tick = () => onTime(v.currentTime);
    v.addEventListener("timeupdate", tick);
    return () => v.removeEventListener("timeupdate", tick);
  }, [onTime]);

  return (
    <div className={styles.film}>
      <video ref={video} className={styles.video} data-hidden={glass === true} src={FILM.src} poster={FILM.poster} muted loop playsInline autoPlay preload="auto" crossOrigin="anonymous" />
      <GlassBlock video={video} onReady={onReady} />
      <div className={styles.scrim} aria-hidden="true" />
    </div>
  );
}

export function FilmCaption({ seconds }: { seconds: number }) {
  const agent = agentAt(seconds);
  return (
    <div className={styles.overlay}>
      <h1 className={`${styles.caption} display`}>
        <span className={styles.line}>
          Now your
          <span className={styles.agent}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={agent} className={styles.agentName} initial={{ opacity: 0, y: "0.35em", filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: "-0.35em", filter: "blur(6px)" }} transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}>
                {ICON[agent]}{agent}
              </motion.span>
            </AnimatePresence>
          </span>
          can pay.
        </span>
        <span className={styles.sub}>Only what you allow.</span>
      </h1>
      <div className={styles.aside}>
        <p>Daily limits, approvals above them, and a key you can revoke in one tap. Enforced on NEAR.</p>
        <div className={styles.actions}>
          <a className="btn light" href="#open">Open your dashboard</a>
          <a className="btn glass" href="#stories">See how <ArrowDown size={16} /></a>
        </div>
      </div>
    </div>
  );
}
