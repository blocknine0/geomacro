import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { limits, signB2Request } from "../src/index.mjs";

test("hard limits match the declared free-tier guardrails", () => {
  assert.equal(limits.hardStorageBytes, 9_200_000_000);
  assert.equal(limits.dailyUploadLimit, 2_000);
  assert.equal(limits.dailyClassALimit, 2_000);
  assert.equal(limits.dailyClassBLimit, 2_040);
  assert.equal(limits.dailyClassCLimit, 40);
  assert.equal(limits.dailyClassCListLimit, 0);
  assert.equal(limits.cacheSeconds, 604_800);
});

test("SigV4 signer signs a B2 path and version query deterministically", async () => {
  const signed = await signB2Request({
    method: "DELETE",
    endpoint: "https://s3.us-east-005.backblazeb2.com",
    bucket: "geomacro-private-archive",
    key: "geomacro-evidence/v1/private/b2-managed/abc-123",
    region: "us-east-005",
    accessKey: "test-key",
    secretKey: "test-secret",
    query: new URLSearchParams({ versionId: "4_zobject-version" }),
    now: new Date("2026-11-06T00:00:00.000Z"),
  });
  assert.match(signed.url, /versionId=4_zobject-version/u);
  assert.match(signed.headers.get("authorization"), /^AWS4-HMAC-SHA256 Credential=test-key\/20261106\/us-east-005\/s3\/aws4_request/u);
  assert.match(signed.headers.get("authorization"), /Signature=[a-f0-9]{64}$/u);
});

test("gateway has no B2 listing operation or direct browser origin", async () => {
  const source = await readFile(new URL("../src/index.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /ListObjects|list_file_names|list-type=2|listFiles/iu);
  assert.doesNotMatch(source, /b2\.backblazeb2\.com\/file\//iu);
  assert.equal(typeof worker.fetch, "function");
  assert.equal(typeof worker.scheduled, "function");
});

test("only public GET route can return immutable cacheable data", async () => {
  const source = await readFile(new URL("../src/index.mjs", import.meta.url), "utf8");
  assert.match(source, /"cache-control": `public, max-age=\$\{CACHE_SECONDS\}, immutable`/u);
  assert.match(source, /visibility='public' AND status='ready'/u);
  assert.match(source, /cache\.match\(cacheKey\)/u);
  assert.match(source, /cache\.put\(cacheKey/u);
  assert.match(source, /reserveB2AccountQuota\(env\.DB/u);
  assert.match(source, /await reserveClassA\(env, \{ upload: true \}\)/u);
});

test("internal exact-key reader is authenticated, indexed, pinned to one version, and cacheable", async () => {
  const source = await readFile(new URL("../src/index.mjs", import.meta.url), "utf8");
  assert.match(source, /\/v1\/internal\/objects/u);
  assert.match(source, /internalAuthorized\(request, env\)/u);
  assert.match(source, /WHERE path=\? AND status='ready'/u);
  assert.match(source, /new URLSearchParams\(\{ versionId: row\.b2_file_id \}\)/u);
  assert.match(source, /evictable,baseline_accounted\)/u);
  assert.match(source, /WHERE baseline_accounted=0/u);
  assert.match(source, /"private, no-store"/u);
  assert.match(source, /async function internalObjectWrite\(/u);
  assert.match(source, /UPDATE files SET b2_file_id=\?,size_bytes=\?,mime_type=\?,sha256=\?/u);
  assert.match(source, /internalVersionCacheKey\(request, row\)/u);
  assert.match(source, /b2_retained_versions/u);
  assert.match(source, /validLegacyPath\(path\)/u);
  assert.doesNotMatch(source, /ListObjects|list_file_names|list-type=2|listFiles/iu);
});
