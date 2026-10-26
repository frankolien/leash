// The agent's key file, the only secret this server holds.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import type { KeyFile } from "./types.js";

export function loadKey(): KeyFile {
  const raw = process.env.LEASH_KEY_FILE;
  if (!raw) throw new Error("LEASH_KEY_FILE is not set; create an agent in the dashboard or run `leash grant`");
  // Config files for Codex and Cursor do not expand ~, so the server does.
  const path = raw.replace(/^~(?=\/)/, homedir());
  const key = JSON.parse(readFileSync(path, "utf8")) as KeyFile;
  for (const field of ["owner", "public_key", "private_key", "contract", "network"] as const) {
    if (!key[field]) throw new Error(`key file is missing ${field}`);
  }
  return key;
}
