const CATEGORIES = Object.freeze(["geopolitics", "macro", "rare_earth"]);
const DAY_MS = 24 * 60 * 60 * 1000;
const HASH = /^[a-f0-9]{64}$/u;

function safeIso(value, now) {
  const ms = Date.parse(String(value ?? ""));
  return Number.isFinite(ms) && ms <= now + 5 * 60_000 && ms >= 0
    ? new Date(ms).toISOString()
    : null;
}

export function summarizePublicIntelligenceFreshness({
  edge,
  site,
  overlay,
  now = Date.now(),
} = {}) {
  const rows = Array.isArray(edge?.payload?.rows) ? edge.payload.rows : [];
  const known = edge?.status === 200 &&
    edge?.authority === "backblaze-b2-intelligence-edge" &&
    edge?.payload?.schema === "geomacro.public-intelligence-live.v1" &&
    edge?.payload?.source_project === "ldpwajisioljyjtojvfx";
  const scoredByCategory = Object.fromEntries(CATEGORIES.map(c => [
    c, { verified_scored_count: 0, current_scored_count: 0, latest_original_at: null, state: "UNAVAILABLE" },
  ]));
  if (known) {
    for (const row of rows) {
      const c = String(row?.category ?? "");
      if (!CATEGORIES.includes(c) || row?.public_status !== "verified_b2" ||
          !String(row?.source_title ?? "").startsWith("Geomacro finds ") ||
          typeof row?.severity !== "number" || !Number.isFinite(row.severity) ||
          row.severity < 0 || row.severity > 100) continue;
      const date = safeIso(row?.published_at ?? row?.created_at, now);
      if (!date) continue;
      const x = scoredByCategory[c];
      x.verified_scored_count++;
      x.latest_original_at = !x.latest_original_at || date > x.latest_original_at
        ? date : x.latest_original_at;
      if (now - Date.parse(date) <= DAY_MS) x.current_scored_count++;
    }
    for (const c of CATEGORIES) {
      const d = scoredByCategory[c];
      d.state = d.current_scored_count ? "CURRENT_VERIFIED" :
        d.verified_scored_count ? "HISTORICAL_VERIFIED" : "NO_PUBLIC_SCORED_EVIDENCE";
    }
  }

  const edgeSha = String(edge?.b2_sha256 ?? "");
  const overlaySha = String(overlay?.verified_b2_sha256 ?? "");
  const safeHashes = HASH.test(edgeSha) && HASH.test(overlaySha);
  const sourceBatch = safeIso(overlay?.current_source_batch_at, now);
  const overlayStatus = Number(overlay?.status ?? 0);
  const overlayVisible = edge?.current_overlay === "cloudflare-d1-hot";

  const pipeline = !known ? "EDGE_UNAVAILABLE_OR_UNVERIFIED" :
    overlayStatus !== 200 ? "D1_CURRENT_OVERLAY_UNAVAILABLE_OR_STALE" :
    !safeHashes || edgeSha !== overlaySha ? "EDGE_BASELINE_AND_D1_OVERLAY_HASH_MISMATCH" :
    !sourceBatch || now - Date.parse(sourceBatch) > 6 * 60 * 60_000 ? "D1_CURRENT_OVERLAY_OUTDATED" :
    !overlayVisible ? "EDGE_NOT_PROJECTING_VERIFIED_D1_CURRENT_OVERLAY" :
    "D1_CURRENT_OVERLAY_BOUND_TO_B2_VISIBLE";
  const siteStatus = Number(site?.status ?? 0);
  const siteOk = siteStatus === 200 && site?.payload?.ok === true &&
    Array.isArray(site?.payload?.rows);
  const freshThree = CATEGORIES.every(c => scoredByCategory[c].state === "CURRENT_VERIFIED");
  return {
    schema: "geomacro.public-intelligence-three-domain-audit.v1",
    checked_at: new Date(now).toISOString(),
    payment_performed: false,
    supabase_reads: 0,
    b2_direct_reads: 0,
    public_edge_http_status: edge?.status ?? null,
    public_site_http_status: site?.status ?? null,
    public_site_api_ok: siteOk,
    public_site_mode: site?.payload?.mode === "verified_b2" ||
      site?.payload?.mode === "verified_b2_plus_live_observed" ? site.payload.mode : null,
    public_site_total_rows: siteOk ? site.payload.rows.length : 0,
    b2_bound_edge_authority_verified: known,
    current_overlay_state: pipeline,
    edge_current_overlay: edge?.current_overlay ?? "unknown",
    d1_overlay_http_status: overlayStatus,
    d1_overlay_batch_at: sourceBatch,
    scored_domains: scoredByCategory,
    current_verified_scored_domains: CATEGORIES.filter(c => scoredByCategory[c].state === "CURRENT_VERIFIED").length,
    three_domain_current_scored_ready: freshThree && siteOk && known,
    // Public API availability is not a commercial rights or signed-GRO claim.
    commercial_payable_ready: false,
  };
}
