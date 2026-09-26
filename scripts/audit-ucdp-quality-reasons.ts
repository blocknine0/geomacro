import { writeFile } from "node:fs/promises";
import { requireRiskSupabase } from "../src/lib/risk-supabase.server";

const OUTPUT =
  process.env.UCDP_QUALITY_REASON_DIAGNOSTICS_OUTPUT ??
  "ucdp-quality-reason-diagnostics.json";
const SOURCE_ID = "ucdp_candidate";
const PAGE_SIZE = 1000;
const KNOWN_REASONS = new Set([
  "CODE_STATUS_NOT_CLEAR",
  "FATALITY_INTERVAL_NOT_ORDERED",
  "BEST_COMPONENT_SUM_MISMATCH",
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function iso3(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

async function fetchAll(table: string, select: string, configure?: (query: any) => any) {
  const db = requireRiskSupabase();
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query: any = db.from(table).select(select).range(from, from + PAGE_SIZE - 1);
    if (configure) query = configure(query);
    const result = await query;
    if (result.error) throw result.error;
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function main() {
  const db = requireRiskSupabase();
  const manifestResult = await db
    .from("live_source_release_manifests")
    .select("release_id,retrieved_at,metadata,rejected_rows,unmapped_rows,write_completed")
    .eq("source_id", SOURCE_ID)
    .eq("write_completed", true)
    .eq("rejected_rows", 0)
    .eq("unmapped_rows", 0)
    .order("retrieved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (manifestResult.error) throw manifestResult.error;
  if (!manifestResult.data) throw new Error("No clean UCDP Candidate release manifest found");

  const manifestMetadata = record(manifestResult.data.metadata);
  const releaseRank = Number(manifestMetadata.release_rank ?? 0);
  if (!Number.isInteger(releaseRank) || releaseRank <= 0) {
    throw new Error("Latest clean UCDP manifest has no valid release_rank");
  }

  const rows = await fetchAll(
    "live_ucdp_candidate_latest",
    "country_iso3,provenance,quality_status,commercial_eligibility_status",
    (query) => query.order("country_iso3", { ascending: true }),
  );

  const releaseRows = rows.filter(
    (row) => Number(record(row.provenance).release_rank ?? 0) === releaseRank,
  );
  const reasonCounts = new Map<string, number>();
  const reasonCountries = new Map<string, Set<string>>();
  const countryReasons = new Map<string, Map<string, number>>();
  let partialUnverifiedRows = 0;
  let partialWithoutKnownReason = 0;

  for (const row of releaseRows) {
    if (row.quality_status !== "PARTIAL" || row.commercial_eligibility_status !== "UNVERIFIED") {
      continue;
    }
    partialUnverifiedRows += 1;
    const country = iso3(row.country_iso3);
    const provenance = record(row.provenance);
    const rawReasons = Array.isArray(provenance.candidate_quality_reasons)
      ? provenance.candidate_quality_reasons
      : [];
    const reasons = rawReasons
      .map((value) => String(value ?? "").trim())
      .filter((value) => KNOWN_REASONS.has(value));

    if (reasons.length === 0) {
      partialWithoutKnownReason += 1;
      continue;
    }

    for (const reason of new Set(reasons)) {
      increment(reasonCounts, reason);
      if (country) {
        const countries = reasonCountries.get(reason) ?? new Set<string>();
        countries.add(country);
        reasonCountries.set(reason, countries);
        const perCountry = countryReasons.get(country) ?? new Map<string, number>();
        increment(perCountry, reason);
        countryReasons.set(country, perCountry);
      }
    }
  }

  const report = {
    schema_version: "geomacro-ucdp-quality-reason-diagnostics-1.0",
    generated_at: new Date().toISOString(),
    source_id: SOURCE_ID,
    release: {
      release_id: manifestResult.data.release_id,
      release_rank: releaseRank,
      retrieved_at: manifestResult.data.retrieved_at,
    },
    summary: {
      release_row_count: releaseRows.length,
      partial_unverified_row_count: partialUnverifiedRows,
      partial_without_known_reason_count: partialWithoutKnownReason,
      reason_row_counts: Object.fromEntries([...reasonCounts.entries()].sort(([a], [b]) => a.localeCompare(b))),
      reason_country_counts: Object.fromEntries(
        [...reasonCountries.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([reason, countries]) => [reason, countries.size]),
      ),
      reason_country_iso3: Object.fromEntries(
        [...reasonCountries.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([reason, countries]) => [reason, [...countries].sort()]),
      ),
    },
    countries: [...countryReasons.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([country_iso3, reasons]) => ({
        country_iso3,
        reason_counts: Object.fromEntries([...reasons.entries()].sort(([a], [b]) => a.localeCompare(b))),
      })),
    boundaries: {
      read_only: true,
      raw_event_material_included: false,
      source_urls_included: false,
      source_rights_changed: false,
      scoring_changed: false,
      commercial_eligibility_relaxed: false,
      payment_performed: false,
      execution_authorized: false,
    },
  };

  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    generated_at: report.generated_at,
    release: report.release,
    summary: report.summary,
    boundaries: report.boundaries,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
