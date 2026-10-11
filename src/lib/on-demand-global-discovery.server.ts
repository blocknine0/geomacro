import { createHash } from "node:crypto";

/**
 * Query-time, bounded, Supabase/B2-free GLOBAL DISCOVERY for a future paid
 * derived-intelligence request. Index arrival is NOT original publication.
 * This stage never makes a settlement, signs a GRO, or grants source rights.
 * Privacy: customer freeform questions/identities are NEVER forwarded to an
 * upstream search API. Only ISO3-validated country and fixed domain terms.
 */
export type OnDemandCategory = "geopolitics" | "macro" | "rare_earth";
export type OnDemandSearchInput = {
  country_iso3: string;
  categories: OnDemandCategory[];
};
export type SourceProbe = {
  family: string;
  attempted: boolean;
  reachable: boolean;
  observed_record_count: number;
  publication_clock_verified: boolean;
  independent_claim_verified: false;
  derived_commercial_rights_verified: false;
};
export type OnDemandDiscovery = {
  schema: "geomacro.on-demand-global-private-discovery.v1";
  country_iso3: string;
  categories: OnDemandCategory[];
  checked_at: string;
  searched_in_parallel: true;
  network_attempts: number;
  reached_source_families: number;
  source_probes: SourceProbe[];
  query_fingerprint_sha256: string;
  status: "DISCOVERY_OBSERVED_NOT_YET_VERIFIED" | "DISCOVERY_DEGRADED";
  independent_same_event_corroboration_verified: false;
  source_derived_commercial_rights_verified: false;
  signed_derived_intelligence_created: false;
  payable: false;
  raw_upstream_delivered: false;
  supabase_requests: 0;
  b2_requests: 0;
  settlement_attempted: false;
};

const DOMAINS = ["geopolitics", "macro", "rare_earth"] as const;
const SEARCH_TERMS: Record<OnDemandCategory, string> = {
  geopolitics: "(sanctions OR conflict OR ceasefire OR foreign policy)",
  macro: "(inflation OR central bank OR exchange rate OR monetary policy)",
  rare_earth: "(critical minerals OR rare earth OR lithium OR cobalt)",
};
const MAX_BODY_BYTES = 192 * 1024;
const TIMEOUT_MS = 5_000;

async function boundedFetch(
  fetchImpl: typeof fetch, url: string, accept: string,
): Promise<string> {
  const target = new URL(url);
  // This whitelist is not caller configurable. Do not follow redirects to
  // arbitrary locations, signed querystrings, credentials or metadata IPs.
  if (target.protocol !== "https:" ||
      !["api.worldbank.org","api.gdeltproject.org","api.reliefweb.int",
        "www.gov.uk"].includes(target.hostname)) {
    throw Error("ON_DEMAND_SOURCE_ORIGIN_NOT_ALLOWED");
  }
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "error",
    headers: { Accept: accept },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok ||
      Number(response.headers.get("content-length") || 0) > MAX_BODY_BYTES)
    throw Error("ON_DEMAND_SOURCE_UNAVAILABLE");
  const body = await response.text();
  if (Buffer.byteLength(body,"utf8") > MAX_BODY_BYTES)
    throw Error("ON_DEMAND_SOURCE_RESPONSE_OVERSIZED");
  return body;
}
function digest(s: string) {
  return createHash("sha256").update(s,"utf8").digest("hex");
}
function iso3(value: string) {
  const country = String(value || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(country)) throw Error("ON_DEMAND_ISO3_INVALID");
  return country;
}
function freshPublished(value: string, now: Date) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= now.getTime() &&
    now.getTime() - parsed <= 24*60*60*1_000;
}
function probe(family: string, count: number, clock: boolean): SourceProbe {
  return {
    family,attempted:true,reachable:true,
    observed_record_count:Math.min(Math.max(0,count),10),
    publication_clock_verified:clock,
    independent_claim_verified:false,
    derived_commercial_rights_verified:false,
  };
}
function failed(family: string): SourceProbe {
  return {...probe(family,0,false),reachable:false};
}

