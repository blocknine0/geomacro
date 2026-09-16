import fs from "node:fs";
import { createHash } from "node:crypto";

const OUTPUT =
  process.env.WORLD_BANK_QPSD_COVERAGE_OUTPUT ??
  "world-bank-qpsd-sovereign-fiscal-coverage.json";
const BULK_CSV =
  process.env.WORLD_BANK_QPSD_BULK_CSV ?? "qpsd-bulk/QPSDCSV.csv";
const AS_OF = new Date(process.env.WORLD_BANK_QPSD_AS_OF ?? Date.now());
const MAX_AGE_DAYS = Number(process.env.WORLD_BANK_QPSD_MAX_AGE_DAYS ?? 550);
const FIXED_PEER_MINIMUM = 20;

const SERIES = Object.freeze([
  {
    id: "DP.DOD.DECT.CR.GG.Z1",
    concept: "GENERAL_GOVERNMENT_GROSS_DEBT_PCT_GDP",
    expected_label:
      "Gross PSD, General Gov., All maturities, All instruments, Nominal Value, % of GDP",
    production_role:
      "PREFERRED_SOURCE_SPECIFIC_GENERAL_GOVERNMENT_FISCAL_CANDIDATE",
  },
  {
    id: "DP.DOD.DECT.CR.CG.Z1",
    concept: "CENTRAL_GOVERNMENT_GROSS_DEBT_PCT_GDP",
    expected_label:
      "Gross PSD, Central Gov., All maturities, All instruments, Nominal Value, % of GDP",
    production_role:
      "SOURCE_SPECIFIC_CENTRAL_GOVERNMENT_FISCAL_CANDIDATE",
  },
]);

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseQuarterEnd(value) {
  const match = /^(\d{4})Q([1-4])$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  return new Date(Date.UTC(year, quarter * 3, 0, 23, 59, 59, 999));
}

function ageDays(older, newer) {
  return Math.max(0, (newer.getTime() - older.getTime()) / 86_400_000);
}

function sorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function latestObservation(fields, quarterColumns) {
  for (let index = quarterColumns.length - 1; index >= 0; index -= 1) {
    const column = quarterColumns[index];
    const raw = String(fields[column.index] ?? "").trim();
    if (!raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const observedAt = parseQuarterEnd(column.period);
    if (!observedAt || observedAt > AS_OF) continue;
    return {
      period: column.period,
      observed_at: observedAt.toISOString(),
      age_days: ageDays(observedAt, AS_OF),
      value,
    };
  }
  return null;
}

function auditBulkCsv() {
  if (!fs.existsSync(BULK_CSV)) {
    throw new Error(`Official QPSD bulk CSV not found: ${BULK_CSV}`);
  }
  const bytes = fs.readFileSync(BULK_CSV);
  const text = bytes.toString("utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("QPSD bulk CSV is empty");

  const header = parseCsvLine(lines[0]);
  if (
    header[0] !== "Country Name" ||
    header[1] !== "Country Code" ||
    header[2] !== "Indicator Name" ||
    header[3] !== "Indicator Code"
  ) {
    throw new Error(`Unexpected QPSD bulk header: ${header.slice(0, 4).join(" | ")}`);
  }

  const quarterColumns = header
    .map((period, index) => ({ period, index }))
    .filter((item) => parseQuarterEnd(item.period));
  if (quarterColumns.length === 0) throw new Error("QPSD bulk CSV has no quarterly columns");

  const targetById = new Map(SERIES.map((series) => [series.id, series]));
  const observations = new Map(SERIES.map((series) => [series.id, []]));
  const datasetCountries = new Set();
  const observedLabels = new Map(SERIES.map((series) => [series.id, new Set()]));

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes("DP.DOD.DECT.CR.")) {
      const prefix = parseCsvLine(line.slice(0, Math.min(line.length, 512)));
      const maybeIso3 = String(prefix[1] ?? "").trim().toUpperCase();
      if (/^[A-Z]{3}$/.test(maybeIso3)) datasetCountries.add(maybeIso3);
      continue;
    }
    const fields = parseCsvLine(line);
    const countryName = String(fields[0] ?? "").trim();
    const iso3 = String(fields[1] ?? "").trim().toUpperCase();
    const label = String(fields[2] ?? "").trim();
    const seriesId = String(fields[3] ?? "").trim();
    if (/^[A-Z]{3}$/.test(iso3)) datasetCountries.add(iso3);
    const series = targetById.get(seriesId);
    if (!series || !/^[A-Z]{3}$/.test(iso3)) continue;
    observedLabels.get(seriesId).add(label);
    const latest = latestObservation(fields, quarterColumns);
    if (!latest) continue;
    observations.get(seriesId).push({
      iso3,
      country_name: countryName,
      ...latest,
    });
  }

  const results = SERIES.map((series) => {
    const labels = sorted(observedLabels.get(series.id));
    if (labels.length !== 1 || labels[0] !== series.expected_label) {
      throw new Error(
        `QPSD ${series.id} label mismatch: ${labels.join(" | ") || "none"}`,
      );
    }
    const latest = observations
      .get(series.id)
      .sort((a, b) => a.iso3.localeCompare(b.iso3));
    const fresh = latest.filter((row) => row.age_days <= MAX_AGE_DAYS);
    return {
      series_id: series.id,
      concept: series.concept,
      production_role: series.production_role,
      exact_label: series.expected_label,
      latest_non_null_country_count: latest.length,
      fresh_or_aging_country_count: fresh.length,
      latest_non_null_iso3: latest.map((row) => row.iso3),
      fresh_or_aging_iso3: fresh.map((row) => row.iso3),
      latest_period_distribution: latest.reduce((acc, row) => {
        acc[row.period] = (acc[row.period] ?? 0) + 1;
        return acc;
      }, {}),
      freshness_max_age_days: MAX_AGE_DAYS,
      fixed_peer_minimum: FIXED_PEER_MINIMUM,
      peer_universe_eligible: fresh.length >= FIXED_PEER_MINIMUM,
      fresh_or_aging_rows: fresh,
    };
  });

  return {
    file_sha256: sha256Buffer(bytes),
    file_size_bytes: bytes.length,
    row_count: lines.length - 1,
    quarterly_column_count: quarterColumns.length,
    first_quarter: quarterColumns[0].period,
    last_quarter: quarterColumns.at(-1).period,
    dataset_country_count: datasetCountries.size,
    dataset_iso3: sorted(datasetCountries),
    series: results,
  };
}

