#!/usr/bin/env node
// No raw article/headline/body, secrets, direct B2 GET, Supabase or payment.
// Strictly compare three public read-only endpoints after deploying the worker.
import { summarizePublicIntelligenceFreshness } from "../lib/public-intelligence-freshness-audit.mjs";

const URLs = Object.freeze({
  edge: "https://geomacro-intelligence.daspallab202391.workers.dev/intelligence",
  site: "https://geomacro.live/api/public/intelligence",
  overlay: "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/intelligence-overlay",
});

async function probe(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.text();
  let payload = null;
  if (body.length <= 256_000) {
    try { payload = JSON.parse(body); } catch { /* Fail closed. */ }
  }
  return {
    status: response.status,
    authority: response.headers.get("x-geomacro-authority"),
    current_overlay: response.headers.get("x-geomacro-current-overlay"),
    b2_sha256: response.headers.get("x-geomacro-b2-sha256"),
    payload,
    verified_b2_sha256: payload?.verified_b2_sha256 ?? null,
    current_source_batch_at: payload?.current_source_batch_at ?? null,
  };
}

let last = null;
for (let attempt = 1; attempt <= 6; attempt++) {
  try {
    const [edge, site, overlay] = await Promise.all([
      probe(URLs.edge), probe(URLs.site), probe(URLs.overlay),
    ]);
    const proof = summarizePublicIntelligenceFreshness({ edge, site, overlay });
    // Verified public row parity is independent of publisher-event vs collection times.
    const siteVisible = proof.site_overlay_converged === true;
    last = {
      schema: "geomacro.intelligence-overlay-deploy-convergence.v1",
      attempt,
      live_edge_200: proof.public_edge_http_status === 200,
      live_site_200: proof.public_site_http_status === 200,
      edge_verified_b2_authority: proof.b2_bound_edge_authority_verified,
      overlay_state: proof.current_overlay_state,
      d1_overlay_http_status: proof.d1_overlay_http_status,
      overlay_batch_at: proof.d1_overlay_batch_at,
      site_observed_source_batch: proof.site_observed_source_batch,
      site_overlay_intentionally_suppressed: proof.site_overlay_intentionally_suppressed,
      site_overlay_converged: siteVisible,
      site_current_scored_domains_matched: proof.site_current_scored_domains_matched,
      site_current_within_24h: site?.payload?.current_within_24h === true,
      // This deploy proof does NOT turn historical scored events into current.
      scored_domains: proof.scored_domains,
      three_domain_current_scored_ready: proof.three_domain_current_scored_ready,
      external_payment_performed: false,
      supabase_reads: 0,
      direct_b2_reads: 0,
    };
    if (proof.current_overlay_state === "D1_CURRENT_OVERLAY_BOUND_TO_B2_VISIBLE" &&
        siteVisible && site?.payload?.current_within_24h === true) {
      console.log(JSON.stringify({ ...last, ok: true }));
      process.exit(0);
    }
  } catch {
    last = {
      schema: "geomacro.intelligence-overlay-deploy-convergence.v1",
      attempt, outcome: "ONE_OR_MORE_PUBLIC_READ_ONLY_ENDPOINTS_UNAVAILABLE",
      external_payment_performed: false, supabase_reads: 0, direct_b2_reads: 0,
    };
  }
  if (attempt < 6) await new Promise(resolve => setTimeout(resolve, 10_000));
}
console.log(JSON.stringify({ ...last, ok: false }));
console.error("INTELLIGENCE_EDGE_D1_B2_SITE_OVERLAY_NOT_CONVERGED");
process.exit(3);
