import {GLOBAL_OFFICIAL_RELEASE_FEEDS} from "./global-official-release-feeds.mjs";
import {GDELT_PUBLIC_BATCH_MANIFEST,parseGdeltBatchManifest} from "./gdelt-free-batch-manifest.mjs";
import { SOURCE_LINEUP_BY_ID } from "./operator-commercial-free-source-lineup.mjs";

/**
 * Curated production transport candidates requiring no credit card/token.
 * GET-only. A transport proof does not imply native publisher event freshness,
 * licence approval, same-event corroboration, signature or paid deliverability.
 * Other catalogued sources remain in rights/access review.
 */
const SPECS = [
  {
    id: "usgs_earthquakes", category: "geopolitics",
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
    format: "json", maxBytes: 400_000, nature: "physical-hazard-not-conflict",
  },
  {
    id: "cisa_kev", category: "geopolitics",
    url: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    format: "json", maxBytes: 3_000_000, nature: "security-advisory-not-event-proof",
  },
  {
    id: "bls", category: "macro",
    url: "https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0",
    format: "json", maxBytes: 100_000, nature: "statistical-period-not-publication-time",
  },
  {
    id: "world_bank_wdi", category: "macro",
    url: "https://api.worldbank.org/v2/country/USA/indicator/NY.GDP.MKTP.CD?format=json&source=2&per_page=1&mrnev=1",
    format: "json", maxBytes: 100_000, nature: "annual-reference-period-not-event",
  },
  {
    id: "treasury_fiscaldata", category: "macro",
    url: "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?page%5Bsize%5D=1&sort=-record_date",
    format: "json", maxBytes: 120_000, nature: "monthly-reference-period-not-event",
  },
  {
    id: "usgs_mcs", category: "rare_earth",
    url: "https://pubs.usgs.gov/publication/mcs2026",
    format: "html", maxBytes: 150_000, nature: "annual-baseline-not-current-news",
  },
  {
    id: "nrcan", category: "rare_earth",
    url: "https://api.io.canada.ca/io-server/gc/news/en/v2?dept=naturalresourcescanada&sort=publishedDate&orderBy=desc&pick=5&format=atom&atomtitle=Natural%20Resources%20Canada",
    format: "atom", maxBytes: 160_000, nature: "first-party-feed-item-not-independently-corroborated",
  },
  {
    id: "federal_register", category: "geopolitics",
    url: "https://www.federalregister.gov/api/v1/documents.json?conditions%5Bterm%5D=sanctions&per_page=1&order=newest",
    format: "json", maxBytes: 120_000, nature: "regulatory-publication-not-independent-event",
  },
  {
    id: "uk_desnz", category: "rare_earth",
    url: "https://www.gov.uk/government/organisations/department-for-energy-security-and-net-zero.atom",
    format: "atom", maxBytes: 160_000, nature: "first-party-feed-item-not-independently-corroborated",
  },
];

/** Production probe input is pinned; never follows arbitrary provider links. */
export const FREE_NO_KEY_TRANSPORT_SPECS = Object.freeze(SPECS.map(spec => {
  const item = SOURCE_LINEUP_BY_ID.get(spec.id);
  if (!item || item.category !== spec.category || item.access !== "NO_KEY")
    throw new Error("SOURCE_LINEUP_PROBE_NOT_ALLOWED:" + spec.id);
  const url = new URL(spec.url);
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw new Error("SOURCE_LINEUP_UNSAFE_URL:" + spec.id);
  return Object.freeze(spec);
}));

/**
 * A 200 status, an empty page, a null annual observation, or an unrelated
 * World Bank source is NOT a successful WDI baseline refresh. The pinned
 * request asks for the most recent non-empty USA GDP value (mrnev=1).
 * Reference years and retrieval timestamps are never publication clocks.
 */
