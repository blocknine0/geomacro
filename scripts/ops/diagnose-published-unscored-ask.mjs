#!/usr/bin/env node
// Published-build diagnostic only: GET-only, no funds, no raw/source output.
// Unlike strict launch acceptance this reports the CURRENTLY PUBLISHED build
// even when main has advanced. It NEVER grants commercial readiness.
import { inspectUnscoredAsk } from "../lib/unscored-ask-production-proof.mjs";

const base = "https://geomacro.live";
const expectedMain = String(process.env.EXPECTED_MAIN_SHA ?? "");
const cases = [
  { category: "geopolitics", question: "What are the latest geopolitical developments?" },
  { category: "macro", question: "What are the latest macroeconomic developments?" },
  { category: "rare_earth", question: "What is changing in critical minerals?" },
];
const proof = {
  schema: "geomacro.published-unscored-ask-observation.v1",
  checked_at: new Date().toISOString(), payment_sent: false,
  settlement_performed: false, raw_source_data_logged: false,
  canonical_main_sha: expectedMain, published_sha: null,
  published_equals_main: false, observations: [],
};
async function json(url, headers = {}) {
  const res = await fetch(url, { redirect: "error", cache: "no-store",
    headers: { Accept: "application/json", "Cache-Control": "no-cache", ...headers },
    signal: AbortSignal.timeout(21_000),
  });
  const body = await res.text();
  let payload = null;
  if (body.length <= 100_000) {
    try { payload = JSON.parse(body); } catch {}
  }
  return { status: res.status, payload };
}
try {
  const marker = await json(base + "/.well-known/geomacro-build.json");
  const sha = String(marker.payload?.canonical_main_sha ?? "").toLowerCase();
  if (marker.status !== 200 || !/^[0-9a-f]{40}$/u.test(sha)) {
    proof.error = "LIVE_BUILD_MARKER_UNAVAILABLE";
  } else {
    proof.published_sha = sha;
    proof.published_equals_main = sha === expectedMain;
    for (const { category, question } of cases) {
      try {
        const result = await json(base + "/api/public-ask", {
          Origin: base,
          "x-geomacro-question": question,
          "User-Agent": "Geomacro-Read-Only-Published-Ask-Diagnostic/1",
        });
        proof.observations.push({
          ...inspectUnscoredAsk({ ...result.payload }, category),
          http_status: result.status,
        });
      } catch (e) {
        proof.observations.push({ category, ok: false,
          status: e?.name === "TimeoutError" ? "ASK_TIMEOUT" : "ASK_NETWORK_UNAVAILABLE" });
      }
    }
  }
} catch {
  proof.error = "LIVE_BUILD_MARKER_UNREACHABLE";
}
proof.all_three_real_originals = proof.observations.length === 3 &&
  proof.observations.every(x => x.ok && x.http_status === 200);
proof.commercial_readiness_proven = false;
proof.signed_delivery_proven = false;
proof.production_exact_head_accepted = proof.published_equals_main && proof.all_three_real_originals;
console.log(JSON.stringify(proof, null, 2));
if (!proof.all_three_real_originals) process.exitCode = 2;