async function countryName(country: string, fetchImpl: typeof fetch) {
  const body = await boundedFetch(fetchImpl,
    "https://api.worldbank.org/v2/country/" + country + "?format=json",
    "application/json");
  const data: unknown = JSON.parse(body);
  if (!Array.isArray(data) || !Array.isArray(data[1])) throw Error("ON_DEMAND_COUNTRY_NOT_FOUND");
  const row = data[1].find((v: Record<string,unknown>) =>
    v?.id === country && typeof v?.name === "string");
  if (!row || typeof row.name !== "string" || !/^[\p{L}\p{N} ,.'&()-]{2,100}$/u.test(row.name))
    throw Error("ON_DEMAND_COUNTRY_NOT_FOUND");
  return row.name as string;
}
async function gdelt(
  category: OnDemandCategory, countryNameValue: string, fetchImpl: typeof fetch,
): Promise<SourceProbe> {
  // GDELT is a discovery INDEX. Its "seendate" is NEVER original publication
  // and third-party discovery NEVER proves independent event corroboration.
  const q = '"' + countryNameValue.replace(/"/g,"") + '" AND ' +
    SEARCH_TERMS[category];
  const params = new URLSearchParams({
    query:q,mode:"ArtList",format:"json",maxrecords:"10",
    sort:"DateDesc",timespan:"24h",
  });
  const body = await boundedFetch(fetchImpl,
    "https://api.gdeltproject.org/api/v2/doc/doc?" + params,
    "application/json");
  const parsed: unknown = JSON.parse(body);
  const articles = typeof parsed === "object" && parsed !== null &&
    Array.isArray((parsed as {articles?:unknown}).articles)
    ? (parsed as {articles:unknown[]}).articles : [];
  const valid = articles.filter(v => {
    if (!v || typeof v !== "object") return false;
    const row = v as {url?:unknown,title?:unknown};
    if (typeof row.title !== "string" || row.title.trim().length < 10 ||
        typeof row.url !== "string") return false;
    try { const url = new URL(row.url); return url.protocol === "https:"; }
    catch { return false; }
  });
  return probe("gdelt_doc_discovery",valid.length,false);
}

async function reliefWeb(countryNameValue: string, fetchImpl: typeof fetch, now: Date) {
  const params = new URLSearchParams({
    appname:"geomacro.live",limit:"10",
    "query[value]":countryNameValue + " humanitarian security",
    "query[operator]":"AND",
  });
  const body = await boundedFetch(fetchImpl,
    "https://api.reliefweb.int/v2/reports?" + params,"application/json");
  const data: unknown = JSON.parse(body);
  const rows = data && typeof data === "object" &&
    Array.isArray((data as {data?:unknown}).data)
      ? (data as {data:unknown[]}).data : [];
  const published = rows.filter(x => {
    if (!x || typeof x !== "object") return false;
    const fields = (x as {fields?:{date?:{original?:unknown}}}).fields;
    return typeof fields?.date?.original === "string" &&
      freshPublished(fields.date.original,now);
  });
  // Provider release date is evidence metadata, not signed same-event proof.
  return probe("reliefweb_discovery",published.length,published.length > 0);
}
async function worldBank(
  country: string, indicator: string, fetchImpl: typeof fetch,
): Promise<SourceProbe> {
  const body = await boundedFetch(fetchImpl,
    "https://api.worldbank.org/v2/country/" + country +
      "/indicator/" + indicator + "?format=json&per_page=6",
    "application/json");
  const json: unknown = JSON.parse(body);
  const rows = Array.isArray(json) && Array.isArray(json[1]) ? json[1] : [];
  const valid = rows.filter((x: Record<string,unknown>) =>
    x && Number.isFinite(x.value) &&
    typeof x.date === "string" && /^\d{4}$/.test(x.date));
  // An annual statistical observation is NOT a real-time new event.
  return probe("world_bank_official_" + indicator,valid.length,false);
}
async function govUkMinerals(
  countryNameValue: string, fetchImpl: typeof fetch, now: Date,
): Promise<SourceProbe> {
  const body = await boundedFetch(fetchImpl,
    "https://www.gov.uk/government/organisations/department-for-business-and-trade.atom",
    "application/atom+xml,application/xml");
  if (/<!(?:DOCTYPE|ENTITY)/i.test(body)) throw Error("ON_DEMAND_XML_UNSAFE");
  const entries = [...body.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/giu)].slice(0,10);
  let accepted = 0;
  for(const [,entry] of entries) {
    const title = /<title(?:\s[^>]*)?>([^<]{1,300})<\/title>/iu.exec(entry)?.[1] ?? "";
    const published = /<published>([^<]+)<\/published>/iu.exec(entry)?.[1] ?? "";
    if (!freshPublished(published,now) ||
        !/critical minerals?|rare[- ]earths?|lithium|cobalt|nickel|graphite/i.test(title) ||
        !title.toLowerCase().includes(countryNameValue.toLowerCase())) continue;
    accepted++;
  }
  return probe("uk_dbt_original_publisher",accepted,accepted>0);
}

/** Never returns upstream text, URLs or source identities for paid output. */
export async function discoverOnDemandGlobal(
  input: OnDemandSearchInput,
  options: {fetchImpl?:typeof fetch; now?:Date}={},
): Promise<OnDemandDiscovery> {
  const now=options.now ?? new Date(), fetchImpl=options.fetchImpl ?? fetch;
  if(!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw Error("ON_DEMAND_CLOCK_INVALID");
  const country = iso3(input.country_iso3);
  if (!Array.isArray(input.categories) || input.categories.length < 1 ||
      input.categories.length > 3 ||
      input.categories.some(v => !DOMAINS.includes(v)) ||
      new Set(input.categories).size !== input.categories.length)
    throw Error("ON_DEMAND_CATEGORIES_INVALID");
  const categories = [...input.categories].sort();
  // Always bound fan-out; missing country metadata is not substituted by an
  // ungrounded guessed country name.
  let name: string;
  try { name = await countryName(country,fetchImpl); }
  catch { name = ""; }
  const tasks: Array<{name:string;run:()=>Promise<SourceProbe>}> = [];
  if (name) for (const category of categories) {
    tasks.push({name:"gdelt_doc_discovery",run:()=>gdelt(category,name,fetchImpl)});
    if (category==="geopolitics")
      tasks.push({name:"reliefweb_discovery",run:()=>reliefWeb(name,fetchImpl,now)});
    if (category==="rare_earth")
      tasks.push({name:"uk_dbt_original_publisher",run:()=>govUkMinerals(name,fetchImpl,now)});
  }
  if (categories.includes("macro")) for (const indicator of [
    "FP.CPI.TOTL.ZG","NY.GDP.MKTP.KD.ZG",
  ]) tasks.push({name:"world_bank_official_" + indicator,
    run:()=>worldBank(country,indicator,fetchImpl)});
  // Exactly one fixed metadata lookup + at most seven provider requests,
  // no 195-country fanout and no user question passed upstream.
  const settled=await Promise.allSettled(tasks.map(t=>t.run()));
  const source_probes=settled.map((result,i)=>result.status==="fulfilled"
    ? result.value : failed(tasks[i].name));
  const reached=source_probes.filter(p=>p.reachable).length;
  return {
    schema:"geomacro.on-demand-global-private-discovery.v1",
    country_iso3:country,categories,checked_at:now.toISOString(),
    searched_in_parallel:true,network_attempts:tasks.length+1,
    reached_source_families:reached,source_probes,
    query_fingerprint_sha256:digest(JSON.stringify([country,categories])),
    status:reached>0?"DISCOVERY_OBSERVED_NOT_YET_VERIFIED":"DISCOVERY_DEGRADED",
    independent_same_event_corroboration_verified:false,
    source_derived_commercial_rights_verified:false,
    signed_derived_intelligence_created:false,payable:false,
    raw_upstream_delivered:false,supabase_requests:0,b2_requests:0,
    settlement_attempted:false,
  };
}
