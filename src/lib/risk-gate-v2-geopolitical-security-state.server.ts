import { classifyGlobalEntity } from "./global-entity-classification";
import { requireRiskSupabase } from "./risk-supabase.server";
import { buildRiskGateV2GeopoliticalSecuritySnapshot } from "./risk-gate-v2-geopolitical-security-state";

const SOURCE_ID = "ucdp_candidate";

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const result = await build(from, from + pageSize - 1);
    if (result.error) throw result.error;
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

export async function generateCountryRiskGateV2GeopoliticalSecurityState(input: {
  country_iso3: string;
  as_of: string;
  generated_at?: string;
}) {
  const iso3 = input.country_iso3.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3)) throw new Error("country_iso3 must be ISO3");
  const asOf = new Date(input.as_of);
  if (Number.isNaN(asOf.getTime())) throw new Error("Invalid as_of timestamp");

  const db = requireRiskSupabase();
  const manifestResult = await db
    .from("live_source_release_manifests")
    .select("release_id,manifest_hash,coverage_start,coverage_end,retrieved_at,write_completed,rejected_rows,unmapped_rows,metadata")
    .eq("source_id", SOURCE_ID)
    .eq("write_completed", true)
    .eq("rejected_rows", 0)
    .eq("unmapped_rows", 0)
    .lte("retrieved_at", asOf.toISOString())
    .order("retrieved_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (manifestResult.error) throw manifestResult.error;
  if (!manifestResult.data) return null;

  const releaseRank = Number(manifestResult.data.metadata?.release_rank ?? 0);
  if (!Number.isInteger(releaseRank) || releaseRank <= 0) return null;

  const registry = await fetchAll<Record<string, unknown>>((from, to) =>
    db.from("live_country_registry").select("iso3").eq("enabled", true).range(from, to),
  );
  const sovereigns = registry
    .map((row) => String(row.iso3 ?? "").trim().toUpperCase())
    .filter((country) => classifyGlobalEntity(country) === "SOVEREIGN")
    .sort();

  const rows = await fetchAll<Record<string, unknown>>((from, to) =>
    db
      .from("live_ucdp_candidate_latest")
      .select("country_iso3,observed_at,value_numeric,quality_status,commercial_eligibility_status,provenance")
      .range(from, to),
  );

  const currentRelease = rows.filter(
    (row) => Number((row.provenance as Record<string, unknown> | null)?.release_rank ?? 0) === releaseRank,
  );

  const blockedCountries = new Set<string>();
  for (const row of currentRelease) {
    const country = String(row.country_iso3 ?? "").trim().toUpperCase();
    if (
      /^[A-Z]{3}$/.test(country) &&
      (row.quality_status !== "VERIFIED" || row.commercial_eligibility_status !== "VERIFIED")
    ) {
      blockedCountries.add(country);
    }
  }
  if (blockedCountries.has(iso3)) return null;

  const verifiedEvents = currentRelease
    .filter(
      (row) => row.quality_status === "VERIFIED" && row.commercial_eligibility_status === "VERIFIED",
    )
    .map((row) => ({
      country_iso3: String(row.country_iso3 ?? ""),
      observed_at: String(row.observed_at ?? ""),
      best_deaths: Number(row.value_numeric ?? 0),
      type_of_violence:
        (row.provenance as Record<string, unknown> | null)?.type_of_violence == null
          ? null
          : String((row.provenance as Record<string, unknown>).type_of_violence),
    }));

  const snapshot = buildRiskGateV2GeopoliticalSecuritySnapshot({
    sovereign_iso3: sovereigns,
    blocked_country_iso3: [...blockedCountries],
    events: verifiedEvents,
    release: {
      release_id: manifestResult.data.release_id,
      manifest_hash: manifestResult.data.manifest_hash,
      coverage_start: manifestResult.data.coverage_start,
      coverage_end: manifestResult.data.coverage_end,
      retrieved_at: manifestResult.data.retrieved_at,
      write_completed: true,
      rejected_rows: 0,
      unmapped_rows: 0,
    },
    generated_at: input.generated_at ?? new Date().toISOString(),
  });

  return snapshot.get(iso3) ?? null;
}
