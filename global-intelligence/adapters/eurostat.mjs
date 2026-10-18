import {getJson, observation} from "./http.mjs";

const API_BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";

const ISO3_TO_EUROSTAT_GEO = {
  AUT:"AT", BEL:"BE", BGR:"BG", HRV:"HR", CYP:"CY", CZE:"CZ", DNK:"DK",
  EST:"EE", FIN:"FI", FRA:"FR", DEU:"DE", GRC:"EL", HUN:"HU", IRL:"IE",
  ITA:"IT", LVA:"LV", LTU:"LT", LUX:"LU", MLT:"MT", NLD:"NL", POL:"PL",
  PRT:"PT", ROU:"RO", SVK:"SK", SVN:"SI", ESP:"ES", SWE:"SE", ISL:"IS",
  LIE:"LI", NOR:"NO", CHE:"CH", GBR:"UK", TUR:"TR", SRB:"RS", MNE:"ME",
  MKD:"MK", ALB:"AL", BIH:"BA", XKX:"XK", GEO:"GE", UKR:"UA", MDA:"MD"
};

function dimensionValues(dimension) {
  const index = dimension?.category?.index;
  const label = dimension?.category?.label || {};
  if (!index) return [];
  const ordered = Array.isArray(index)
    ? index.map((code, position) => [position, code])
    : Object.entries(index).map(([code, position]) => [position, code]);
  return ordered.sort((a,b) => a[0]-b[0])
    .map(([, code]) => ({code, label: label[code] || code}));
}

function decodeJsonStat(data) {
  if (!data || data.version !== "2.0" || !Array.isArray(data.id) || !Array.isArray(data.size) || !data.dimension) {
    throw new Error("Unsupported or incomplete Eurostat JSON-stat response");
  }
  const dims = data.id.map(id => ({id, values: dimensionValues(data.dimension[id])}));
  if(data.id.length!==data.size.length || data.size.some(n=>!Number.isSafeInteger(n)||n<1) ||
    data.id.some((id,i)=>dims[i].values.length!==data.size[i]))
    throw Error("EUROSTAT_DIMENSION_INVALID");
  const total = data.size.reduce((a,b) => a*b, 1);
  if(!Number.isSafeInteger(total)||total>25000)throw Error("EUROSTAT_DATASET_TOO_LARGE");
  const values = Array.isArray(data.value)
    ? data.value
    : Array.from({length: total}, (_, i) => data.value?.[String(i)] ?? null);
  const rows = [];
  for (let flat=0; flat<total; flat++) {
    let remainder = flat;
    const coord = new Array(dims.length);
    for (let d=dims.length-1; d>=0; d--) {
      const pos = remainder % data.size[d];
      remainder = Math.floor(remainder / data.size[d]);
      coord[d] = dims[d].values[pos];
    }
    const value = values[flat] ?? null;
    if (value === null || value === undefined) continue;
    const row = {value};
    coord.forEach((entry,i) => {
      row[dims[i].id] = entry.code;
      row[dims[i].id + "_label"] = entry.label;
    });
    rows.push(row);
  }
  return rows;
}

function buildUrl(datasetCode, {countryIso3, filters={}, startPeriod, endPeriod, lang="en"}={}) {
  const params = new URLSearchParams();
  const geo = countryIso3 ? ISO3_TO_EUROSTAT_GEO[String(countryIso3).toUpperCase()] : null;
  if (geo) params.append("geo", geo);
  for (const [key,value] of Object.entries(filters || {})) {
    if (value === undefined || value === null || value === "") continue;
    for (const item of (Array.isArray(value) ? value : [value])) params.append(key, item);
  }
  if (startPeriod) params.set("startPeriod", startPeriod);
  if (endPeriod) params.set("endPeriod", endPeriod);
  params.set("lang", lang);
  const query = params.toString();
  return API_BASE + "/" + encodeURIComponent(datasetCode) + (query ? "?" + query : "");
}

export function eurostatGeoForCountry(countryIso3) {
  return ISO3_TO_EUROSTAT_GEO[String(countryIso3 || "").toUpperCase()] || null;
}

export async function fetchEurostatDataset(datasetCode, options={}) {
  if (!datasetCode) throw new Error("datasetCode is required");
  const url = buildUrl(datasetCode, options);
  const data = await getJson(url);
  return {
    source: "eurostat",
    dataset_code: datasetCode,
    country_iso3: String(options.countryIso3 || "").toUpperCase() || null,
    eurostat_geo: eurostatGeoForCountry(options.countryIso3),
    url,
    rows: decodeJsonStat(data),
    dimensions: data.id,
    size: data.size,
    source_updated: data.updated || null
  };
}

export async function fetchEurostat(url, countryIso3) {
  const data = await getJson(url);
  const expectedGeo=eurostatGeoForCountry(countryIso3);
  if(!expectedGeo)return [];
  // An unfiltered API response must not attribute other geographies to this ISO3.
  return decodeJsonStat(data).filter(row=>row.geo===expectedGeo).map(row => observation({
    sourceId: "eurostat",
    category: "MACRO",
    countryIso3,
    // Statistical time period does not certify a publisher's news-release clock.
    publishedAt: null,
    title: "Eurostat " + (row.indic || "dataset"),
    summary: JSON.stringify({
      value:row.value, unit:row.unit || null, freq:row.freq || null,
      geo:row.geo, reference_period:row.time ?? row.TIME_PERIOD ?? null,
      dataset_updated_at:data.updated ?? null, historical_reference_only:true,
      native_original_publication_proven:false
    }),
    url,
    confidence: 0.7,
    raw: row
  }));
}
