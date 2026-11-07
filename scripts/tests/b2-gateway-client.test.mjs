import { test } from "node:test";
import assert from "node:assert/strict";
import { createB2Client } from "../ops/b2-s3-client.mjs";

test("gateway mode routes object reads and mutable writes only through the authenticated gateway", async () => {
  const prior = {
    mode: process.env.B2_STORAGE_MODE,
    url: process.env.B2_GATEWAY_URL,
    token: process.env.INTERNAL_GATEWAY_TOKEN,
    fetch: globalThis.fetch,
  };
  const seen = [];
  process.env.B2_STORAGE_MODE = "gateway";
  process.env.B2_GATEWAY_URL = "https://storage.example.test/base";
  process.env.INTERNAL_GATEWAY_TOKEN = "g".repeat(48);
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    seen.push({ url, init });
    if (init.method === "PUT") return new Response(JSON.stringify({ ok: true }), { status: 200 });
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-length": "3" } });
  };
  try {
    const client = createB2Client({
      endpointUrl: "https://s3.us-east-005.backblazeb2.com",
      accessKey: "unused-direct-key",
      secretKey: "unused-direct-secret",
      bucket: "geomacro-private-archive",
    });
    await client.put("geomacro-evidence/v1/live/example.json", Buffer.from("write"));
    const bytes = await client.get("geomacro-evidence/v1/live/example.json");
    assert.deepEqual([...bytes], [1, 2, 3]);
    assert.equal(seen.length, 2);
    assert.ok(seen.every(({ url }) => url.origin === "https://storage.example.test"));
    assert.ok(seen.every(({ init }) => init.headers.Authorization === `Bearer ${"g".repeat(48)}`));
    assert.deepEqual(seen.map(({ init }) => init.method), ["PUT", "GET"]);
  } finally {
    globalThis.fetch = prior.fetch;
    if (prior.mode === undefined) delete process.env.B2_STORAGE_MODE; else process.env.B2_STORAGE_MODE = prior.mode;
    if (prior.url === undefined) delete process.env.B2_GATEWAY_URL; else process.env.B2_GATEWAY_URL = prior.url;
    if (prior.token === undefined) delete process.env.INTERNAL_GATEWAY_TOKEN; else process.env.INTERNAL_GATEWAY_TOKEN = prior.token;
  }
});
