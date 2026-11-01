// Reading a stranger's URL for a paid agent, safely: only http and https on their usual ports, only
// hosts that resolve to public addresses (checked again after every redirect, at most three), at
// most 2 MB and 8 seconds. Then the page as plain text an agent can read. A host could still switch
// its DNS between the check and the fetch; the size and time caps bound what that could cost.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Unavailable } from "./x402";

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
export const TEXT_LIMIT = 20_000;

/// Loopback, private, link-local, carrier-grade NAT, multicast and reserved ranges, in both families.
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") || v6.startsWith("ff");
}

/// The URL if it may be fetched, or the reason it may not.
export function checkUrl(raw: string): URL | string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "that is not a URL";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "only http and https URLs can be read";
  if (url.port && url.port !== "80" && url.port !== "443") return "only the usual web ports can be read";
  if (url.username || url.password) return "URLs with credentials cannot be read";
  return url;
}

async function assertPublic(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => { throw new Unavailable(`${host} could not be found`); })).map((a) => a.address);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Unavailable(`${host} is not on the public internet`);
}

export async function fetchPublic(start: URL): Promise<{ url: string; contentType: string; body: string }> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": "LeashReader/1.0 (+https://leash.frankolien.com)", accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.5" } }).catch(() => {
      throw new Unavailable(`${url.hostname} did not answer`);
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      const next = checkUrl(new URL(res.headers.get("location")!, url).toString());
      if (typeof next === "string") throw new Unavailable(`the page redirected somewhere it cannot be read: ${next}`);
      url = next;
      continue;
    }
    if (!res.ok) throw new Unavailable(`${url.hostname} answered ${res.status}`);
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    return { url: url.toString(), contentType: res.headers.get("content-type") ?? "", body: new TextDecoder().decode(Buffer.concat(chunks)) };
  }
  throw new Unavailable("the page redirected too many times");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/// A page as readable text: the title, headings marked with #, list items with -, links as their
/// words, and nothing from scripts, styles or navigation chrome.
export function pageText(html: string): { title: string | null; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const main = html.match(/<(main|article)[\s>][\s\S]*?<\/\1>/i)?.[0] ?? html.match(/<body[\s>][\s\S]*<\/body>/i)?.[0] ?? html;
  const text = main
    .replace(/<(script|style|noscript|svg|template|iframe|head|nav|footer|form)[\s>][\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<h([1-6])[^>]*>/gi, (_, n: string) => `\n\n${"#".repeat(Number(n))} `)
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|h[1-6]|ul|ol|table|tr|blockquote|pre)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ");
  const clean = decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title: title ? decodeEntities(title).replace(/\s+/g, " ").trim() : null, text: clean };
}
