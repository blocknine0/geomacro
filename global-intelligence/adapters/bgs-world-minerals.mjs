const DEFAULT_BASE_URL = "https://ogcapi.bgs.ac.uk";
const DEFAULT_COLLECTION = "world-mineral-statistics";

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function nativeYear(value){
  // BGS OGC native year may be "2024-01-01 00:00:00"; this is a
  // reference YEAR, never original publication day.
  const s=String(value??"").trim();
  const match=s.match(/^((?:19|20)\d{2})(?:-01-01(?:[ T]00:00:00(?:\.0+)?)?)?$/u);
  return match?Number(match[1]):null;
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
  const year = nativeYear(first(p, ["year", "Year"]));
  const country = first(p, ["country_trans", "country", "Country", "country_name", "country_iso3_code", "country_iso2_code"]);
  const commodity = first(p, ["bgs_commodity_trans", "bgs_sub_commodity_trans", "commodity", "Commodity", "sub_commodity", "subCommodity"]);
  const statisticType = first(p, ["bgs_statistic_type_trans", "statistic_type", "statisticType", "statistic", "Statistic type", "statistic type"]);
  const quantity = toNumber(first(p, ["quantity", "Quantity", "value", "Value", "amount"]));
  const unit = first(p, ["units", "unit", "Unit", "unit_of_measure"]);
  return {
    source_id: "bgs_world_minerals_statistics",
    evidence_type: normalizeStatistic(statisticType),
    country,
    country_iso3: /^[A-Z]{3}$/u.test(String(first(p, ["country_iso3_code"]) ?? "")) ? String(p.country_iso3_code) : null,
    native_publication_at: null,
    historical_reference_only: true,
    commodity,
    sub_commodity:first(p,["bgs_sub_commodity_trans"]),
    year,
    value: quantity,
    native_data_precision: first(p,["data_precision_description"]),
    native_sdmx_translation: first(p,["sdmx_translation"]),
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
  limit = 100,
  fetchImpl = fetch
} = {}) {
  const origin=new URL(baseUrl);
  if(origin.protocol!=="https:"||origin.hostname!=="ogcapi.bgs.ac.uk"||
     origin.port||origin.username||origin.password||origin.search||origin.hash||
     origin.pathname!=="/" || collection!=="world-mineral-statistics")
    throw Error("BGS_SOURCE_SCOPE_UNVERIFIED");
  if(!Number.isSafeInteger(limit)||limit<1||limit>1000)
    throw Error("BGS_LIMIT_INVALID");
  const url = new URL(origin.origin+"/collections/world-mineral-statistics/items");
  url.searchParams.set("f", "json");
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 1000)));
  url.searchParams.set("sortby","-year");
  if (country) url.searchParams.set("filter", `country = '${String(country).replaceAll("'", "''")}'`);
  const response = await fetchImpl(url,{redirect:"error",signal:AbortSignal.timeout(15000),
    headers:{accept:"application/json"}});
  if (!response.ok) {
    await response.body?.cancel().catch(()=>undefined);
    throw new Error("BGS_HTTP_"+response.status);
  }
  const maxBytes=1024*1024;
  if(Number(response.headers.get("content-length")??0)>maxBytes||!response.body)
    throw Error("BGS_BODY_UNVERIFIED");
  const reader=response.body.getReader(), chunks=[];let size=0;
  try {
    for(;;){
      const next=await reader.read();if(next.done)break;
      size+=next.value.byteLength;if(size>maxBytes)throw Error("BGS_BODY_UNVERIFIED");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(()=>undefined);
    reader.releaseLock();
  }
  const bytes=new Uint8Array(size);let pos=0;
  for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.byteLength;}
  let body;try{body=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}
  catch{throw Error("BGS_JSON_UNVERIFIED");}
  if(body?.type!=="FeatureCollection"||!Array.isArray(body.features))
    throw Error("BGS_FEATURE_COLLECTION_UNVERIFIED");
  const features = Array.isArray(body?.features) ? body.features : [];
  let rows = features.map(normalizeBgsWorldMineralsFeature);
  if (commodity) rows = rows.filter((r) => String(r.commodity ?? "").toLowerCase() === String(commodity).toLowerCase());
  if (yearFrom !== undefined) rows = rows.filter((r) => r.year !== null && r.year >= Number(yearFrom));
  if (yearTo !== undefined) rows = rows.filter((r) => r.year !== null && r.year <= Number(yearTo));
  return {
    source_id: "bgs_world_minerals_statistics",
    endpoint: url.toString(),
    fetched_at: new Date().toISOString(),
    rows,
    count: rows.length,
    commercial_terms_review_required: true,
    native_current_publication_proven: false,
    country_iso3_certified: false,
    raw_customer_distribution_allowed: false
  };
}
