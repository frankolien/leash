import { test } from "node:test";
import assert from "node:assert/strict";
import { KeyPair } from "near-api-js";
import { childKey } from "./leash.js";

const parent = KeyPair.fromRandom("ed25519").toString();

test("a task's child key is the same every time it is derived", () => {
  assert.equal(childKey(parent, "research", 0).getPublicKey().toString(), childKey(parent, "research", 0).getPublicKey().toString());
});

test("each label and slot gets its own key, and another parent cannot reach them", () => {
  const keys = new Set([childKey(parent, "research", 0), childKey(parent, "research", 1), childKey(parent, "flights", 0), childKey(KeyPair.fromRandom("ed25519").toString(), "research", 0)].map((k) => k.getPublicKey().toString()));
  assert.equal(keys.size, 4);
});

test("a derived key signs like any ed25519 key", () => {
  const key = childKey(parent, "research", 0);
  const message = new TextEncoder().encode("leash-intent:{}");
  assert.ok(key.verify(message, key.sign(message).signature));
});