export function validWdiSource2Reference(data) {
  if (!Array.isArray(data) || data.length !== 2) return false;
  const [page, rows] = data;
  if (!page || typeof page !== "object" || Array.isArray(page) ||
      Number(page.page) !== 1 || Number(page.pages) < 1 ||
      String(page.sourceid) !== "2" || Number(page.total) < 1 ||
      !Array.isArray(rows) || rows.length !== 1) return false;
  const row = rows[0];
  const year = Number(row?.date);
  return row?.indicator?.id === "NY.GDP.MKTP.CD" &&
    row?.countryiso3code === "USA" && row?.country?.id === "US" &&
    typeof row?.date === "string" && /^\\d{4}$/.test(row.date) &&
    Number.isInteger(year) && year >= 1960 && year <= new Date().getUTCFullYear() &&
    typeof row.value === "number" && Number.isFinite(row.value) && row.value >= 0;
}

export function validateFreeLineupProbePayload(spec, payload) {
  if(spec.id==="gdelt_events"&&spec.category==="geopolitics"&&
     spec.url===GDELT_PUBLIC_BATCH_MANIFEST&&spec.format==="manifest"){
    const parsed=parseGdeltBatchManifest(payload);
    return {valid:parsed!==null,format_checked:true,
      kind:"LICENSED_GDELT_RELEASE_INDEX_NOT_ORIGINAL_ARTICLE"};
  }
  if(spec.production_update_reader===true){
    const global=GLOBAL_OFFICIAL_RELEASE_FEEDS.find(s=>s.id===spec.id&&s.url===spec.url);
    if(global){
      if(global.format==='json'){
        try{const x=JSON.parse(payload);return {valid:Array.isArray(x?.results)&&Number.isFinite(x.total),format_checked:true,kind:'GLOBAL_PUBLISHER_SEARCH_INDEX'};}catch{return {valid:false};}
      }
      const valid=typeof payload==='string'&&payload.trim()&&
        (global.format==='html'?/^\s*(?:<!doctype html|<html)\b/iu.test(payload)&&!(/<!ENTITY|<!DOCTYPE\s+[^>]*\[/iu.test(payload)):
         !(/<!DOCTYPE|<!ENTITY/iu.test(payload))&&(global.rdf?/<rdf:RDF(?:\s|>)/iu.test(payload)&&/xmlns:dc=["']http:\/\/purl.org\/dc\/elements\/1.1\/["']/u.test(payload):/<rss(?:\s|>)/iu.test(payload)));
      return {valid:Boolean(valid),format_checked:true,kind:'GLOBAL_ORIGINAL_RELEASE'};
    }
    if(typeof payload!=="string"||!payload.trim()||/<!DOCTYPE|<!ENTITY/iu.test(payload))
      return {valid:false,format_checked:true,kind:"INVALID_UPDATE_BODY"};
    if(spec.format==='rss')return {valid:/<rss(?:\s|>)/iu.test(payload),format_checked:true,kind:'RSS_UPDATE_RECORDS'};
    if(spec.format==='xml')return {valid:spec.id==='un_security_council_sanctions'
      ?/<CONSOLIDATED_LIST(?:\s|>)/u.test(payload)
      :spec.id==='ecb_fx'?/<Cube\b[^>]*currency=/u.test(payload):false,
      format_checked:true,kind:'XML_DATASET_UPDATE'};
    if(spec.format==='json'){
      try{const x=JSON.parse(payload);return {valid:spec.id==='ny_fed'?Array.isArray(x?.refRates):
        spec.id==='uk_fcdo_advisories'?Array.isArray(x?.results)&&Number.isFinite(x.total):
        spec.id==='us_bis_export_controls'?Array.isArray(x?.results)&&Number.isFinite(x.count):
        spec.id==='wikimedia_pageviews'?Array.isArray(x?.items):false,
        format_checked:true,kind:'JSON_REFERENCE_OR_DOCUMENT_UPDATE'};}catch{return {valid:false};}
    }
  }
  if (spec.format === "head") return {
    format_checked: false, valid: true, kind: "HEAD_REACHABLE_ONLY",
    native_publisher_original_date_verified: false,
  };
  if (spec.format === "html") return {
    format_checked: true,
    valid: /^\s*(?:<!doctype html|<html)\b/iu.test(String(payload)),
    kind: "HTML_CONTEXT_ONLY",
    native_publisher_original_date_verified: false,
  };
  if (spec.format === "atom") {
    const text = String(payload).trimStart().replace(/^<\?xml[^>]*\?>\s*/iu, "");
    return { format_checked: true, valid: /^<feed\b/iu.test(text),
      kind: "ATOM_TRANSPORT_ONLY",
      native_publisher_original_date_verified: false };
  }
  let data;
  try { data = JSON.parse(String(payload)); }
  catch { return { valid: false, format_checked: false, kind: "INVALID_JSON",
    native_publisher_original_date_verified: false }; }
  const match = spec.id === "cisa_kev"
    ? Array.isArray(data?.vulnerabilities) &&
      typeof data?.catalogVersion === "string"
    : spec.id === "usgs_earthquakes"
    ? data?.type === "FeatureCollection" && Array.isArray(data.features)
    : spec.id === "bls"
      ? data?.status === "REQUEST_SUCCEEDED" && Array.isArray(data?.Results?.series)
      : spec.id === "world_bank_wdi"
        ? validWdiSource2Reference(data)
        : spec.id === "treasury_fiscaldata"
          ? Array.isArray(data?.data)
          : spec.id === "federal_register"
            ? Number.isFinite(data?.count) && Array.isArray(data?.results)
            : false;
  return { valid: match, format_checked: true, kind: "JSON_SCHEMA_TRANSPORT_ONLY",
    native_publisher_original_date_verified: false };
}

async function boundedBody(response, maxBytes) {
  if (Number(response.headers.get("content-length") ?? 0) > maxBytes)
    return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) return null;
      chunks.push(value);
    }
    const merged = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(merged);
  } catch { return null; }
  finally { await reader.cancel().catch(() => undefined); }
}

// The UN publisher now emits a short-lived, anonymous read-only Azure
// distribution URL. Follow exactly this observed publisher-owned file once;
// never follow arbitrary provider redirects or retain/log the signed query.
function unOfficialDistribution(spec, response) {
  if(spec.id!=="un_security_council_sanctions"||
     spec.url!=="https://scsanctions.un.org/resources/xml/en/consolidated.xml"||
     ![301,302,303,307,308].includes(response.status))return null;
  try{
    const u=new URL(response.headers.get("location"));
    const allowed=new Set(['sv','st','se','sr','sp','sig','rscd']);
    const names=[...u.searchParams.keys()];
    const expiry=Date.parse(u.searchParams.get('se')??'');
    const start=Date.parse(u.searchParams.get('st')??'');
    const now=Date.now();
    if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||
       u.hostname!=="unsolprodfiles.blob.core.windows.net"||
       u.pathname!=="/publiclegacyxmlfiles/EN/consolidatedLegacyByPRN.xml"||
       u.href.length>2048||new Set(names).size!==names.length||names.some(k=>!allowed.has(k))||
       u.searchParams.get('sp')!=='r'||u.searchParams.get('sr')!=='b'||
       !/^[A-Za-z0-9+/=]{20,128}$/u.test(u.searchParams.get('sig')??'')||
       !Number.isFinite(expiry)||expiry<=now||expiry>now+2*3600000||
       !Number.isFinite(start)||start>now+5*60000||start<now-2*3600000)
      return null;
    return u.href;
  }catch{return null;}
}

