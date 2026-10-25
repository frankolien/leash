// The dashboard's views, addressed by the URL hash so each can be linked and the back button works.

export const VIEWS = ["overview", "agents", "approvals", "activity", "settings"] as const;
export type View = (typeof VIEWS)[number];

export function viewFromHash(hash: string): View {
  const v = hash.replace(/^#/, "");
  return (VIEWS as readonly string[]).includes(v) ? (v as View) : "overview";
}
