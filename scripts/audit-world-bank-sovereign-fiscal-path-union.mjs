import fs from "node:fs";

const QPSD_REPORT =
  process.env.WORLD_BANK_QPSD_COVERAGE_OUTPUT ??
  "world-bank-qpsd-sovereign-fiscal-coverage.json";
const PPG_REPORT =
  process.env.WORLD_BANK_PPG_RATIO_OUTPUT ??
  "world-bank-ppg-debt-stock-ratio.json";
const OUTPUT =
  process.env.WORLD_BANK_FISCAL_PATH_UNION_OUTPUT ??
  "world-bank-sovereign-fiscal-path-union.json";

function loadJson(path) {
  if (!fs.existsSync(path)) throw new Error(`Required audit report missing: ${path}`);
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function normalizedIso3(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value ?? "").trim().toUpperCase())
        .filter((value) => /^[A-Z]{3}$/.test(value)),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

function intersection(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

function main() {
  const qpsd = loadJson(QPSD_REPORT);
  const ppg = loadJson(PPG_REPORT);

  if (qpsd?.writes_performed !== false) {
    throw new Error("QPSD input must be a no-write audit report");
  }
  if (ppg?.writes_performed !== false) {
    throw new Error("PPG input must be a no-write audit report");
  }
  if (qpsd?.activation_boundary?.production_activation_allowed !== false) {
    throw new Error("QPSD input unexpectedly allows production activation");
  }
  if (ppg?.activation_boundary?.production_activation_allowed !== false) {
    throw new Error("PPG input unexpectedly allows production activation");
  }
  if (qpsd?.methodology_boundary?.raw_cross_source_value_pooling_allowed !== false) {
    throw new Error("QPSD input does not preserve raw cross-source pooling boundary");
  }
  if (ppg?.derived_metric?.raw_cross_concept_peer_pooling_allowed !== false) {
    throw new Error("PPG input does not preserve raw cross-concept pooling boundary");
  }

  const qpsdGeneralGovernment = normalizedIso3(
    qpsd?.series?.find(
      (item) => item?.concept === "GENERAL_GOVERNMENT_GROSS_DEBT_PCT_GDP",
    )?.fresh_or_aging_iso3,
  );
  const qpsdCentralGovernment = normalizedIso3(
    qpsd?.series?.find(
      (item) => item?.concept === "CENTRAL_GOVERNMENT_GROSS_DEBT_PCT_GDP",
    )?.fresh_or_aging_iso3,
  );
  const qpsdUnion = normalizedIso3([
    ...qpsdGeneralGovernment,
    ...qpsdCentralGovernment,
  ]);
  const ppgExternalDebtPressure = normalizedIso3(
    ppg?.coverage_summary?.fresh_iso3,
  );
  const sourcePathUnion = normalizedIso3([
    ...qpsdUnion,
    ...ppgExternalDebtPressure,
  ]);
  const overlap = intersection(qpsdUnion, ppgExternalDebtPressure);
  const qpsdOnly = difference(qpsdUnion, ppgExternalDebtPressure);
  const ppgOnly = difference(ppgExternalDebtPressure, qpsdUnion);

  const report = {
    schema_version: "geomacro-world-bank-sovereign-fiscal-source-path-union-1.0",
    generated_at: new Date().toISOString(),
    writes_performed: false,
    scoring_changed: false,
    country_payability_changed: false,
    production_activation_allowed: false,
    source_paths: {
      qpsd_general_government: {
        concept: "GENERAL_GOVERNMENT_GROSS_DEBT_PCT_GDP",
        metric: "DP.DOD.DECT.CR.GG.Z1",
        country_count: qpsdGeneralGovernment.length,
        iso3: qpsdGeneralGovernment,
      },
      qpsd_central_government: {
        concept: "CENTRAL_GOVERNMENT_GROSS_DEBT_PCT_GDP",
        metric: "DP.DOD.DECT.CR.CG.Z1",
        country_count: qpsdCentralGovernment.length,
        iso3: qpsdCentralGovernment,
      },
      ppg_external_debt_pressure: {
        concept: "PUBLIC_AND_PUBLICLY_GUARANTEED_EXTERNAL_DEBT_STOCK_PRESSURE_NOT_TOTAL_GOVERNMENT_DEBT",
        metric: "DT.DOD.DPPG.CD / NY.GNP.MKTP.CD * 100",
        country_count: ppgExternalDebtPressure.length,
        iso3: ppgExternalDebtPressure,
      },
    },
    source_path_union: {
      qpsd_union_country_count: qpsdUnion.length,
      ppg_fresh_country_count: ppgExternalDebtPressure.length,
      qpsd_ppg_overlap_count: overlap.length,
      qpsd_only_count: qpsdOnly.length,
      ppg_only_count: ppgOnly.length,
      unique_source_path_country_count: sourcePathUnion.length,
      target_100_distinct_source_paths_observed: sourcePathUnion.length >= 100,
      iso3: sourcePathUnion,
      overlap_iso3: overlap,
      qpsd_only_iso3: qpsdOnly,
      ppg_only_iso3: ppgOnly,
    },
    methodology_boundary: {
      this_is_not_a_scoring_peer_union: true,
      raw_values_combined: false,
      peer_distributions_combined: false,
      semantic_concepts_treated_as_interchangeable: false,
      source_specific_methodology_required_before_promotion: true,
      authoritative_registry_mapping_required_before_promotion: true,
      full_production_country_census_required_before_promotion: true,
      source_path_presence_is_not_production_support: true,
      source_path_presence_is_not_payability: true,
    },
    activation_boundary: {
      production_activation_allowed: false,
      production_supported_country_count_added: 0,
      next_required_proof:
        "Map each source-specific path to the authoritative Geomacro sovereign registry, implement and validate each allowed source-specific shadow methodology independently, then run the full required-module production census. Do not pool QPSD debt ratios with PPG external-debt pressure values.",
    },
  };

  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        generated_at: report.generated_at,
        source_path_union: report.source_path_union,
        methodology_boundary: report.methodology_boundary,
        activation_boundary: report.activation_boundary,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: WORLD BANK SOVEREIGN FISCAL SOURCE-PATH UNION AUDIT COMPLETE - NO WRITES",
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
}
