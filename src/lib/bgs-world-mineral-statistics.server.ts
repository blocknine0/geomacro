import { fetchWithoutRedirectUsing } from "./fetch-without-redirect";

const ITEMS_URL = "https://ogcapi.bgs.ac.uk/collections/world-mineral-statistics/items";
const MAX_RESPONSE_BYTES = 192 * 1024;
const MAX_ROWS = 100;
const MIN_YEAR = 1970;
const MAX_YEAR = 2022;
const MINERALS = new Set(["lithium", "cobalt", "nickel", "graphite", "copper", "rare earth"]);

export type BgsMineralHistory = Readonly<{
  schema: "geomacro.mineral-production-history.v1";
  status: "HISTORICAL_DATA_DERIVED";
  country_iso3: string;
  commodity: string;
  observation_period: Readonly<{ first_year: number; latest_year: number }>;
  series: readonly Readonly<{
    sub_commodity: string | null;
    unit: string;
    latest: Readonly<{ year: number; value: number }>;
    previous: Readonly<{ year: number; value: number }> | null;
    absolute_change: number | null;
    percentage_change: number | null;
    direction: "up" | "down" | "unchanged" | "insufficient_history";
  }>[];
  source: Readonly<{
    publisher: "British Geological Survey";
    dataset: "World Mineral Statistics";
    reference_url: "https://www.bgs.ac.uk/mineralsuk/statistics/world-mineral-statistics/world-mineral-statistics-data-download/";
    source_observation_year_max: 2022;
  }>;
  delivery: Readonly<{
    raw_upstream_delivered: false;
    raw_response_persisted: false;
    source_claim_independently_verified: false;
    commercial_rights_verified: false;
    signed: false;
    chargeable: false;
  }>;
  limitations: readonly string[];
}>;

type BgsRawFeature = Readonly<{
  properties?: Record<string, unknown>;
}>;

function cleanString(value: unknown, max = 120): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/gu, " ").trim();
  return text.length > 0 && text.length <= max ? text : null;
}

function safeNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e18) return null;
  return value;
}

export function buildBgsWorldMineralStatisticsUrl(countryIso3: string, mineral: string): URL | null {
  const country = String(countryIso3 ?? "").toUpperCase();
  const normalizedMineral = String(mineral ?? "").trim().toLowerCase();
  if (!/^[A-Z]{3}$/u.test(country) || !MINERALS.has(normalizedMineral)) return null;

  const commodity = normalizedMineral === "rare earth" ? "Rare earth" :
    normalizedMineral[0].toUpperCase() + normalizedMineral.slice(1);
  const url = new URL(ITEMS_URL);
  url.searchParams.set("f", "json");
  url.searchParams.set("limit", String(MAX_ROWS));
  url.searchParams.set("sortby", "-year");
  url.searchParams.set("properties", [
    "year", "country_iso3_code", "erml_commodity", "bgs_statistic_type_trans",
    "bgs_sub_commodity_trans", "quantity", "units",
  ].join(","));
  // Only the ISO3 code and one fixed, validated commodity can enter this
  // CQL filter. Free-form user text never reaches the publisher.
  url.searchParams.set("filter", `country_iso3_code = ${country} AND erml_commodity LIKE '%${commodity}%'`);
  return url;
}

