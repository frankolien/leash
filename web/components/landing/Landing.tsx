"use client";

// The landing page, top to bottom: the moment it works, what people use it for, how it holds,
// what it works with, the owner's side, questions, and the way in.

import { useCallback, useState } from "react";
import { siClaude, siCursor } from "simple-icons";
import { useAppHref } from "@/components/auth/AuthContext";
import { BrandLogo } from "@/components/dashboard/AgentIcon";
import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";
import Atmosphere from "@/components/site/Atmosphere";
import { Invitation, Questions } from "./Closing";
import sections from "./sections.module.css";
import FilmSequence from "./FilmSequence";
import HowItHolds from "./HowItHolds";
import Preloader from "./Preloader";
import SetupDialog from "@/components/setup/SetupDialog";
import Stories from "./Stories";
import WorksWith from "./WorksWith";
import { AGENTS, type Agent } from "@/components/setup/agents";

const ICONS: Record<Agent, React.ReactNode> = {
  claude: <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d={siClaude.path} fill="currentColor" /></svg>,
  codex: <BrandLogo name="codex" size={15} />,
  cursor: <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d={siCursor.path} fill="currentColor" /></svg>,
};

export default function Landing() {
  const [setup, setSetup] = useState<Agent | null>(null);
  const app = useAppHref();
  const [onFilm, setOnFilm] = useState(true);
  const handleFilm = useCallback((over: boolean) => setOnFilm(over), []);
  return (
    <>
      <Preloader />
      <Atmosphere />
      <a href="#how" className="skip">Skip to how it works</a>
      <SiteHeader
        light={onFilm}
        right={
          <>
            {(Object.keys(AGENTS) as Agent[]).map((a) => (
              <button key={a} className="btn glass hide-sm" onClick={() => setSetup(a)}>{ICONS[a]}{AGENTS[a].label}</button>
            ))}
            <a className="btn ink" href={app.href}>{app.signedIn ? "Dashboard" : "Sign in"}</a>
          </>
        }
      />
      <main>
        <FilmSequence onFilm={handleFilm} />
        <Stories />
        <HowItHolds />
        <WorksWith />
        <Questions />
      </main>
      {/* The way in and the footer share one screen, so the photo is as tall as the room left. */}
      <div className={sections.end}>
        <Invitation />
        <SiteFooter />
      </div>
      <SetupDialog agent={setup} onClose={() => setSetup(null)} onSwitch={setSetup} />
    </>
  );
}
