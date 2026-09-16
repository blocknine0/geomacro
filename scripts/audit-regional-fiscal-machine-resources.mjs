import fs from "node:fs";
import { createHash } from "node:crypto";

const OUTPUT = process.env.REGIONAL_FISCAL_RESOURCE_OUTPUT ?? "regional-fiscal-machine-resources.json";
const MAX_BYTES = 30 * 1024 * 1024;

const RESOURCES = Object.freeze([
  {
    source_id: "idb_lac_standardized_public_debt_2024",
    resource_id: "idb_ckan_package",
    kind: "json",
    url: "https://data.iadb.org/api/3/action/package_show?id=e54bfa5e-8f42-453e-88a0-cfc3e22f703c",
    expected_rights: "CC BY 4.0",
    expected_scope: "26 Latin America and Caribbean countries",
  },
  {
    source_id: "idb_lac_standardized_public_debt_2024",
    resource_id: "idb_csv",
    kind: "csv",
    url: "https://data.iadb.org/file/download/b10c3d33-ca6c-4ee8-992a-f3309884912f",
    expected_rights: "CC BY 4.0",
    expected_scope: "26 Latin America and Caribbean countries",
  },
  {
    source_id: "adb_basic_statistics_2026",
    resource_id: "adb_jsonapi_metadata",
    kind: "json",
    url: "https://data.adb.org/jsonapi/node/dataset/2ff0cf00-0b89-40ec-88fd-8e87f133999d",
    expected_rights: "CC BY 3.0 IGO unless otherwise indicated",
    expected_scope: "47 Asia-Pacific economies",
  },
  {
    source_id: "adb_basic_statistics_2026",
    resource_id: "adb_csv",
    kind: "csv",
    url: "https://data.adb.org/media/15086/download",
    expected_rights: "CC BY 3.0 IGO unless otherwise indicated",
    expected_scope: "47 Asia-Pacific economies",
  },
]);

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

function splitCsvLine(line, delimiter) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  cells.push(value.trim());
  return cells;
}

function detectDelimiter(header) {
  const candidates = [",", ";", "\t"];
  return candidates
    .map((delimiter) => ({ delimiter, count: splitCsvLine(header, delimiter).length }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ",";
}

function normalizeHeader(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function analyzeCsv(buffer) {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) throw new Error("empty CSV resource");
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter);
  const normalizedHeaders = headers.map(normalizeHeader);
  const countryColumnIndexes = normalizedHeaders
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => /(country|economy|economies|member|iso3|economy_code|country_code)/.test(header));

  const uniqueCountryValues = new Map();
  for (const { header, index } of countryColumnIndexes) uniqueCountryValues.set(header, new Set());

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, delimiter);
    for (const { header, index } of countryColumnIndexes) {
      const value = String(cells[index] ?? "").trim();
      if (value && value.length <= 120) uniqueCountryValues.get(header).add(value);
    }
  }

  return {
    delimiter: delimiter === "\t" ? "TAB" : delimiter,
    row_count_excluding_header: Math.max(0, lines.length - 1),
    column_count: headers.length,
    headers: headers.slice(0, 100),
    country_candidate_columns: [...uniqueCountryValues.entries()].map(([column, values]) => ({
      column,
      unique_count: values.size,
      sample_values: [...values].slice(0, 30),
    })),
    first_data_rows: lines.slice(1, 4).map((line) => splitCsvLine(line, delimiter).slice(0, 30)),
  };
}

