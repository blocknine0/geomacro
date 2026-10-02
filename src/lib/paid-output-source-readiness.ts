export const PAID_OUTPUT_REQUIRED_CATEGORIES = [
  "GEOPOLITICS",
  "MACRO",
  "CRITICAL_MINERALS",
] as const;

export type PaidOutputRequiredCategory =
  (typeof PAID_OUTPUT_REQUIRED_CATEGORIES)[number];

export type PaidOutputSourceReadinessRow = {
  source_id: string;
  category: string | null;
  certification_state: string | null;
  commercial_usage_status: string | null;
  enabled_for_ingestion: boolean;
  enabled_for_commercial_signals: boolean;
};

export type PaidOutputSourceReadiness = {
  ready: boolean;
  enabled_source_count: number;
  eligible_source_count: number;
  covered_categories: PaidOutputRequiredCategory[];
  missing_categories: PaidOutputRequiredCategory[];
  blocked_source_ids: string[];
};

const DERIVED_COMMERCIAL_STATUSES = new Set(["COMMERCIAL_OK", "DERIVED_ONLY"]);

/**
 * Commercial launch readiness is intentionally scoped to the sources that are
 * explicitly allowed to influence a paid Geomacro structured response.
 *
 * The broader source universe remains an audit/research/ingestion concern and
 * does not become a paid-delivery prerequisite merely because it is indexed or
 * ingestible. Every source that IS enabled for paid signals must fail closed
 * unless its derived commercial use and source certification are both proven.
 */
export function evaluatePaidOutputSourceReadiness(
  rows: Iterable<PaidOutputSourceReadinessRow>,
): PaidOutputSourceReadiness {
  const enabled = [...rows].filter((row) => row.enabled_for_commercial_signals === true);
  const seen = new Set<string>();
  const blocked = new Set<string>();
  const covered = new Set<PaidOutputRequiredCategory>();
  let eligibleSourceCount = 0;

  for (const row of enabled) {
    const sourceId = String(row.source_id ?? "").trim();
    const category = String(row.category ?? "").trim().toUpperCase();
    const validSourceId = /^[A-Za-z0-9_.:-]{1,160}$/.test(sourceId) && !seen.has(sourceId);
    if (sourceId) seen.add(sourceId);

    const eligible =
      validSourceId &&
      row.enabled_for_ingestion === true &&
      DERIVED_COMMERCIAL_STATUSES.has(String(row.commercial_usage_status ?? "")) &&
      row.certification_state === "CERTIFIED" &&
      PAID_OUTPUT_REQUIRED_CATEGORIES.includes(category as PaidOutputRequiredCategory);

    if (!eligible) {
      blocked.add(sourceId || "INVALID_SOURCE_ID");
      continue;
    }

    eligibleSourceCount += 1;
    covered.add(category as PaidOutputRequiredCategory);
  }

  const coveredCategories = PAID_OUTPUT_REQUIRED_CATEGORIES.filter((category) =>
    covered.has(category),
  );
  const missingCategories = PAID_OUTPUT_REQUIRED_CATEGORIES.filter(
    (category) => !covered.has(category),
  );

  return {
    ready:
      enabled.length > 0 &&
      blocked.size === 0 &&
      missingCategories.length === 0 &&
      eligibleSourceCount === enabled.length,
    enabled_source_count: enabled.length,
    eligible_source_count: eligibleSourceCount,
    covered_categories: coveredCategories,
    missing_categories: missingCategories,
    blocked_source_ids: [...blocked].sort(),
  };
}
