import {getJson,observation} from "./http.mjs";

const DATAMAPPER_BASE = "https://www.imf.org/external/datamapper/api/v2";

function authHeaders() {
  return process.env.IMF_API_TOKEN
    ? { Authorization: `Bearer ${process.env.IMF_API_TOKEN}` }
    : {};
}

function rowsFromDataMapper(payload, indicator, countryIso3, periods) {
  const series = payload?.values?.[indicator];
  if (!series) return [];

  const wanted = periods ? new Set(periods.map(String)) : null;
  const country = String(countryIso3).toUpperCase();

  return Object.entries(series)
    .filter(([iso, values]) => iso === country && values && typeof values === "object")
    .flatMap(([, values]) =>
      Object.entries(values)
        .filter(([period, value]) => value !== null && value !== undefined && (!wanted || wanted.has(String(period))))
        .map(([period, value]) => ({ period, value }))
    );
}

export async function fetchImfDataMapper({
  indicator = "NGDP_RPCH",
  countryIso3,
  periods = null
} = {}) {
  if (!countryIso3) throw new Error("countryIso3 is required");

  const path = periods?.length
    ? `/${indicator}/${countryIso3.toUpperCase()}?periods=${encodeURIComponent(periods.join(","))}`
    : `/${indicator}/${countryIso3.toUpperCase()}`;

  const url = DATAMAPPER_BASE + path;
  const data = await getJson(url, {headers: authHeaders()});
  const rows = rowsFromDataMapper(data, indicator, countryIso3, periods);

  return rows.map(r => observation({
    sourceId: "imf_sdmx",
    category: "MACRO",
    countryIso3: countryIso3.toUpperCase(),
    publishedAt: r.period ? `${r.period}-12-31T00:00:00Z` : null,
    title: `IMF ${indicator} ${r.period}`,
    summary: JSON.stringify({
      indicator,
      period: r.period,
      value: r.value,
      source: "IMF DataMapper v2"
    }),
    url,
    confidence: 0.8
  }));
}

export async function fetchImfDataMapperCatalog() {
  const [indicators, countries, regions, groups] = await Promise.all([
    getJson(`${DATAMAPPER_BASE}/indicators`, {headers: authHeaders()}),
    getJson(`${DATAMAPPER_BASE}/countries`, {headers: authHeaders()}),
    getJson(`${DATAMAPPER_BASE}/regions`, {headers: authHeaders()}),
    getJson(`${DATAMAPPER_BASE}/groups`, {headers: authHeaders()})
  ]);

  return {
    indicators: indicators?.indicators ?? indicators,
    countries: countries?.countries ?? countries,
    regions: regions?.regions ?? regions,
    groups: groups?.groups ?? groups
  };
}

/*
 * SDMX Central structure discovery remains available for datasets that
 * require richer dimensions than DataMapper exposes.
 */
export async function fetchImfSdmxStructure({
  resource = "dataflow",
  agency = "IMF",
  id = "all",
  version = "latest"
} = {}) {
  const url = `https://sdmxcentral.imf.org/sdmx/v2/structure/${resource}/${agency}/${id}/${version}/?format=sdmx-3.0`;
  return getJson(url, {headers: authHeaders()});
}
