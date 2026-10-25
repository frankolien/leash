// Every MCP client can hold a Leash key, and these are the ones people use. NEAR and Circle close
// the wall because they are what the money runs on.

import { SquareTerminal } from "lucide-react";
import { siClaude, siCline, siCircle, siCursor, siGithubcopilot, siGooglegemini, siJetbrains, siNear, siRaycast, siWindsurf, siZedindustries } from "simple-icons";
import styles from "./sections.module.css";

type Tile = { name: string; path?: string };

const TILES: Tile[] = [
  { name: "Claude", path: siClaude.path },
  { name: "Codex" },
  { name: "Cursor", path: siCursor.path },
  { name: "Windsurf", path: siWindsurf.path },
  { name: "Zed", path: siZedindustries.path },
  { name: "GitHub Copilot", path: siGithubcopilot.path },
  { name: "Gemini CLI", path: siGooglegemini.path },
  { name: "Cline", path: siCline.path },
  { name: "Raycast", path: siRaycast.path },
  { name: "JetBrains", path: siJetbrains.path },
  { name: "NEAR", path: siNear.path },
  { name: "USDC by Circle", path: siCircle.path },
];

export default function WorksWith() {
  return (
    <section id="works" className={styles.works} aria-labelledby="works-title">
      <div className={styles.shell}>
        <div className={styles.lead}>
          <h2 id="works-title" className="display">Every agent, one leash.</h2>
          <p>Leash speaks the Model Context Protocol, so any client that runs MCP servers can hold a key. Payments settle in USDC on NEAR.</p>
        </div>
        <ul className={styles.tiles}>
          {TILES.map((t) => (
            <li key={t.name}>
              {t.path ? (
                <svg className={styles.brand} viewBox="0 0 24 24" aria-hidden="true"><path d={t.path} /></svg>
              ) : (
                <SquareTerminal size={34} strokeWidth={1.6} aria-hidden="true" />
              )}
              <span>{t.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
