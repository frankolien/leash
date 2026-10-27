// The two server steps behind the /connect page. GET checks a client and redirect before the page
// asks the owner anything. POST runs after the owner made the agent in their browser: it seals the
// new key into a one-time code and returns where to send the browser.

import { NextResponse } from "next/server";
import { parseKey, type KeyFile } from "leash-near-mcp";
import { open, seal } from "@/lib/server/oauth";

async function checked(clientId: string | null, redirectUri: string | null) {
  const client = await open("client", clientId);
  if (!client) return { error: "This app is not registered with Leash. Start the connection again from the app." };
  if (!redirectUri || !client.redirect_uris.includes(redirectUri)) return { error: "This app asked to return somewhere it did not register." };
  return { client };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await checked(url.searchParams.get("client_id"), url.searchParams.get("redirect_uri"));
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ name: result.client.name });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { client_id?: string; redirect_uri?: string; state?: string; code_challenge?: string; code_challenge_method?: string; key?: KeyFile };
  const result = await checked(body.client_id ?? null, body.redirect_uri ?? null);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  if (!body.code_challenge || (body.code_challenge_method ?? "S256") !== "S256") return NextResponse.json({ error: "The app must use PKCE with S256." }, { status: 400 });
  let key: KeyFile;
  try {
    key = parseKey(JSON.stringify(body.key ?? {}));
  } catch {
    return NextResponse.json({ error: "The agent's key did not arrive." }, { status: 400 });
  }
  const code = await seal("code", { key, client_id: body.client_id!, redirect_uri: body.redirect_uri!, challenge: body.code_challenge });
  const back = new URL(body.redirect_uri!);
  back.searchParams.set("code", code);
  if (body.state) back.searchParams.set("state", body.state);
  return NextResponse.json({ redirect: back.toString() });
}
