import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

const edgeWorkers = [
  "workers/intelligence-edge/src/index.mjs",
  "workers/global-risk-edge/src/index.mjs",
  "workers/risk-indices-edge/src/index.mjs",
];
const serverReaders = [
  "src/lib/b2-live.server.ts",
  "src/lib/b2-country-gro.server.ts",
  "src/lib/b2-structural.server.ts",
  "src/lib/b2-private-archive-read.server.ts",
];

test("B2 callers have a fail-closed gateway mode for exact-key reads and mutable writes", async () => {
  for (const path of edgeWorkers) {
    const source = await readFile(path, "utf8");
    assert.match(source, /B2_STORAGE_MODE === "gateway"/u, path);
    assert.match(source, /\/v1\/internal\/objects/u, path);
    const gatewayBranch = source.indexOf('if (env.B2_STORAGE_MODE === "gateway")');
    const directCredentialRead = source.indexOf("env.B2_KEY_ID", gatewayBranch);
    assert.ok(gatewayBranch >= 0 && directCredentialRead > gatewayBranch, `${path}: gateway branch must precede direct credentials`);
  }
  for (const path of serverReaders) {
    const source = await readFile(path, "utf8");
    assert.match(source, /readB2GatewayObject\(/u, path);
    assert.match(source, /B2_STORAGE_MODE === "gateway"/u, path);
  }
  const client = await readFile("scripts/ops/b2-s3-client.mjs", "utf8");
  assert.match(client, /B2_STORAGE_MODE === "gateway"/u);
  assert.match(client, /\/v1\/internal\/objects/u);
  assert.match(client, /B2_GATEWAY_TOKEN_REQUIRED/u);
  assert.match(client, /B2_LIST_OPERATIONS_DISABLED_USE_D1_INDEX/u);
  const [gateway, migration] = await Promise.all([
    readFile("workers/b2-free-tier/src/index.mjs", "utf8"),
    readFile("workers/b2-free-tier/migrations/0002_legacy_exact_key_index.sql", "utf8"),
  ]);
  assert.match(gateway, /OBJECT_WRITE_IN_PROGRESS/u);
  assert.match(gateway, /INSERT INTO files\(id,path,b2_file_id,size_bytes,mime_type,sha256,created_at,status/u);
  assert.match(migration, /b2_pending_upload_reservation/u);
  const ingestor = await readFile("workers/unified-ingestor/ingestor.py", "utf8");
  assert.match(ingestor, /B2_GATEWAY_URL/u);
  assert.match(ingestor, /\/v1\/internal\/objects\?path=/u);
  assert.doesNotMatch(ingestor, /boto3|B2_APPLICATION_KEY|put_object/u);
  const controlPlane = await readFile("workers/control-plane/src/unified-event-stream.mjs", "utf8");
  assert.match(controlPlane, /if\(env\.B2_STORAGE_MODE==="gateway"\)/u);
  assert.match(controlPlane, /B2_GATEWAY_READBACK_UNAVAILABLE/u);
});