function summarizeJson(parsed) {
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const object = parsed;
    const topLevelKeys = Object.keys(object).sort();
    const result = object.result && typeof object.result === "object" ? object.result : null;
    const data = object.data && typeof object.data === "object" ? object.data : null;
    return {
      top_level_keys: topLevelKeys,
      ckan_success: typeof object.success === "boolean" ? object.success : null,
      result_keys: result ? Object.keys(result).sort().slice(0, 100) : [],
      result_title: result && typeof result.title === "string" ? result.title : null,
      result_license: result && typeof result.license_title === "string" ? result.license_title : null,
      result_resource_count: result && Array.isArray(result.resources) ? result.resources.length : null,
      result_resources: result && Array.isArray(result.resources)
        ? result.resources.slice(0, 30).map((resource) => ({
            id: resource?.id ?? null,
            name: resource?.name ?? null,
            format: resource?.format ?? null,
            url: resource?.url ?? null,
            mimetype: resource?.mimetype ?? null,
          }))
        : [],
      jsonapi_type: data && typeof data.type === "string" ? data.type : null,
      jsonapi_id: data && typeof data.id === "string" ? data.id : null,
      jsonapi_attribute_keys: data && data.attributes && typeof data.attributes === "object"
        ? Object.keys(data.attributes).sort().slice(0, 150)
        : [],
      jsonapi_relationship_keys: data && data.relationships && typeof data.relationships === "object"
        ? Object.keys(data.relationships).sort().slice(0, 150)
        : [],
    };
  }
  return {
    top_level_type: Array.isArray(parsed) ? "array" : typeof parsed,
    array_length: Array.isArray(parsed) ? parsed.length : null,
  };
}

async function fetchResource(resource) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(resource.url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: resource.kind === "json" ? "application/json,application/vnd.api+json;q=0.9,*/*;q=0.5" : "text/csv,text/plain;q=0.9,*/*;q=0.5",
        "user-agent": "Geomacro-Regional-Fiscal-Resource-Audit/1.0 (+https://geomacro.live)",
      },
    });
    if (!response.ok) {
      return {
        ...resource,
        reachable: false,
        http_status: response.status,
        final_url: response.url,
        error: `HTTP ${response.status}`,
      };
    }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) throw new Error(`resource exceeds ${MAX_BYTES} byte audit limit`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.byteLength > MAX_BYTES) throw new Error(`resource exceeds ${MAX_BYTES} byte audit limit`);

    const base = {
      ...resource,
      reachable: true,
      http_status: response.status,
      final_url: response.url,
      byte_length: buffer.byteLength,
      response_sha256: sha256(buffer),
      content_type: response.headers.get("content-type"),
      content_disposition: response.headers.get("content-disposition"),
    };

    if (resource.kind === "csv") {
      return { ...base, csv: analyzeCsv(buffer) };
    }

    let parsed;
    try {
      parsed = JSON.parse(buffer.toString("utf8"));
    } catch (error) {
      return { ...base, json_parse_ok: false, parse_error: error instanceof Error ? error.message : String(error), preview: buffer.toString("utf8", 0, 500) };
    }
    return { ...base, json_parse_ok: true, json: summarizeJson(parsed) };
  } catch (error) {
    return {
      ...resource,
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const results = [];
  for (const resource of RESOURCES) results.push(await fetchResource(resource));
  const report = {
    schema_version: "geomacro-regional-fiscal-machine-resource-audit-1.0",
    generated_at: new Date().toISOString(),
    writes_performed: false,
    source_activation_allowed: false,
    scoring_changed: false,
    country_payability_changed: false,
    results,
    summary: {
      resource_count: results.length,
      reachable_count: results.filter((row) => row.reachable).length,
      unreachable_count: results.filter((row) => !row.reachable).length,
      machine_parseable_count: results.filter((row) => row.reachable && (row.csv || row.json_parse_ok)).length,
    },
    claim_boundary: {
      reachability_is_not_rights_approval: true,
      metadata_is_not_scoring_activation: true,
      raw_cross_concept_pooling_allowed: false,
      raw_cross_source_pooling_allowed: false,
      production_supported_country_count_added: 0,
    },
  };
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ summary: report.summary, results: report.results.map(({ source_id, resource_id, reachable, http_status, byte_length, content_type, csv, json }) => ({ source_id, resource_id, reachable, http_status, byte_length, content_type, csv: csv ? { row_count_excluding_header: csv.row_count_excluding_header, column_count: csv.column_count, headers: csv.headers, country_candidate_columns: csv.country_candidate_columns } : null, json })) }, null, 2));
  console.log(`REGIONAL_FISCAL_RESOURCE_OUTPUT=${OUTPUT}`);
  console.log("PASS: REGIONAL FISCAL MACHINE RESOURCE AUDIT COMPLETE - NO WRITES");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
