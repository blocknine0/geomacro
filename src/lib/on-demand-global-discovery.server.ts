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
/**
 * PRIVATE EPHEMERAL EVIDENCE ONLY: never put this in response JSON or
 * durable public D1/B2. Each record is merely an original publisher's
 * item-native date; article-page verification, claim corroboration, risk
 * qualification and derived rights must happen separately before payment.
 */
export type PrivateOriginalCandidate = {
  domain: OnDemandCategory;
  publisher_family: string;
  article_url: string;
  article_title: string;
  feed_item_published_at: string;
  article_identity_sha256: string;
  first_party_article_url_verified: true;
  source_native_feed_publication_date_verified: true;
  publisher_article_page_date_verified: false;
  independent_same_event_verified: false;
  derived_commercial_rights_verified: false;
  score_verified: false;
  signed_gro_verified: false;
  paid_delivery_allowed: false;
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
        "www.gov.uk","news.un.org","www.federalreserve.gov",
        "www.minister.industry.gov.au"].includes(target.hostname)) {
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
  if (!response.body) throw Error("ON_DEMAND_SOURCE_RESPONSE_EMPTY");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw Error("ON_DEMAND_SOURCE_RESPONSE_OVERSIZED");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
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
    x && typeof x.value === "number" && Number.isFinite(x.value) &&
    typeof x.date === "string" && /^\d{4}$/.test(x.date));
  // An annual statistical observation is NOT a real-time new event.
  return probe("world_bank_official_" + indicator,valid.length,false);
}
// Independent first-party fallback feeds: never bypass blocked upstream
// APIs with mirrored copies from the SAME publisher. This broadens publisher
// TRANSPORT only, not legal rights, event corroboration or risk eligibility.
type OriginalFeed = {
  domain: OnDemandCategory;
  family:string;
  url:string;
  media:"rss"|"atom";
  originalHost:string;
  originalPath:RegExp;
  topic:RegExp;
};
const ORIGINAL_FALLBACK_FEEDS: readonly OriginalFeed[] = [
  {
    domain:"rare_earth",family:"uk_dbt_original_publisher",
    url:"https://www.gov.uk/government/organisations/department-for-business-and-trade.atom",
    media:"atom",originalHost:"www.gov.uk",
    originalPath:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
    topic:/\b(?:critical minerals?|rare[- ]earths?|lithium|cobalt|nickel|graphite|mineral supply|mining)\b/iu,
  },
  {
    domain:"geopolitics",family:"un_news_original_publisher",
    url:"https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml",
    media:"rss",originalHost:"news.un.org",
    originalPath:/^\/en\/story\/\d{4}\/\d{1,2}\//u,
    topic:/\b(?:security council|ceasefire|conflict|sanctions?|war|airstrike|peace|military)\b/iu,
  },
  {
    domain:"geopolitics",family:"uk_fcdo_original_publisher",
    url:"https://www.gov.uk/government/organisations/foreign-commonwealth-development-office.atom",
    media:"atom",originalHost:"www.gov.uk",
    originalPath:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
    topic:/\b(?:ceasefire|sanctions?|conflict|military|diplomatic|foreign|security|peace)\b/iu,
  },
  {
    domain:"macro",family:"us_federal_reserve_original_publisher",
    url:"https://www.federalreserve.gov/feeds/press_all.xml",
    media:"rss",originalHost:"www.federalreserve.gov",
    originalPath:/^\/newsevents\/pressreleases\/[A-Za-z0-9]/u,
    topic:/\b(?:monetary policy|interest rates?|inflation|foreign exchange|economic activity|financial stability|liquidity|federal funds)\b/iu,
  },
  {
    domain:"rare_earth",family:"australian_industry_original_publisher",
    url:"https://www.minister.industry.gov.au/feed/t-ayres/rss.xml",
    media:"rss",originalHost:"www.minister.industry.gov.au",
    originalPath:/^\/(?:t-ayres|king)\/media\//u,
    topic:/\b(?:critical minerals?|rare[- ]earths?|lithium|cobalt|nickel|graphite|mineral supply|mining)\b/iu,
  },
];
function originalArticleUrl(value:string, def:OriginalFeed):string|null {
  try {
    const u=new URL(value.replace(/&amp;/giu,"&"));
    if(u.protocol!=="https:" || u.hostname!==def.originalHost ||
      u.username || u.password || u.port || u.hash ||
      u.href.length>=2048 || !def.originalPath.test(u.pathname) ||
      /(?:^|\/)(?:feed|rss|atom)(?:\/|$)/iu.test(u.pathname))return null;
    // Remove publisher tracking/query params from the event fingerprint.
    return u.origin+u.pathname;
  }catch {return null;}
}
type OriginalFeedResult={probe:SourceProbe;private_candidates:PrivateOriginalCandidate[]};
async function originalOfficialFeed(
  def:OriginalFeed,countryNameValue:string,
  fetchImpl:typeof fetch,now:Date,
):Promise<OriginalFeedResult>{
  const xml=await boundedFetch(fetchImpl,def.url,
    "application/rss+xml,application/atom+xml,application/xml");
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml))
    throw Error("ON_DEMAND_ORIGINAL_FEED_XML_UNSAFE");
  const atom=def.media==="atom";
  if(atom ? !/<(?:atom:)?feed(?:\s|>)/iu.test(xml)
          : !/<rss(?:\s|>)/iu.test(xml))
    throw Error("ON_DEMAND_ORIGINAL_FEED_FORMAT_INVALID");
  const entries=atom
    ? [...xml.matchAll(/<(?:atom:)?entry(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?entry>/giu)]
    : [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)];
  const candidates:PrivateOriginalCandidate[]=[];
  for(const [,entry] of entries.slice(0,40)){
    const title=/<(?:atom:)?title(?:\s[^>]*)?>([^<]{1,300})<\/(?:atom:)?title>/iu.exec(entry)?.[1] ?? "";
    const date=atom
      ? /<(?:atom:)?published(?:\s[^>]*)?>([^<]+)<\/(?:atom:)?published>/iu.exec(entry)?.[1] ?? ""
      : /<pubDate(?:\s[^>]*)?>([^<]+)<\/pubDate>/iu.exec(entry)?.[1] ?? "";
    if (!title.toLowerCase().includes(countryNameValue.toLowerCase()) ||
        !def.topic.test(title) || !freshPublished(date,now)) continue;
    let href="";
    if(atom){
      const links=[...entry.matchAll(/<(?:atom:)?link\b([^>]*?)\/?\s*>/giu)];
      const first=links.find(x=>{
        const rel=/\brel\s*=\s*["']([^"']+)["']/iu.exec(x[1])?.[1] ?? "alternate";
        return rel==="alternate"||rel==="canonical";
      });
      href=first ? /\bhref\s*=\s*["']([^"']+)["']/iu.exec(first[1])?.[1] ?? "" : "";
    }else {
      href=/<link(?:\s[^>]*)?>([^<]+)<\/link>/iu.exec(entry)?.[1] ?? "";
    }
    const article_url=originalArticleUrl(href,def);
    if(!article_url)continue;
    if(candidates.length>=4)continue; // fixed private evidence budget/issuer
    const article_title=title.replace(/\s+/gu," ").trim();
    candidates.push({
      domain:def.domain,publisher_family:def.family,article_url,article_title,
      feed_item_published_at:new Date(Date.parse(date)).toISOString(),
      article_identity_sha256:digest(def.family+"|"+article_url),
      first_party_article_url_verified:true,
      source_native_feed_publication_date_verified:true,
      publisher_article_page_date_verified:false,
      independent_same_event_verified:false,
      derived_commercial_rights_verified:false,
      score_verified:false,
      signed_gro_verified:false,
      paid_delivery_allowed:false,
    });
  }
  return {probe:probe(def.family,candidates.length,candidates.length>0),
    private_candidates:candidates};
}

