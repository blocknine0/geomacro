import { createClient } from "@supabase/supabase-js";
import { dryRunCountryRiskObject } from "../src/lib/country-risk-publisher.server";
import { assertFedericoPublicationReady } from "../src/lib/federico-publication-policy";
import {
  extractTrustedPublishedAt,
  isTrustedFedericoTimestampUrl,
} from "../src/lib/federico-source-time-hydration";

const COUNTRY_ISO3 = "CHN";
const SOURCE_ID = "xinhua_english_china_rss";
const MAX_ROWS = 30;

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function hydrateTrustedSourceTimes() {
  const url = requireEnv("APP_SUPABASE_URL");
  const serviceRole = requireEnv("APP_SUPABASE_SERVICE_ROLE_KEY");
  const db = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const asOf = new Date();
  const cutoff = new Date(asOf.getTime() - 6 * 3_600_000).toISOString();

  const result = await db
    .from("live_flash_events")
    .select(
      "flash_id,source_id,source_url,published_at,last_seen_at,live_flash_event_countries!inner(country_iso3)",
    )
    .eq("source_id", SOURCE_ID)
    .eq("live_flash_event_countries.country_iso3", COUNTRY_ISO3)
    .is("published_at", null)
    .gte("last_seen_at", cutoff)
    .order("last_seen_at", { ascending: false })
    .limit(MAX_ROWS);

  if (result.error) throw result.error;

  let attempted = 0;
  let hydrated = 0;

  for (const row of result.data ?? []) {
    const sourceUrl = String(row.source_url ?? "").trim();
    if (!isTrustedFedericoTimestampUrl(sourceUrl)) continue;

    attempted += 1;

    try {
      const response = await fetch(sourceUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "User-Agent": "Geomacro/1.0 (+https://geomacro.live; contact=contact@geomacro.live)",
        },
        signal: AbortSignal.timeout(12_000),
      });

      if (!response.ok) continue;

      const html = await response.text();
      const publishedAt = extractTrustedPublishedAt(html, sourceUrl, asOf);
      if (!publishedAt) continue;

      const update = await db
        .from("live_flash_events")
        .update({ published_at: publishedAt })
        .eq("flash_id", row.flash_id)
        .is("published_at", null)
        .select("flash_id");

      if (update.error) throw update.error;
      if ((update.data ?? []).length === 1) hydrated += 1;
    } catch {
      // Metadata enrichment is fail-closed: an unreachable or unparseable
      // publisher page remains without a trusted publication timestamp and
      // therefore cannot gain verification credit through this path.
    }
  }

  console.error(JSON.stringify({
    source_time_hydration: {
      source_id: SOURCE_ID,
      attempted,
      hydrated,
      max_rows: MAX_ROWS,
      policy: "trusted_publisher_metadata_only",
    },
  }));

  return hydrated;
}

async function acquireFreshOidcToken() {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL?.trim();
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN?.trim();
  const audience =
    process.env.GITHUB_OIDC_AUDIENCE?.trim() ||
    "https://geomacro.live/actions/live-flash-rss";

  if (requestUrl && requestToken) {
    const separator = requestUrl.includes("?") ? "&" : "?";
    const response = await fetch(
      `${requestUrl}${separator}audience=${encodeURIComponent(audience)}`,
      {
        headers: { Authorization: `bearer ${requestToken}` },
      },
    );

    if (!response.ok) {
      throw new Error(`GitHub OIDC refresh failed with HTTP ${response.status}`);
    }

    const body = await response.json() as { value?: unknown };
    const token = typeof body.value === "string" ? body.value.trim() : "";
    if (!token) throw new Error("GitHub OIDC refresh returned no token");
    return token;
  }

  return requireEnv("GEOMACRO_FLASH_OIDC_TOKEN");
}

async function recorroborateCountry() {
  const base = requireEnv("APP_SUPABASE_URL").replace(/\/$/, "");
  const token = await acquireFreshOidcToken();
  const asOf = new Date().toISOString();
  let offset = 0;
  let processed = 0;
  let verified = 0;
  let corroborating = 0;

  while (true) {
    const response = await fetch(`${base}/functions/v1/live-flash-corroborate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-geomacro-github-oidc-token": token,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        country_iso3: COUNTRY_ISO3,
        as_of: asOf,
        candidate_offset: offset,
      }),
    });

    const body = await response.json() as Record<string, unknown>;
    if (!response.ok || body.ok !== true) {
      throw new Error(`Federico re-corroboration failed with HTTP ${response.status}`);
    }

    processed += Number(body.processed ?? 0);
    verified += Number(body.verified ?? 0);
    corroborating += Number(body.corroborating ?? 0);

    const next = body.next_candidate_offset;
    if (next === null || next === undefined) break;
    if (!Number.isInteger(next) || Number(next) <= offset || Number(next) >= 600) {
      throw new Error("Federico re-corroboration cursor did not advance safely");
    }
    offset = Number(next);
  }

  console.error(JSON.stringify({
    recorroboration: {
      country_iso3: COUNTRY_ISO3,
      processed,
      verified,
      corroborating,
    },
  }));
}

const hydrated = await hydrateTrustedSourceTimes();
if (hydrated > 0) {
  await recorroborateCountry();
}

const { object, context } = await dryRunCountryRiskObject({
  country_iso3: COUNTRY_ISO3,
  delivery_profile: "FEDERICO_STRICT",
});

// stdout is intentionally exactly one JSON document because the workflow
// persists it as evidence-readiness.json. Operational diagnostics go to stderr.
console.log(JSON.stringify({
  published: false,
  evidence_summary: object.evidence_summary,
  decision_readiness: object.decision_readiness,
  commercial_eligibility: object.commercial_eligibility,
  verification: object.verification,
  context,
}, null, 2));
assertFedericoPublicationReady(object);
