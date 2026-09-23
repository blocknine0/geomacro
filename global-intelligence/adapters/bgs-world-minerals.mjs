const DEFAULT_BASE_URL = "https://ogcapi.bgs.ac.uk";
const DEFAULT_COLLECTION = "world-mineral-statistics";

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function first(obj, keys) {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj?.[key] !== null && obj?.[key] !== "") return obj[key];
  }
  return null;
}

function normalizeStatistic(value) {
  const s = String(value ?? "").toLowerCase();
  if (s.includes("production")) return "PRODUCTION";
  if (s.includes("import")) return "TRADE_IMPORT";
  if (s.includes("export")) return "TRADE_EXPORT";
  return String(value ?? "UNKNOWN").toUpperCase();
}

export function normalizeBgsWorldMineralsFeature(feature) {
  const p = feature?.properties ?? feature ?? {};
  const year = toNumber(first(p, ["year", "Year"]));
  const country = first(p, ["country", "Country", "country_name"]);
  const commodity = first(p, ["commodity", "Commodity", "sub_commodity", "subCommodity"]);
  const statisticType = first(p, ["statistic_type", "statisticType", "statistic", "Statistic type"]);
  const quantity = toNumber(first(p, ["quantity", "Quantity", "value", "Value", "amount"]));
  const unit = first(p, ["unit", "Unit", "unit_of_measure"]);
  return {
    source_id: "bgs_world_minerals_statistics",
    evidence_type: normalizeStatistic(statisticType),
    country,
    commodity,
    year,
    value: quantity,
    unit,
    source_feature_id: feature?.id ?? null,
    source_url: feature?.links?.find?.((x) => x.rel === "self")?.href ?? null,
    raw_statistic_type: statisticType
  };
}

export async function fetchBgsWorldMinerals({
  baseUrl = process.env.BGS_OGCAPI_BASE_URL ?? DEFAULT_BASE_URL,
  collection = process.env.BGS_MINERALS_COLLECTION ?? DEFAULT_COLLECTION,
  country,
  commodity,
  yearFrom,
  yearTo,
  limit = 100
} = {}) {
  const url = new URL(`${baseUrl}/collections/${encodeURIComponent(collection)}/items`);
  url.searchParams.set("f", "json");
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 1000)));
  if (country) url.searchParams.set("filter", `country = '${String(country).replaceAll("'", "''")}'`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`BGS World Mineral Statistics HTTP ${response.status}`);
  }
  const body = await response.json();
  const features = Array.isArray(body?.features) ? body.features : [];
  let rows = features.map(normalizeBgsWorldMineralsFeature);
  if (commodity) rows = rows.filter((r) => String(r.commodity ?? "").toLowerCase() === String(commodity).toLowerCase());
  if (yearFrom !== undefined) rows = rows.filter((r) => r.year === null || r.year >= Number(yearFrom));
  if (yearTo !== undefined) rows = rows.filter((r) => r.year === null || r.year <= Number(yearTo));
  return {
    source_id: "bgs_world_minerals_statistics",
    endpoint: url.toString(),
    fetched_at: new Date().toISOString(),
    rows,
    count: rows.length,
    commercial_terms_review_required: true
  };
}
