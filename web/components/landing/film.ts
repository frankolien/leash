// The hero film's edit: five clips joined with short crossfades. Each clip carries one agent name in
// the caption, so the name changes on the cut.

export const CLIP_SECONDS = 5;
export const FADE_SECONDS = 0.6;

export const FILM = {
  src: "/film/hero-1080.mp4",
  small: "/film/hero-720.mp4",
  poster: "/film/poster.jpg",
} as const;

export type AgentName = "Claude" | "Codex" | "Cursor" | "Gemini" | "Copilot";

/// The agent named while each clip plays, in edit order: taxi, cafe, crosswalk, platform, market.
export const CLIP_AGENTS: AgentName[] = ["Claude", "Codex", "Cursor", "Gemini", "Copilot"];

export function agentAt(seconds: number): AgentName {
  const step = CLIP_SECONDS - FADE_SECONDS;
  return CLIP_AGENTS[Math.min(CLIP_AGENTS.length - 1, Math.floor((seconds + FADE_SECONDS / 2) / step))];
}
