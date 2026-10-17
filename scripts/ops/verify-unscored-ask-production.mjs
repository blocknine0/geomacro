#!/usr/bin/env node
/**
 * Read-only production check for all three Ask official-news categories.
 * Never sends PAYMENT-SIGNATURE or POST, never authorizes real funds.
 * We fail before three public Ask reads when the deployed build is stale,
 * avoiding unnecessary remote API/LLM cost on an unaccepted deployment.
 */
import { inspectPublishedBuild, inspectUnscoredAsk } from "../lib/unscored-ask-production-proof.mjs";

const origin = "https://geomacro.live";
const expected = String(process.env.EXPECTED_SHA ?? "").trim();
const base = String(process.env.GEOMACRO_BASE_URL ?? origin).replace(/\/$/u, "");
const tests = [
  ["geopolitics", "What are the latest geopolitical developments?"],
  ["macro", "What are the latest macroeconomic developments?"],
  ["rare_earth", "What is changing in critical minerals?"],
];

async function get(url, headers = {}, timeout = 20_000) {
  const response = await fetch(url, {
    method: "GET", redirect: "error", cache: "no-store",
    headers: { Accept: "application/json", "Cache-Control": "no-cache", ...headers },
    signal: AbortSignal.timeout(timeout),
  });
  let data = null;
  try {
    const raw = await response.text();
    if (raw.length <= 100_000) data = JSON.parse(raw);
  } catch { /* Network and malformed JSON fail closed. */ }
  return { status: response.status, body: data };
}

const output = {
  schema: "geomacro.ask-unscored-no-funds-live-acceptance.v1",
  checked_at: new Date().toISOString(),
  payment_signature_sent: false, payment_performed: false,
  settlement_performed: false, signed_gro_claimed: false,
  source_identity_logged: false, raw_data_logged: false,
  production_verification: "UNAVAILABLE",
  categories: [],
};

try {
  const marker = await get(base + "/.well-known/geomacro-build.json");
  const proof = inspectPublishedBuild(marker.body, expected);
  output.build = { ...proof, http_status: marker.status };
  if (marker.status !== 200 || !proof.ok) {
    output.production_verification = "STALE_OR_UNVERIFIED_DEPLOYMENT";
  } else {
    for (const [category, question] of tests) {
      try {
        const answer = await get(base + "/api/public-ask", {
          Origin: origin, "x-geomacro-question": question,
          "User-Agent": "Geomacro-Unscored-No-Funds-Live-Acceptance/1",
        }, 20_000);
        output.categories.push({
          ...inspectUnscoredAsk(answer.body, category),
          http_status: answer.status,
        });
      } catch (error) {
        output.categories.push({ category, ok: false, status: error?.name === "TimeoutError"
          ? "ASK_TIMEOUT" : "ASK_TRANSPORT_UNAVAILABLE" });
      }
    }
    output.production_verification = output.categories.every(x => x.ok && x.http_status === 200)
      ? "THREE_CATEGORIES_CURRENT_UNSCORED"
      : "ONE_OR_MORE_CATEGORIES_NOT_PROVEN";
  }
} catch {
  output.production_verification = "BUILD_MARKER_UNAVAILABLE";
}
output.ok = output.production_verification === "THREE_CATEGORIES_CURRENT_UNSCORED";
console.log(JSON.stringify(output, null, 2));
if (!output.ok) {
  console.error("ASK_UNSCORED_LIVE_ACCEPTANCE_INCOMPLETE_NO_FUNDS");
  process.exitCode = 2;
}
