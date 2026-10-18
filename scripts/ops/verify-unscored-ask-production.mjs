#!/usr/bin/env node
/**
 * Read-only production check for all three Ask official-news categories.
 * Never sends PAYMENT-SIGNATURE or POST, never authorizes real funds.
 * We fail before the public Ask reads when the deployed build is stale,
 * avoiding unnecessary remote API/LLM cost on an unaccepted deployment.
 */
import { pathToFileURL } from "node:url";
import { inspectPublishedBuild, inspectUnscoredAsk, inspectBoundedFollowUp } from "../lib/unscored-ask-production-proof.mjs";

const origin = "https://geomacro.live";
const tests = [
  ["geopolitics", "What are the latest geopolitical developments?"],
  ["macro", "What are the latest macroeconomic developments?"],
  ["rare_earth", "What is changing in critical minerals?"],
];

export async function verifyAskAcceptance({ expectedSha, base = origin, fetchImpl = fetch, now = Date.now() }) {
  base = base.replace(/\/$/u, "");
  async function get(url, headers = {}, timeout = 20_000) {
    const response = await fetchImpl(url, {
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
    checked_at: new Date(now).toISOString(),
    payment_signature_sent: false, payment_performed: false,
    settlement_performed: false, signed_gro_claimed: false,
    source_identity_logged: false, raw_data_logged: false,
    production_verification: "UNAVAILABLE",
    categories: [],
    follow_up: null,
  };

  try {
    const marker = await get(base + "/.well-known/geomacro-build.json");
    const proof = inspectPublishedBuild(marker.body, expectedSha);
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
            ...inspectUnscoredAsk(answer.body, category, now),
            http_status: answer.status,
          });
        } catch (error) {
          output.categories.push({ category, ok: false, status: error?.name === "TimeoutError"
            ? "ASK_TIMEOUT" : "ASK_TRANSPORT_UNAVAILABLE" });
        }
      }
      try {
        const answer = await get(base + "/api/public-ask", {
          Origin: origin, "x-geomacro-question": "What about India?",
          "x-geomacro-previous-question": "What is driving geopolitical risk?",
          "User-Agent": "Geomacro-Unscored-No-Funds-Live-Acceptance/1",
        });
        output.follow_up = { ...inspectBoundedFollowUp(answer.body), http_status: answer.status };
      } catch {
        output.follow_up = { ok: false, status: "FOLLOW_UP_TRANSPORT_UNAVAILABLE" };
      }
      output.production_verification = output.categories.every(x => x.ok && x.http_status === 200) &&
        output.follow_up.ok && output.follow_up.http_status === 200
        ? "THREE_CATEGORIES_CURRENT_UNSCORED_AND_FOLLOW_UP"
        : "CATEGORY_OR_FOLLOW_UP_NOT_PROVEN";
    }
  } catch {
    output.production_verification = "BUILD_MARKER_UNAVAILABLE";
  }
  output.ok = output.production_verification === "THREE_CATEGORIES_CURRENT_UNSCORED_AND_FOLLOW_UP";
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = await verifyAskAcceptance({
    expectedSha: String(process.env.EXPECTED_SHA ?? "").trim(),
    base: String(process.env.GEOMACRO_BASE_URL ?? origin),
  });
  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) {
    console.error("ASK_UNSCORED_LIVE_ACCEPTANCE_INCOMPLETE_NO_FUNDS");
    process.exitCode = 2;
  }
}