export async function probeNoKeySource(spec, fetchImpl = fetch, {onPayload=null}={}) {
  let state = "NETWORK_UNAVAILABLE", code = null;
  try {
    const unDistribution=spec.id==="un_security_council_sanctions"&&spec.url==="https://scsanctions.un.org/resources/xml/en/consolidated.xml";
    const options={
      method: spec.format === "head" ? "HEAD" : "GET",
      redirect: unDistribution?"manual":"error",
      headers: { Accept: spec.format === "manifest" ? "text/plain" :
        spec.format === "html" ? "text/html" :
        ['atom','rss','xml'].includes(spec.format) ? "application/rss+xml, application/atom+xml, application/xml, text/xml" :
          "application/json", 'user-agent':'Geomacro-Source-Updates/1.0 (contact@geomacro.live)' },
      // WDI is an annual reference, not a high-frequency news feed. A single
      // bounded 25s read avoids false outage on slow World Bank responses;
      // never retry, redirect, or exceed the established polling cadence.
      signal: AbortSignal.timeout(spec.id === "world_bank_wdi" ? 25_000 : 7_000),
    };
    let response=await fetchImpl(spec.url,options);
    if(unDistribution&&response.status>=300&&response.status<400){
      const target=unOfficialDistribution(spec,response);
      await response.body?.cancel().catch(()=>undefined);
      if(!target)throw Error('UN_OFFICIAL_DISTRIBUTION_UNVERIFIED');
      response=await fetchImpl(target,{...options,redirect:'error',signal:AbortSignal.timeout(7_000)});
    }
    code = response.status;
    state = [401, 403, 429].includes(code) ? "DENIED_OR_RATE_LIMIT" :
      !response.ok ? "HTTP_UNAVAILABLE" : "UNVERIFIED_CONTENT";
    if (response.ok) {
      const payload=spec.format==='head'?'':await boundedBody(response,spec.maxBytes);
      const safe=validateFreeLineupProbePayload(spec,payload);
      state = safe.valid && spec.format === "head" ? "ENDPOINT_REACHABLE_FORMAT_UNVERIFIED"
        : safe.valid ? "TRANSPORT_READABLE" : "FORMAT_OR_SIZE_UNVERIFIED";
      if(safe.valid&&onPayload){
        try{onPayload(payload);}catch{state="FORMAT_OR_SIZE_UNVERIFIED";}
      }
    }
  } catch {
    state = "NETWORK_UNAVAILABLE";
  }
  return {
    category: spec.category,
    id: spec.id,
    state,
    http_status: code,
    content_format_proven: state === "TRANSPORT_READABLE" && spec.format !== "head",
    original_publisher_release_proven: false,
    commercial_paid_activation: false,
    signed_risk_generated: false,
    raw_payload_persisted: false,
  };
}

