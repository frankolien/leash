// The hosted Leash connector, for the Claude and ChatGPT apps. Its URL is this site's MCP endpoint;
// Claude's install link opens its Add custom connector dialog with the name and URL filled in.

export function connectorUrl(origin: string): string {
  return `${origin}/api/mcp`;
}

export function claudeInstallLink(origin: string): string {
  const url = new URL("https://claude.ai/customize/connectors");
  url.searchParams.set("modal", "add-custom-connector");
  url.searchParams.set("connectorName", "Leash");
  url.searchParams.set("connectorUrl", connectorUrl(origin));
  return url.toString();
}

/// The site's public origin: the configured one when set, otherwise wherever this page is served.
export function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? (typeof window === "undefined" ? "" : window.location.origin);
}
