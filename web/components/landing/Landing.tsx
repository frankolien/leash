"use client";

// The landing page, top to bottom: the moment it works, what people use it for, how it holds,
// what it works with, the owner's side, questions, and the way in.

import { useCallback, useState } from "react";
import { SquareTerminal } from "lucide-react";
import { siClaude, siCursor } from "simple-icons";
import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";
import Atmosphere from "@/components/site/Atmosphere";
import { Invitation, Questions } from "./Closing";
import FilmSequence from "./FilmSequence";
import HowItHolds from "./HowItHolds";
import SetupDialog from "@/components/setup/SetupDialog";
import Stories from "./Stories";
import WorksWith from "./WorksWith";
import { AGENTS, type Agent } from "@/components/setup/agents";

const ICONS: Record<Agent, React.ReactNode> = {
  claude: <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d={siClaude.path} fill="currentColor" /></svg>,
  codex: <SquareTerminal size={15} aria-hidden="true" />,
  cursor: <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d={siCursor.path} fill="currentColor" /></svg>,
};

export default function Landing() {
  const [setup, setSetup] = useState<Agent | null>(null);
  const [onFilm, setOnFilm] = useState(true);
  const handleFilm = useCallback((over: boolean) => setOnFilm(over), []);
  return (
    <>
      <Atmosphere />
      <a href="#how" className="skip">Skip to how it works</a>
      <SiteHeader
        light={onFilm}
        right={
          <>
            {(Object.keys(AGENTS) as Agent[]).map((a) => (
              <button key={a} className="btn glass hide-sm" onClick={() => setSetup(a)}>{ICONS[a]}{AGENTS[a].label}</button>
            ))}
            <a className="btn ink" href="#open">Open dashboard</a>
          </>
        }
      />
      <main>
        <FilmSequence onFilm={handleFilm} />
        <Stories />
        <HowItHolds />
        <WorksWith />
        <Questions />
        <Invitation />
      </main>
      <SiteFooter />
      <SetupDialog agent={setup} onClose={() => setSetup(null)} onSwitch={setSetup} />
    </>
  );
}