export async function observeNoKeyLineup(group, fetchImpl = fetch) {
  if (!Number.isInteger(group) || group < 0 || group > 2)
    throw new Error("SOURCE_PROBE_GROUP_INVALID");
  // Exactly one bounded provider attempt per category per run; the three
  // distinct candidates in each category rotate without overlap.
  const chosen = ["geopolitics", "macro", "rare_earth"].map(category =>
    FREE_NO_KEY_TRANSPORT_SPECS.filter(spec => spec.category === category)[group]
  ).filter(Boolean);
  const rows = await Promise.all(chosen.map(spec => probeNoKeySource(spec, fetchImpl)));
  return {
    schema: "geomacro.operator-commercial-no-key-source-probe.v1",
    checked_at: new Date().toISOString(),
    group,
    attempted: rows.length,
    per_category: Object.fromEntries(["geopolitics","macro","rare_earth"].map(category =>
      [category, {
        checked: rows.filter(row => row.category === category).length,
        readable: rows.filter(row => row.category === category && row.state === "TRANSPORT_READABLE").length,
      }]
    )),
    rows,
    any_paid_source_activated: false,
    payments: 0,
    supabase_requests: 0,
    b2_requests: 0,
    d1_requests: 0,
    raw_payload_persisted: false,
    dataset_license_newly_verified: false,
    scored_or_signed_intelligence_delivered: false,
  };
}
