// Where a Google or Apple sign-in should land afterwards. Privy sends every OAuth sign-in back to
// /app (the one return page its dashboard allows), so the page that started it is remembered here
// and /app forwards there: the phone's link page, a connector's Allow page, a dashboard.

const KEY = "leash.returnTo";
const TTL_MS = 10 * 60 * 1000;

export function rememberReturn(path: string): void {
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/app")) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {}
}

/// The remembered page, once, if it is fresh; a sign-in abandoned long ago forwards nowhere.
export function takeReturn(now = Date.now()): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const { path, at } = JSON.parse(raw) as { path: string; at: number };
    return now - at < TTL_MS && path.startsWith("/") && !path.startsWith("//") ? path : null;
  } catch {
    return null;
  }
}