/** Never returns upstream text, URLs or source identities for paid output. */
async function discoverOnDemandImpl(
  input: OnDemandSearchInput,
  options: {fetchImpl?:typeof fetch; now?:Date}={},
): Promise<{discovery:OnDemandDiscovery;private_candidates:PrivateOriginalCandidate[]}> {
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
  const tasks: Array<{name:string;run:()=>Promise<SourceProbe|OriginalFeedResult>}> = [];
  if (name) for (const category of categories) {
    tasks.push({name:"gdelt_doc_discovery",run:()=>gdelt(category,name,fetchImpl)});
    if (category==="geopolitics")
      tasks.push({name:"reliefweb_discovery",run:()=>reliefWeb(name,fetchImpl,now)});
  }
  if (name) for (const source of ORIGINAL_FALLBACK_FEEDS) {
    if (categories.includes(source.domain)) tasks.push({
      name:source.family,
      run:()=>originalOfficialFeed(source,name,fetchImpl,now),
    });
  }
  if (categories.includes("macro")) for (const indicator of [
    "FP.CPI.TOTL.ZG","NY.GDP.MKTP.KD.ZG",
  ]) tasks.push({name:"world_bank_official_" + indicator,
    run:()=>worldBank(country,indicator,fetchImpl)});
  // Exactly one fixed metadata lookup + at most eleven provider requests,
  // no 195-country fanout and no user question passed upstream.
  const settled=await Promise.allSettled(tasks.map(t=>t.run()));
  const source_probes=settled.map((result,i)=>{
    if(result.status==="rejected")return failed(tasks[i].name);
    const value=result.value;
    return "probe" in value ? value.probe : value;
  });
  // Never persist, log, or expose raw first-party titles/articles here.
  // Every candidate requires the later governed article-page/rights/signing
  // stages; each source institution stays independently identified.
  const private_candidates=settled.flatMap(result=>
    result.status==="fulfilled" && "private_candidates" in result.value
      ? result.value.private_candidates : []).slice(0,16);
  // The same GDELT producer searched for 3 different topics is ONE family,
  // and two World Bank indicator requests are ONE official institution.
  const reached=new Set(source_probes.filter(p=>p.reachable).map(p=>
    p.family.startsWith("world_bank_official_")
      ? "world_bank_official" : p.family)).size;
  const discovery:OnDemandDiscovery={
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
  return {discovery,private_candidates};
}

/** Client-safe shape: no upstream article, URLs, text, or private evidence. */
export async function discoverOnDemandGlobal(
  input:OnDemandSearchInput,
  options:{fetchImpl?:typeof fetch;now?:Date}={},
):Promise<OnDemandDiscovery>{
  return (await discoverOnDemandImpl(input,options)).discovery;
}

/**
 * PRIVATE INTERNAL producer interface for the same bounded one-shot fetch.
 * Never serialize this tuple to a customer, audit log or x402 quote.
 */
export async function discoverOnDemandForPrivateQualification(
  input:OnDemandSearchInput,
  options:{fetchImpl?:typeof fetch;now?:Date}={},
):Promise<{discovery:OnDemandDiscovery;private_candidates:PrivateOriginalCandidate[]}>{
  return discoverOnDemandImpl(input,options);
}
