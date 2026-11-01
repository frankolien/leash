// The things an agent can buy from Leash itself, each a few cents through x402: a Wikipedia search,
// any public web page as text, and a live token price. The catalog is what GET /api/paid lists.

import { Unavailable } from "./x402";
import { TEXT_LIMIT, checkUrl, decodeEntities, fetchPublic, pageText } from "./webpage";

export type Service = { path: string; usdc: string; units: string; description: string; params: Record<string, string> };

export const SERVICES: Record<"search" | "read" | "price", Service> = {
  search: { path: "/api/paid/search", usdc: "0.02", units: "20000", description: "Search Wikipedia: the top five articles with a summary line each", params: { q: "what to search for" } },
  read: { path: "/api/paid/read", usdc: "0.01", units: "10000", description: "Read a public web page as plain text, up to 20,000 characters", params: { url: "an http or https URL" } },
  price: { path: "/api/paid/price", usdc: "0.01", units: "10000", description: "A token's price in dollars and its change over 24 hours", params: { token: "near, btc, eth, sol, usdc, usdt, or a CoinGecko id" } },
};

const UA = { "user-agent": "LeashPaid/1.0 (+https://leash.frankolien.com)" };

export async function wikipedia(q: string): Promise<Record<string, unknown>> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=5&format=json&utf8=1`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(6_000) }).catch(() => null);
  if (!res?.ok) throw new Unavailable("Wikipedia did not answer");
  const body = (await res.json()) as { query?: { searchinfo?: { totalhits?: number }; search?: { title: string; snippet: string; wordcount: number }[] } };
  const results = (body.query?.search ?? []).map((r) => ({
    title: r.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
    summary: decodeEntities(r.snippet.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim(),
    words: r.wordcount,
  }));
  return { query: q, total: body.query?.searchinfo?.totalhits ?? results.length, results };
}

export async function readPage(url: URL): Promise<Record<string, unknown>> {
  const page = await fetchPublic(url);
  const html = /html|xml/i.test(page.contentType) || /^\s*</.test(page.body);
  const { title, text } = html ? pageText(page.body) : { title: null, text: page.body.trim() };
  if (!text) throw new Unavailable("the page has no readable text");
  return { url: page.url, title, text: text.slice(0, TEXT_LIMIT), ...(text.length > TEXT_LIMIT ? { truncated: true } : {}) };
}

const IDS: Record<string, string> = { near: "near", btc: "bitcoin", eth: "ethereum", sol: "solana", usdc: "usd-coin", usdt: "tether" };

export function coinId(token: string): string | null {
  const t = token.trim().toLowerCase();
  return IDS[t] ?? (/^[a-z0-9-]{2,64}$/.test(t) ? t : null);
}

export async function price(id: string): Promise<Record<string, unknown>> {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(6_000) }).catch(() => null);
  if (!res?.ok) throw new Unavailable("the price source did not answer");
  const quote = ((await res.json()) as Record<string, { usd?: number; usd_24h_change?: number; last_updated_at?: number }>)[id];
  if (quote?.usd === undefined) throw new Unavailable(`no price for "${id}"`);
  return {
    token: id,
    usd: quote.usd,
    change_24h_percent: quote.usd_24h_change === undefined ? null : Math.round(quote.usd_24h_change * 100) / 100,
    as_of: quote.last_updated_at ? new Date(quote.last_updated_at * 1000).toISOString() : null,
    source: "CoinGecko",
  };
}

export { checkUrl };
