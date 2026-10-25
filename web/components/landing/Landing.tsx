"use client";

// The landing page: hero, the four chapters, where it plugs in, questions, and the way in. The
// header turns from transparent to white once the hero hands off, and names the chapter in view.

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader, { ChapterLinks } from "@/components/site/SiteHeader";
import Chapters, { CHAPTERS } from "./Chapters";
import { Invitation, Questions, WorksWith } from "./Closing";
import { HeroSequence, StaticHero } from "./Hero";
import { useActiveSection } from "@/hooks/useActiveSection";

const SECTION_IDS = CHAPTERS.map((c) => c.id);

function useCalm() {
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const short = window.matchMedia("(max-height: 600px)");
    const update = () => setCalm(motion.matches || short.matches);
    update();
    motion.addEventListener("change", update);
    short.addEventListener("change", update);
    return () => {
      motion.removeEventListener("change", update);
      short.removeEventListener("change", update);
    };
  }, []);
  return calm;
}

export default function Landing() {
  const calm = useCalm();
  const active = useActiveSection(SECTION_IDS);
  const [overHero, setOverHero] = useState(true);
  const onHero = useCallback((over: boolean) => setOverHero(over), []);

  useEffect(() => {
    if (!calm) return;
    const update = () => setOverHero(window.scrollY < window.innerHeight - 90);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [calm]);

  return (
    <main>
      <a href="#limits" className="skip">Skip to how it works</a>
      <SiteHeader
        overHero={overHero}
        middle={<ChapterLinks chapters={CHAPTERS} active={active} />}
        right={overHero ? <a href="#limits" style={{ fontSize: 13 }}>How it works</a> : <a className="pill primary" href="#open">Open dashboard <ArrowUpRight size={15} /></a>}
      />
      {calm ? <StaticHero /> : <HeroSequence onHero={onHero} />}
      <Chapters />
      <WorksWith />
      <Questions />
      <Invitation />
      <SiteFooter />
    </main>
  );
}
