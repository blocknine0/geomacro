import type { PublicIntelligenceRow } from "./public-intelligence.functions";
import { sanitizePublicIntelligenceRow } from "./public-intelligence-gist";

export const PUBLIC_INTELLIGENCE_EDGE_URL =
  "https://geomacro-intelligence.daspallab202391.workers.dev/intelligence";
const EDGE_AUTHORITY = "backblaze-b2-intelligence-edge";
const EDGE_SCHEMA = "geomacro.public-intelligence-live.v1";
const SOURCE_PROJECT = "ldpwajisioljyjtojvfx";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const EDGE_TIMEOUT_MS = 6_000;

type IntelligenceEdgeEnvelope = {
  schema?: unknown;
  source_project?: unknown;
  generated_at?: unknown;
  rows?: unknown;
};

const PUBLIC_FIELDS = new Set([
  "id", "source_title", "summary", "category", "severity",
  "delta", "created_at", "published_at", "public_status",
]);

/** Parse only the pre-verified Cloudflare B2 readback projection. */
export function parseVerifiedIntelligenceEdgePayload(
  payload: IntelligenceEdgeEnvelope,
  now = Date.now(),
): PublicIntelligenceRow[] {
  const generated = Date.parse(String(payload?.generated_at ?? ""));
  if (
    payload?.schema !== EDGE_SCHEMA ||
    payload?.source_project !== SOURCE_PROJECT ||
    !Number.isFinite(generated) ||
    generated > now + 5 * 60_000 ||
    now - generated > MAX_AGE_MS ||
    !Array.isArray(payload.rows) ||
    payload.rows.length < 1 ||
    payload.rows.length > 300
  ) {
    throw new Error("Verified Intelligence edge proof envelope unavailable");
  }

  const rows: PublicIntelligenceRow[] = [];
  const scoredDomains = new Set<string>();
  for (const value of payload.rows) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid Intelligence edge row");
    }
    if (Object.keys(value).some((key) => !PUBLIC_FIELDS.has(key))) {
      throw new Error("Intelligence edge exposed unapproved fields");
    }
    const verified = sanitizePublicIntelligenceRow(value as PublicIntelligenceRow);
    if (!verified) {
      // A once-published record may be withdrawn from public eligibility;
      // never show unapproved derived text just to preserve its count.
      continue;
    }
    rows.push(verified);
    if (verified.public_status === "verified_b2") scoredDomains.add(String(verified.category));
  }

  if (!["geopolitics", "macro", "rare_earth"].every((domain) => scoredDomains.has(domain))) {
    throw new Error("Verified Intelligence edge scored domain coverage incomplete");
  }
  return rows;
}

/**
 * Same verified Cloudflare serving authority as production's B2-first reader.
 * Browser use avoids Lovable preview's unavailable server-only B2 dependencies.
 * No direct upstream feeds, credentials, private B2 or Supabase calls.
 */
export async function fetchVerifiedIntelligenceEdge(): Promise<PublicIntelligenceRow[]> {
  const response = await fetch(PUBLIC_INTELLIGENCE_EDGE_URL, {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "omit",
    cache: "no-store",
    signal: AbortSignal.timeout(EDGE_TIMEOUT_MS),
  });
  if (
    !response.ok ||
    response.headers.get("x-geomacro-authority") !== EDGE_AUTHORITY ||
    !(response.headers.get("content-type") ?? "").includes("application/json")
  ) {
    throw new Error("Verified Intelligence edge authority unavailable");
  }
  return parseVerifiedIntelligenceEdgePayload(await response.json());
}

/**
 * Lovable preview has no private server B2 environment and its local /api
 * may return 500. Do not send that request in preview at all.
 * Canonical production retains its same-origin backup for edge outages.
 */
export function canUseProductionIntelligenceBackup(hostname: string): boolean {
  return hostname === "geomacro.live" || hostname === "www.geomacro.live";
}


/**
 * Preserve the canonical public API envelope when Lovable's same-origin Nitro
 * runtime has no private B2 environment. Data authority stays the exact same
 * signed/proof-verified Cloudflare edge used by production.
 */
export function buildVerifiedIntelligenceApiPayload(
  verifiedEdgeRows: PublicIntelligenceRow[],
  now = Date.now(),
) {
  const scored = verifiedEdgeRows.filter((r) => r.public_status === "verified_b2");
  const latestScoredByDomain = new Map<string, number>();
  for (const row of verifiedEdgeRows) {
    const timestamp = Date.parse(row.published_at ?? row.created_at);
    if (!Number.isFinite(timestamp) || timestamp > now + 5 * 60_000) continue;
    if (row.public_status === "verified_b2") {
      const category = String(row.category);
      latestScoredByDomain.set(
        category,
        Math.max(latestScoredByDomain.get(category) ?? -Infinity, timestamp),
      );
    }
  }
  const currentAcrossDomains = ["geopolitics", "macro", "rare_earth"].every(
    (domain) => (latestScoredByDomain.get(domain) ?? -Infinity) >= now - 24 * 60 * 60 * 1000,
  );
  const rows = currentAcrossDomains ? scored : verifiedEdgeRows;
  const newestAt = rows.reduce((latest, row) => {
    const timestamp = Date.parse(row.published_at ?? row.created_at);
    return Number.isFinite(timestamp) && timestamp <= now + 5 * 60_000
      ? Math.max(latest, timestamp)
      : latest;
  }, -Infinity);
  const liveCount = rows.filter((r) => r.public_status === "live_observed").length;
  return {
    rows,
    mode: liveCount > 0
      ? "verified_b2_plus_live_observed" as const
      : "verified_b2" as const,
    verified_rows: scored.length,
    live_observed_rows: liveCount,
    newest_at: Number.isFinite(newestAt) ? new Date(newestAt).toISOString() : null,
    current_within_24h: Number.isFinite(newestAt) &&
      newestAt >= now - 24 * 60 * 60 * 1000,
    generated_at: new Date(now).toISOString(),
  };
}
