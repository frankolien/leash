"use client";

// The opening: a sphere of agent payments behind the headline. Scrolling contracts the sphere behind
// the one card that matters, a payment waiting on its owner, with the budget and the kill switch on
// either side. The handoff follows Revolut's: the same subject carries from hero to product.

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import { ArrowDown, ArrowUpRight, Check, X } from "lucide-react";
import PaymentGlobe, { globeProjectionDiameter } from "./PaymentGlobe";
import styles from "./landing.module.css";

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const portion = (v: number, a: number, b: number) => clamp((v - a) / (b - a));

function HeroCopy() {
  return (
    <>
      <h1><span>Give your agents</span><span>a budget,</span><span>not your wallet.</span></h1>
      <p>Daily caps, approvals and a kill switch for AI agents that pay. Enforced on NEAR, not by a promise.</p>
      <div className={styles.heroActions}>
        <a className="pill action" href="#open">Open your dashboard <ArrowUpRight size={17} /></a>
        <a className={styles.heroSecondary} href="/frankolien.testnet">or watch a live one</a>
      </div>
    </>
  );
}

function BudgetCard() {
  return (
    <>
      <span className={styles.cardEyebrow}>Budget</span>
      <span className={styles.agentBadge} aria-hidden="true">C</span>
      <strong className={styles.cardName}>claude</strong>
      <div className={styles.budgetLine}><b>$2.00</b> of $3.00 left today</div>
      <div className={styles.track}><span style={{ width: "66%" }} /></div>
      <small>$2 per payment · 2 recipients</small>
    </>
  );
}

function RequestCard() {
  return (
    <div className={styles.requestContents}>
      <div className={styles.requestTop}><span className={styles.cardEyebrow}>claude wants to pay</span><span className={styles.reason}>over per-payment cap</span></div>
      <span className={styles.label}>Amount</span>
      <strong className={styles.amount}>$5<span>.00</span></strong>
      <div className={styles.requestTo}>to <span className="mono">vendor.near</span></div>
      <p className={styles.memo}>“Monthly API plan, renews today.”</p>
      <div className={styles.timer}><div className={styles.track}><span style={{ width: "82%" }} /></div><small>49 min left to decide · approves exactly this payment</small></div>
      <div className={styles.requestActions}><span className="pill">Deny</span><span className="pill primary"><Check size={15} /> Approve</span></div>
    </div>
  );
}

function KillCard() {
  return (
    <>
      <span className={styles.cardEyebrow}>Kill switch</span>
      <span className={styles.killButton} aria-hidden="true"><X size={26} strokeWidth={2} /></span>
      <strong className={styles.cardName}>Pause all</strong>
      <small>Every key stops until you resume.</small>
    </>
  );
}

function Panels({ centre, settled }: { centre?: React.Ref<HTMLDivElement>; settled?: boolean }) {
  return (
    <>
      <div className={styles.productHeading}>
        <span>What your agents may spend. One place.</span>
        <h2>You hold the leash.</h2>
      </div>
      <div className={styles.panelRow} data-settled={settled}>
        <div className={styles.sideCard} data-side="left"><BudgetCard /></div>
        <div ref={centre} className={styles.centerCard}><RequestCard /></div>
        <div className={styles.sideCard} data-side="right"><KillCard /></div>
      </div>
      <p className={styles.illustrative}>An illustrative look inside Leash. The live one runs on NEAR testnet.</p>
    </>
  );
}