function main() {
  if (Number.isNaN(AS_OF.getTime())) {
    throw new Error("WORLD_BANK_QPSD_AS_OF must be a valid timestamp");
  }
  if (!Number.isFinite(MAX_AGE_DAYS) || MAX_AGE_DAYS <= 0) {
    throw new Error("WORLD_BANK_QPSD_MAX_AGE_DAYS must be positive");
  }

  const bulk = auditBulkCsv();
  const generalGovernment = bulk.series.find(
    (item) => item.concept === "GENERAL_GOVERNMENT_GROSS_DEBT_PCT_GDP",
  );
  const centralGovernment = bulk.series.find(
    (item) => item.concept === "CENTRAL_GOVERNMENT_GROSS_DEBT_PCT_GDP",
  );
  if (!generalGovernment || !centralGovernment) {
    throw new Error("QPSD bulk audit did not return both fiscal concepts");
  }

  const ggSet = new Set(generalGovernment.fresh_or_aging_iso3);
  const cgSet = new Set(centralGovernment.fresh_or_aging_iso3);
  const sourceSpecificUnion = sorted([...ggSet, ...cgSet]);
  const both = sorted([...ggSet].filter((iso3) => cgSet.has(iso3)));

  const report = {
    schema_version: "geomacro-world-bank-qpsd-sovereign-fiscal-coverage-2.0",
    generated_at: new Date().toISOString(),
    as_of: AS_OF.toISOString(),
    writes_performed: false,
    source: {
      provider: "World Bank",
      database: "Quarterly Public Sector Debt",
      transport: "official_databank_bulk_csv",
      bulk_download_url: "https://databank.worldbank.org/data/download/QPSD_CSV.zip",
      data_catalog_url:
        "https://datacatalog.worldbank.org/search/dataset/0037906/quarterly-public-sector-debt",
      exact_dataset_license: "CC BY 4.0",
      classification: "Public",
      rights_review_status: "EXACT_QPSD_DATASET_CC_BY_4_0_VERIFIED_FOR_CANDIDATE",
      rights_note:
        "The World Bank Data Catalog identifies QPSD as Public and licensed CC BY 4.0. Production activation remains separately gated on deterministic adapter, attribution, source-specific methodology and production census evidence.",
      bulk_file_sha256: bulk.file_sha256,
      bulk_file_size_bytes: bulk.file_size_bytes,
      bulk_row_count: bulk.row_count,
      first_quarter: bulk.first_quarter,
      last_quarter: bulk.last_quarter,
    },
    country_metadata: {
      qpsd_dataset_country_count: bulk.dataset_country_count,
      qpsd_dataset_iso3: bulk.dataset_iso3,
    },
    methodology_boundary: {
      discovery_only: true,
      current_wdi_metric: "central_government_debt_pct_gdp",
      current_eurostat_metric: "general_government_gross_debt_pct_gdp",
      qpsd_general_government_metric: "DP.DOD.DECT.CR.GG.Z1",
      qpsd_central_government_metric: "DP.DOD.DECT.CR.CG.Z1",
      raw_cross_source_value_pooling_allowed: false,
      cross_concept_peer_pooling_allowed: false,
      direct_production_fallback_allowed: false,
      source_specific_peer_universe_required: true,
      source_specific_hierarchy_candidate_allowed_after_shadow_proof: true,
      fixed_peer_minimum: FIXED_PEER_MINIMUM,
      fixed_peer_minimum_unchanged: true,
      freshness_thresholds_unchanged: true,
    },
    coverage_summary: {
      general_government_current_or_aging_country_count:
        generalGovernment.fresh_or_aging_country_count,
      central_government_current_or_aging_country_count:
        centralGovernment.fresh_or_aging_country_count,
      both_concepts_current_or_aging_count: both.length,
      general_government_only_count: sorted(
        [...ggSet].filter((iso3) => !cgSet.has(iso3)),
      ).length,
      central_government_only_count: sorted(
        [...cgSet].filter((iso3) => !ggSet.has(iso3)),
      ).length,
      source_specific_union_country_count: sourceSpecificUnion.length,
      source_specific_union_iso3: sourceSpecificUnion,
      general_government_peer_universe_eligible:
        generalGovernment.peer_universe_eligible,
      central_government_peer_universe_eligible:
        centralGovernment.peer_universe_eligible,
      target_100_country_path_plausible_from_qpsd_source_specific_hierarchy:
        sourceSpecificUnion.length >= 100 &&
        generalGovernment.peer_universe_eligible &&
        centralGovernment.peer_universe_eligible,
      production_supported_country_count_added: 0,
    },
    activation_boundary: {
      production_activation_allowed: false,
      source_registry_changed: false,
      scoring_changed: false,
      country_payability_changed: false,
      next_required_proof:
        "Map the QPSD source-specific union against the authoritative Geomacro sovereign registry, build a deterministic observation adapter, run separate general-government and central-government shadow peer universes, verify attribution/provenance hashes, then run the full production country census before promotion.",
    },
    series: bulk.series,
  };

  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        generated_at: report.generated_at,
        source: {
          transport: report.source.transport,
          exact_dataset_license: report.source.exact_dataset_license,
          bulk_file_sha256: report.source.bulk_file_sha256,
          last_quarter: report.source.last_quarter,
        },
        coverage_summary: report.coverage_summary,
        activation_boundary: report.activation_boundary,
      },
      null,
      2,
    ),
  );
  console.log("PASS: WORLD BANK QPSD FISCAL COVERAGE AUDIT COMPLETE - NO WRITES");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
}