export function deriveBgsMineralProductionHistory(
  payload: unknown,
  countryIso3: string,
  mineral: string,
): BgsMineralHistory | null {
  const country = String(countryIso3 ?? "").toUpperCase();
  const normalizedMineral = String(mineral ?? "").trim().toLowerCase();
  if (!/^[A-Z]{3}$/u.test(country) || !MINERALS.has(normalizedMineral) ||
      !payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const root = payload as Record<string, unknown>;
  if (!Array.isArray(root.features) || root.features.length > MAX_ROWS) return null;

  const commodityNeedle = normalizedMineral === "rare earth" ? "rare earth" : normalizedMineral;
  const groups = new Map<string, { sub: string | null; unit: string; rows: Map<number, number> }>();
  for (const feature of root.features as BgsRawFeature[]) {
    const props = feature?.properties;
    if (!props || typeof props !== "object" || Array.isArray(props)) continue;
    const rowCountry = cleanString(props.country_iso3_code, 3)?.toUpperCase();
    const rowCommodity = cleanString(props.erml_commodity, 100)?.toLowerCase();
    const statistic = cleanString(props.bgs_statistic_type_trans, 100)?.toLowerCase() ?? "";
    const yearValue = typeof props.year === "number" && Number.isInteger(props.year)
      ? String(props.year) : typeof props.year === "string" ? props.year.trim() : "";
    // BGS serializes its source-native year date as e.g.
    // "2022-01-01 00:00:00"; accept the year-only form used by older clients too.
    const yearMatch = /^(\d{4})(?:-01-01(?:[ T]00:00:00(?:\.0+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?)?$/u.exec(yearValue);
    const year = yearMatch ? Number(yearMatch[1]) : NaN;
    const quantity = safeNumber(props.quantity);
    const unit = cleanString(props.units, 40);
    const sub = cleanString(props.bgs_sub_commodity_trans, 100);
    if (rowCountry !== country || !rowCommodity?.includes(commodityNeedle) ||
        !statistic.includes("production") || !Number.isInteger(year) ||
        year < MIN_YEAR || year > MAX_YEAR || quantity === null || !unit) continue;
    const key = `${sub?.toLowerCase() ?? ""}\n${unit.toLowerCase()}`;
    const group = groups.get(key) ?? { sub, unit, rows: new Map<number, number>() };
    // Duplicate table lines are not summed: retain a single source-native
    // value for each year/series and never combine unlike units.
    if (!group.rows.has(year)) group.rows.set(year, quantity);
    groups.set(key, group);
  }

  const series = [...groups.values()].map(group => {
    const rows = [...group.rows.entries()].sort((a, b) => b[0] - a[0]);
    const [latestYear, latestValue] = rows[0] ?? [];
    const [previousYear, previousValue] = rows[1] ?? [];
    if (typeof latestYear !== "number" || !Number.isInteger(latestYear) || typeof latestValue !== "number") return null;
    const previous = typeof previousYear === "number" && Number.isInteger(previousYear) && typeof previousValue === "number"
      ? { year: previousYear, value: previousValue } : null;
    const absoluteChange = previous ? latestValue - previous.value : null;
    const percentageChange = previous && previous.value !== 0
      ? ((latestValue - previous.value) / Math.abs(previous.value)) * 100 : null;
    return {
      sub_commodity: group.sub,
      unit: group.unit,
      latest: { year: latestYear, value: latestValue },
      previous,
      absolute_change: absoluteChange,
      percentage_change: percentageChange,
      direction: !previous ? "insufficient_history" as const :
        latestValue > previous.value ? "up" as const :
        latestValue < previous.value ? "down" as const : "unchanged" as const,
    };
  }).filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => b.latest.year - a.latest.year || (a.sub_commodity ?? "").localeCompare(b.sub_commodity ?? ""))
    .slice(0, 3);
  if (!series.length) return null;

  const years = series.flatMap(item => [item.latest.year, ...(item.previous ? [item.previous.year] : [])]);
  return {
    schema: "geomacro.mineral-production-history.v1",
    status: "HISTORICAL_DATA_DERIVED",
    country_iso3: country,
    commodity: normalizedMineral,
    observation_period: { first_year: Math.min(...years), latest_year: Math.max(...years) },
    series,
    source: {
      publisher: "British Geological Survey",
      dataset: "World Mineral Statistics",
      reference_url: "https://www.bgs.ac.uk/mineralsuk/statistics/world-mineral-statistics/world-mineral-statistics-data-download/",
      source_observation_year_max: 2022,
    },
    delivery: {
      raw_upstream_delivered: false,
      raw_response_persisted: false,
      source_claim_independently_verified: false,
      commercial_rights_verified: false,
      signed: false,
      chargeable: false,
    },
    limitations: [
      "Annual historical production series; this is not live supply, current news or a forecast.",
      "BGS API archive covers observations through 2022; missing country/commodity rows mean no observation was returned.",
      "Values are summarized into latest-versus-prior-year metrics; raw publisher payload and full rows are not returned or retained.",
    ],
  };
}

export async function fetchBgsMineralProductionHistory(
  countryIso3: string,
  mineral: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BgsMineralHistory | null> {
  const url = buildBgsWorldMineralStatisticsUrl(countryIso3, mineral);
  if (!url) return null;
  const response = await fetchWithoutRedirectUsing(fetchImpl, url, {
    method: "GET",
    headers: { Accept: "application/geo+json, application/json;q=0.9" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    if (response.status === 429) throw Error("ON_DEMAND_SOURCE_RATE_LIMITED");
    if (response.status === 401 || response.status === 403) throw Error("ON_DEMAND_SOURCE_ACCESS_RESTRICTED");
    throw Error(response.status >= 500 ? "ON_DEMAND_SOURCE_TRANSIENT_HTTP" : "ON_DEMAND_SOURCE_UNAVAILABLE");
  }
  if (!/^application\/(?:geo\+json|json)(?:;|$)/iu.test(response.headers.get("content-type") ?? ""))
    throw Error("ON_DEMAND_SOURCE_INVALID_CONTENT_TYPE");
  if (Number(response.headers.get("content-length") || 0) > MAX_RESPONSE_BYTES)
    throw Error("ON_DEMAND_SOURCE_RESPONSE_OVERSIZED");
  if (!response.body) throw Error("ON_DEMAND_SOURCE_RESPONSE_EMPTY");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw Error("ON_DEMAND_SOURCE_RESPONSE_OVERSIZED");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = Buffer.concat(chunks).toString("utf8");
  let payload: unknown;
  try { payload = JSON.parse(body); } catch { throw Error("ON_DEMAND_SOURCE_INVALID_JSON"); }
  return deriveBgsMineralProductionHistory(payload, countryIso3, mineral);
}

