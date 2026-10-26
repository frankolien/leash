// The agent's key, the only secret this server holds. It comes either inline in LEASH_KEY (the
// key file's JSON, or that JSON in base64, which survives shell quoting and install links) or from
// the file named by LEASH_KEY_FILE.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import type { KeyFile } from "./types.js";

export function parseKey(raw: string): KeyFile {
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw.trim(), "base64").toString("utf8");
  let key: KeyFile;
  try {
    key = JSON.parse(text) as KeyFile;
  } catch {
    throw new Error("the Leash key is not valid; copy it again from the dashboard");
  }
  for (const field of ["owner", "public_key", "private_key", "contract", "network"] as const) {
    if (!key[field]) throw new Error(`the Leash key is missing ${field}`);
  }
  return key;
}

export function loadKey(): KeyFile {
  if (process.env.LEASH_KEY) return parseKey(process.env.LEASH_KEY);
  const raw = process.env.LEASH_KEY_FILE;
  if (!raw) throw new Error("no Leash key: set LEASH_KEY or LEASH_KEY_FILE; create an agent in the dashboard or run `leash grant`");
  // Config files for Codex and Cursor do not expand ~, so the server does.
  const path = raw.replace(/^~(?=\/)/, homedir());
  return parseKey(readFileSync(path, "utf8"));
}
