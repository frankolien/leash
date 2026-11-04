// Where runs of the attack playground are kept: a lock so only one runs at a time, and the events
// of the latest run so the page can replay it. Upstash when it is configured, memory otherwise.
// Events go on a list, appended one by one, so two arriving together never overwrite each other.

import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";
import type { AttackEvent } from "./attack";

export type StoredRun = { id: string; running: boolean; startedAt: number; events: AttackEvent[] };
type Meta = Omit<StoredRun, "events">;

// A run takes about two minutes; the lock outlives a crashed one by a little.
const LOCK_SECS = 240;
const KEEP_SECS = 7 * 86_400;
let redis: Redis | undefined;
const memory: { lock?: number; run?: StoredRun } = {};

function store(): Redis | undefined {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return undefined;
  redis ??= new Redis({ url, token });
  return redis;
}

const events = (id: string) => `attack:events:${id}`;

/// A new run's id, or null while another run holds the lock.
export async function startRun(): Promise<string | null> {
  const id = randomUUID();
  const r = store();
  if (r) {
    const got = await r.set("attack:lock", id, { nx: true, ex: LOCK_SECS });
    if (got !== "OK") return null;
    await r.set("attack:latest", { id, running: true, startedAt: Date.now() } satisfies Meta, { ex: KEEP_SECS });
    return id;
  }
  if (memory.lock && Date.now() - memory.lock < LOCK_SECS * 1000) return null;
  memory.lock = Date.now();
  memory.run = { id, running: true, startedAt: Date.now(), events: [] };
  return id;
}

export async function recordEvent(id: string, e: AttackEvent): Promise<void> {
  const r = store();
  if (r) {
    await r.rpush(events(id), JSON.stringify(e));
    await r.expire(events(id), KEEP_SECS);
    return;
  }
  if (memory.run?.id === id) memory.run.events.push(e);
}

export async function finishRun(id: string): Promise<void> {
  const r = store();
  if (r) {
    const meta = await r.get<Meta>("attack:latest");
    if (meta?.id === id) await r.set("attack:latest", { ...meta, running: false }, { ex: KEEP_SECS });
    if ((await r.get<string>("attack:lock")) === id) await r.del("attack:lock");
    return;
  }
  if (memory.run?.id === id) memory.run.running = false;
  memory.lock = undefined;
}

export async function latestRun(): Promise<StoredRun | null> {
  const r = store();
  if (r) {
    const meta = await r.get<Meta>("attack:latest");
    if (!meta) return null;
    const list = await r.lrange<string | AttackEvent>(events(meta.id), 0, -1);
    return { ...meta, events: list.map((x) => (typeof x === "string" ? (JSON.parse(x) as AttackEvent) : x)) };
  }
  return memory.run ?? null;
}