export function HeroSequence({ onHero }: { onHero: (over: boolean) => void }) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const centre = useRef<HTMLDivElement>(null);
  const target = useMotionValue({ x: 0, y: 50, scale: 0.6 });
  const [productLive, setProductLive] = useState(false);
  const { scrollYProgress: p } = useScroll({ target: section, offset: ["start start", "end end"] });

  const copyOpacity = useTransform(p, [0, 0.1, 0.32, 1], [1, 1, 0, 0]);
  const copyY = useTransform(p, (v) => `translateY(${-24 * portion(v, 0.1, 0.32)}px)`);
  const hintOpacity = useTransform(p, [0, 0.1, 0.24, 1], [1, 1, 0, 0]);
  const globeTransform = useTransform(() => {
    const v = p.get();
    const t = target.get();
    const c = portion(v, 0.08, 0.6);
    return `translate3d(${t.x * c}px, ${t.y * c}px, 0) scale(${1 + (t.scale - 1) * c})`;
  });
  const globeOpacity = useTransform(p, [0, 0.42, 0.68, 1], [1, 1, 0.5, 0.5]);
  const groundClip = useTransform(p, (v) => {
    const c = portion(v, 0.08, 0.6);
    return `inset(${22 * c}% ${31 * c}% ${10 * c}% round ${32 * c}px)`;
  });
  const groundOpacity = useTransform(p, [0, 0.5, 0.74, 1], [1, 1, 0, 0]);
  const headingOpacity = useTransform(p, [0, 0.42, 0.6, 1], [0, 0, 1, 1]);
  const centreOpacity = useTransform(p, [0, 0.4, 0.62, 1], [0, 0, 1, 1]);
  const centreTransform = useTransform(p, (v) => `translateY(${40 * (1 - portion(v, 0.4, 0.7))}px) scale(${0.96 + 0.04 * portion(v, 0.4, 0.7)})`);
  const leftTransform = useTransform(p, (v) => `translate3d(${34 * (1 - portion(v, 0.48, 0.82))}%, 0, 0)`);
  const rightTransform = useTransform(p, (v) => `translate3d(${-34 * (1 - portion(v, 0.48, 0.82))}%, 0, 0)`);
  const sideOpacity = useTransform(p, [0, 0.52, 0.8, 1], [0, 0, 1, 1]);

  // Where the sphere settles: centred on the request card, sized to sit just behind it. Measured
  // from layout offsets so Motion's own transforms never feed back into the target.
  useEffect(() => {
    const host = stage.current;
    const card = centre.current;
    if (!host || !card) return;
    const update = () => {
      let x = card.offsetWidth / 2;
      let y = card.offsetHeight / 2;
      for (let n: HTMLElement | null = card; n && n !== host; n = n.offsetParent as HTMLElement | null) {
        x += n.offsetLeft;
        y += n.offsetTop;
      }
      const narrow = host.clientWidth <= 760;
      const diameter = narrow ? Math.max(card.offsetHeight * 1.3, card.offsetWidth * 0.8) : Math.max(card.offsetHeight * 1.12, card.offsetWidth * 1.1);
      target.set({
        x: x - host.clientWidth / 2,
        y: y - host.clientHeight / 2,
        scale: Math.max(0.28, Math.min(0.85, diameter / globeProjectionDiameter(host.clientWidth, host.clientHeight))),
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(host);
    observer.observe(card);
    update();
    return () => observer.disconnect();
  }, [target]);

  useMotionValueEvent(p, "change", (v) => {
    setProductLive(v >= 0.47);
    onHero(v < 0.13);
  });

  return (
    <section ref={section} className={styles.sequence} aria-label="From a sphere of agent payments to the one that needs you">
      <div ref={stage} className={styles.sticky}>
        <motion.div className={styles.ground} style={{ clipPath: groundClip, opacity: groundOpacity }} aria-hidden="true" />
        <motion.div className={styles.globeLayer} style={{ transform: globeTransform, opacity: globeOpacity }}><PaymentGlobe /></motion.div>
        <motion.div className={styles.heroCopy} style={{ opacity: copyOpacity, transform: copyY }} inert={productLive}>
          <HeroCopy />
        </motion.div>
        <motion.div className={styles.scrollHint} style={{ opacity: hintOpacity }} aria-hidden="true">Scroll to see how <ArrowDown size={15} /></motion.div>
        <div className={styles.products} inert={!productLive} aria-hidden={!productLive}>
          <motion.div style={{ opacity: headingOpacity }}>
            <div className={styles.productHeading}><span>What your agents may spend. One place.</span><h2>You hold the leash.</h2></div>
          </motion.div>
          <div className={styles.panelRow}>
            <motion.div className={styles.sideCard} style={{ transform: leftTransform, opacity: sideOpacity }}><BudgetCard /></motion.div>
            <motion.div ref={centre} className={styles.centerCard} style={{ transform: centreTransform, opacity: centreOpacity }}><RequestCard /></motion.div>
            <motion.div className={styles.sideCard} style={{ transform: rightTransform, opacity: sideOpacity }}><KillCard /></motion.div>
          </div>
          <motion.p className={styles.illustrative} style={{ opacity: sideOpacity }}>An illustrative look inside Leash. The live one runs on NEAR testnet.</motion.p>
        </div>
      </div>
    </section>
  );
}

/// The same opening without scroll-driven motion, for reduced motion and short screens.
export function StaticHero() {
  return (
    <>
      <section className={styles.staticHero}>
        <div className={styles.staticGlobe}><PaymentGlobe still /></div>
        <div className={styles.heroCopy}><HeroCopy /></div>
      </section>
      <section className={styles.staticProducts}><Panels settled /></section>
    </>
  );
}
