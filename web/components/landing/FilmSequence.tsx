"use client";

// The opening sequence. The film fills the first screen; one scroll gesture plays a timed handoff
// in which the film closes into the Leash dashboard window. A reverse gesture plays it back.
// Reduced motion and short screens get both scenes without the handoff.

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import { useHeroHandoff } from "@/hooks/useHeroHandoff";
import { Film, FilmCaption } from "./HeroFilm";
import { DashboardScene } from "./DashboardScene";
import styles from "./sequence.module.css";

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const portion = (v: number, a: number, b: number) => clamp((v - a) / (b - a));

/// Where the film lands: the dashboard window's centre offset from the stage centre, the scale that fits
/// the stage onto the panel, and the panel's size in the film's own unscaled coordinates.
type Landing = { dx: number; dy: number; scale: number; w: number; h: number; W: number; H: number };

function useCalm() {
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce), (max-height: 600px)");
    const update = () => setCalm(q.matches);
    update();
    q.addEventListener("change", update);
    return () => q.removeEventListener("change", update);
  }, []);
  return calm;
}

function Heading() {
  return (
    <div className={styles.heading}>
      <span>Everything your agents may spend. One place.</span>
      <h2 className="display">You hold the leash.</h2>
    </div>
  );
}

function Note() {
  return <p className={styles.note}>An illustrative look inside Leash. <a href="/frankolien.testnet">Open the live testnet dashboard</a></p>;
}

function Handoff({ onFilm }: { onFilm: (over: boolean) => void }) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const centre = useRef<HTMLDivElement>(null);
  const [seconds, setSeconds] = useState(0);
  const [settled, setSettled] = useState(false);
  const target = useMotionValue<Landing>({ dx: 0, dy: 0, scale: 1, w: 1, h: 1, W: 1, H: 1 });
  useHeroHandoff(section, stage);
  const { scrollYProgress: p } = useScroll({ target: section, offset: ["start start", "end end"] });

  // The whole film (footage, glass and caption) scales down onto the dashboard window while its
  // frame is clipped to the window's shape, so it reads as one picture closing into the app.
  const contraction = (v: number) => portion(v, 0.06, 0.58);
  const filmTransform = useTransform(() => {
    const c = contraction(p.get());
    const t = target.get();
    return `translate3d(${t.dx * c}px, ${t.dy * c}px, 0) scale(${1 + (t.scale - 1) * c})`;
  });
  const clip = useTransform(() => {
    const c = contraction(p.get());
    const t = target.get();
    const x = ((t.W - t.w / t.scale) / 2) * c;
    const y = ((t.H - t.h / t.scale) / 2) * c;
    return `inset(${y}px ${x}px ${y}px ${x}px round ${(18 / t.scale) * c}px)`;
  });
  const filmOpacity = useTransform(p, [0, 0.5, 0.7, 1], [1, 1, 0, 0]);
  const captionOpacity = useTransform(p, [0, 0.04, 0.18, 1], [1, 1, 0, 0]);
  const captionY = useTransform(p, (v) => `translateY(${-28 * portion(v, 0.06, 0.24)}px)`);
  const headingOpacity = useTransform(p, [0, 0.45, 0.62, 1], [0, 0, 1, 1]);
  const windowOpacity = useTransform(p, [0, 0.46, 0.66, 1], [0, 0, 1, 1]);
  const windowLift = useTransform(p, (v) => `translateY(${18 * (1 - portion(v, 0.5, 0.8))}px)`);
  const noteOpacity = useTransform(p, [0, 0.6, 0.85, 1], [0, 0, 1, 1]);

  useEffect(() => {
    const host = stage.current;
    const card = centre.current;
    if (!host || !card) return;
    const measure = () => {
      let x = 0;
      let y = 0;
      for (let n: HTMLElement | null = card; n && n !== host; n = n.offsetParent as HTMLElement | null) {
        x += n.offsetLeft;
        y += n.offsetTop;
      }
      const W = host.clientWidth;
      const H = host.clientHeight;
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      target.set({ dx: x + w / 2 - W / 2, dy: y + h / 2 - H / 2, scale: Math.max(w / W, h / H), w, h, W, H });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    ro.observe(card);
    measure();
    return () => ro.disconnect();
  }, [target]);

  useMotionValueEvent(p, "change", (v) => {
    onFilm(v < 0.12);
    setSettled(v > 0.5);
  });
  const onTime = useCallback((s: number) => setSeconds(s), []);

  return (
    <section ref={section} className={styles.sequence} aria-label="Leash">
      <div ref={stage} className={styles.stage}>
        <div className={styles.products} aria-hidden={!settled} inert={!settled}>
          <motion.div style={{ opacity: headingOpacity }}><Heading /></motion.div>
          <div ref={centre} className={styles.frame}>
            <motion.div className={styles.fill} style={{ opacity: windowOpacity, transform: windowLift }}><DashboardScene /></motion.div>
          </div>
          <motion.div style={{ opacity: noteOpacity }}><Note /></motion.div>
        </div>
        <motion.div className={styles.filmLayer} style={{ clipPath: clip, transform: filmTransform, opacity: filmOpacity }}>
          <Film onTime={onTime} />
          <motion.div className={styles.captionLayer} style={{ opacity: captionOpacity, transform: captionY }} inert={settled}>
            <FilmCaption seconds={seconds} />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function Still({ onFilm }: { onFilm: (over: boolean) => void }) {
  const [seconds, setSeconds] = useState(0);
  const onTime = useCallback((s: number) => setSeconds(s), []);
  useEffect(() => {
    const update = () => onFilm(window.scrollY < window.innerHeight - 90);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [onFilm]);
  return (
    <>
      <section className={styles.stillFilm}><Film onTime={onTime} /><div className={styles.captionLayer}><FilmCaption seconds={seconds} /></div></section>
      <section className={styles.stillProducts}>
        <Heading />
        <div className={styles.frame}><DashboardScene /></div>
        <Note />
      </section>
    </>
  );
}

export default function FilmSequence({ onFilm }: { onFilm: (over: boolean) => void }) {
  const calm = useCalm();
  return calm ? <Still onFilm={onFilm} /> : <Handoff onFilm={onFilm} />;
}
