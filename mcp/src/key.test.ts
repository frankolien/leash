import { test } from "node:test";
import assert from "node:assert/strict";
import { parseKey } from "./key.js";

const key = { owner: "olien.testnet", public_key: "ed25519:pub", private_key: "ed25519:secret", contract: "leash.frankolien.testnet", network: "testnet" };

test("reads the key file's JSON", () => {
  assert.equal(parseKey(JSON.stringify(key)).owner, "olien.testnet");
});

test("reads the same JSON in base64, as install links carry it", () => {
  assert.equal(parseKey(Buffer.from(JSON.stringify(key)).toString("base64")).contract, "leash.frankolien.testnet");
});

test("names the missing field", () => {
  assert.throws(() => parseKey(JSON.stringify({ ...key, private_key: "" })), /missing private_key/);
});

test("rejects something that is not a key", () => {
  assert.throws(() => parseKey("not a key"), /not valid/);
});
