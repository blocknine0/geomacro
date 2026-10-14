import { createHash } from "node:crypto";
import { originalHeadlineMentionsCountry } from "./on-demand-original-subject-matching";
// One strict original-publication verifier for BOTH 30m and customer on-demand paths.
import { verifiedPublisherPageDate } from "../../scripts/lib/official-original-article-date.mjs";

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
  // Optional fixed vocabulary, never the raw customer question.
  mineral?: OnDemandMineral | null;
  topics?: readonly string[];
  max_age_seconds?: number;
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
  // Only exact same-item original first-party feed summary or GOV.UK
  // first-party search description. Private, bounded and never returned
  // in public discovery, user payloads or audit logs.
  item_scoped_summary_private?: string;
  feed_item_published_at: string | null;
  // Never promote a feed <updated> as original publication. Only an
  // allowlisted GOV.UK Atom first-party page may rescue this private lead.
  undated_atom_original_page_pending?: true;
  search_index_original_page_pending?: true;
  article_identity_sha256: string;
  first_party_article_url_verified: true;
  source_native_feed_publication_date_verified: boolean;
  publisher_article_page_date_verified: false;
  independent_same_event_verified: false;
  derived_commercial_rights_verified: false;
  score_verified: false;
  signed_gro_verified: false;
  paid_delivery_allowed: false;
};
/** Private annual change evidence only; NOT a risk score or fresh event.
 * Original World Bank numerical observations are used ephemerally and are
 * never serialized from the public discovery method.
 */
export type PrivateOfficialMacroChange = {
  country_iso3: string;
  indicator: "FP.CPI.TOTL.ZG" | "NY.GDP.MKTP.KD.ZG";
  latest_observation_year: number;
  previous_observation_year: number;
  latest_annual_pct: number;
  previous_annual_pct: number;
  annual_rate_change_percentage_points: number;
  source_observation_sha256: string;
  observation_type: "ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS";
  publisher_original_release_date_verified: false;
  derived_commercial_rights_verified: false;
  risk_score_verified: false;
  paid_delivery_allowed: false;
};
export type SourceProbe = {
  family: string;
  // Category-specific acceptance must not count Macro as Geopolitics.
  category?: OnDemandCategory;
  attempted: boolean;
  reachable: boolean;
  observed_record_count: number;
  publication_clock_verified: boolean;
  // Distinguish no relevant original from upstream errors or access controls.
  retrieval_state?: "RECORDS_OBSERVED"|"NO_MATCHING_RECORDS"|
    "RATE_LIMITED"|"ACCESS_RESTRICTED"|"TRANSPORT_UNAVAILABLE"|
    "COOLDOWN_ACTIVE"|"PROVIDER_INVALID";
  // Aggregate original-item diagnostics, never titles or article URLs.
  feed_audit?: {
    inspected:number; native_dated:number; country_mentioned:number;
    scope_matched:number; eligible_pub_date:number; allowed_article_paths:number;
  };
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
// Only these fixed identifiers may affect upstream search terms. The customer's
// freeform question is never forwarded to a publisher or search provider.
const MINERAL_TERMS = [
  { value: "lithium", pattern: /\blithium\b/iu },
  { value: "cobalt", pattern: /\bcobalt\b/iu },
  { value: "nickel", pattern: /\bnickel\b/iu },
  { value: "graphite", pattern: /\bgraphite\b/iu },
  { value: "copper", pattern: /\bcopper\b/iu },
  { value: "rare earth", pattern: /\brare[- ]earths?\b/iu },
] as const;
export type OnDemandMineral = (typeof MINERAL_TERMS)[number]["value"];

/** Lightweight deterministic query routing; never claim this is AI analysis. */
export function inferOnDemandMineral(question: string | null | undefined): OnDemandMineral | null {
  if (!question) return null;
  const matches = MINERAL_TERMS.filter((term) => term.pattern.test(question));
  if (matches.length > 1) throw Error("ON_DEMAND_MULTIPLE_MINERALS_UNSUPPORTED");
  return matches[0]?.value ?? null;
}

// Fixed topic vocabulary. Never send a customer's freeform question upstream.
// A generic official headline is not evidence for an exact sanctioned topic.
const TOPIC_TITLE_PATTERNS:Readonly<Record<string,RegExp>>={
  sanctions_restrictions:/\b(?:sanctions?|embargo|export controls?|restrictions?)\b/iu,
  conflict_geopolitics:/\b(?:conflict|ceasefire|war|military|airstrike|peace|security council)\b/iu,
  political_governance:/\b(?:government|governance|election|parliament|diplomatic)\b/iu,
  macro_risk:/\b(?:inflation|gdp|monetary|central bank|growth|interest rate|economy|economic|financial|chancellor|treasury)\b/iu,
  sovereign_risk:/\b(?:fiscal|sovereign|budget|bond|debt)\b/iu,
  fx_external_risk:/\b(?:foreign exchange|exchange rate|currency|reserves|fx)\b/iu,
  critical_minerals:/\b(?:critical minerals?|rare[- ]earths?|lithium|cobalt|nickel|graphite|copper|mining)\b/iu,
};
const CATEGORY_TOPICS:Readonly<Record<OnDemandCategory,readonly string[]>>={
  geopolitics:["sanctions_restrictions","conflict_geopolitics","political_governance"],
  macro:["macro_risk","sovereign_risk","fx_external_risk"],
  rare_earth:["critical_minerals"],
};
export function matchesRequestedTopic(title:string,category:OnDemandCategory,topics:readonly string[]):boolean {
  const scoped=topics.filter(topic=>CATEGORY_TOPICS[category].includes(topic));
  return scoped.length===0 || scoped.some(topic=>TOPIC_TITLE_PATTERNS[topic]?.test(title));
}

/** Fixed, bounded rolling-window parser for free question-time discovery only. */
export function inferOnDemandFreshnessSeconds(question:string|null|undefined):number|null {
  if(!question)return null;
  const matches=[...question.matchAll(/\b(?:last|past|within)\s+(\d{1,2})\s*(hours?|days?|weeks?)\b/giu)];
  if(matches.length===0)return null;
  const values=matches.map(match=>{
    const amount=Number(match[1]);
    const unit=match[2].toLowerCase();
    const seconds=amount*(unit.startsWith("hour")?3_600:unit.startsWith("day")?86_400:604_800);
    if(!Number.isInteger(seconds) || seconds<1 || seconds>31*86_400)
      throw Error("ON_DEMAND_FRESHNESS_UNSUPPORTED");
    return seconds;
  });
  if(new Set(values).size!==1)throw Error("ON_DEMAND_FRESHNESS_AMBIGUOUS");
  return values[0];
}

const MAX_BODY_BYTES = 192 * 1024;
// Original first-party government pages regularly exceed ordinary small-feed
// limits; the shared 30m verifier uses exactly 384KiB. This never applies to
// GDELT/WorldBank/ReliefWeb/RSS discovery responses.
const MAX_FIRST_PARTY_HTML_BYTES = 384 * 1024;
const TIMEOUT_MS = 5_000;
const ONE_DAY_MS = 86_400_000;
const MAX_NEWS_AGE_MS = 31 * ONE_DAY_MS;
const RATE_LIMIT_COOLDOWNS_MS = {403: 60*60_000, 429: 15*60_000};
const providerCooldownUntil = new Map<string,number>();
export function retryAfterCooldownMs(value:string|null, now=Date.now()):number {
  if(!value)return RATE_LIMIT_COOLDOWNS_MS[429];
  const seconds=/^\d{1,8}$/.test(value.trim())?Number(value.trim()):NaN;
  const deadline=Number.isFinite(seconds)?now+seconds*1_000:Date.parse(value);
  if(!Number.isFinite(deadline) || deadline<=now)return RATE_LIMIT_COOLDOWNS_MS[429];
  // Honor Retry-After up to one month, with a floor for invalid/short hints.
  return Math.max(RATE_LIMIT_COOLDOWNS_MS[429],
    Math.min(31*ONE_DAY_MS,deadline-now));
}

async function boundedFetch(
  fetchImpl: typeof fetch, url: string, accept: string,
  timeoutMs = TIMEOUT_MS,
): Promise<string> {
  const target = new URL(url);
  // This whitelist is not caller configurable. Do not follow redirects to
  // arbitrary locations, signed querystrings, credentials or metadata IPs.
  if (target.protocol !== "https:" ||
      !["api.worldbank.org","api.gdeltproject.org","api.reliefweb.int",
        "www.gov.uk","news.un.org","www.federalreserve.gov","www.ecb.europa.eu",
        "www.minister.industry.gov.au"].includes(target.hostname)) {
    throw Error("ON_DEMAND_SOURCE_ORIGIN_NOT_ALLOWED");
  }
  const maxBytes = accept === "text/html" ? MAX_FIRST_PARTY_HTML_BYTES : MAX_BODY_BYTES;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      redirect: "error",
      headers: { Accept: accept },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // A network failure may use a specifically approved alternate; an
    // explicit 401/403/429 denial must never be worked around.
    throw Error("ON_DEMAND_SOURCE_TRANSPORT_FAILURE");
  }
  if (!response.ok) {
    if(response.status===429)throw Error("ON_DEMAND_SOURCE_RATE_LIMITED");
    if(response.status===401 || response.status===403)
      throw Error("ON_DEMAND_SOURCE_ACCESS_RESTRICTED");
    const transient = response.status === 404 ||
      (response.status >= 500 && response.status <= 599);
    throw Error(transient ? "ON_DEMAND_SOURCE_TRANSIENT_HTTP" :
      "ON_DEMAND_SOURCE_UNAVAILABLE");
  }
  if (accept === "text/html" &&
      !/^text\/html(?:;|$)/iu.test(response.headers.get("content-type") ?? "")) {
    throw Error("ON_DEMAND_ORIGINAL_PAGE_MIME_INVALID");
  }
  if (Number(response.headers.get("content-length") || 0) > maxBytes)
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
      if (total > maxBytes) {
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
function freshPublished(value: string, now: Date, maxAgeMs=ONE_DAY_MS) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= now.getTime() &&
    now.getTime() - parsed <= maxAgeMs;
}
function probe(family: string, count: number, clock: boolean): SourceProbe {
  return {
    family,attempted:true,reachable:true,
    observed_record_count:Math.min(Math.max(0,count),10),
    retrieval_state:count>0?"RECORDS_OBSERVED":"NO_MATCHING_RECORDS",
    publication_clock_verified:clock,
    independent_claim_verified:false,
    derived_commercial_rights_verified:false,
  };
}
function failed(family:string,error?:unknown):SourceProbe {
  const code=error instanceof Error?error.message:"";
  const retrieval_state:NonNullable<SourceProbe["retrieval_state"]>=
    code==="ON_DEMAND_SOURCE_RATE_LIMITED"?"RATE_LIMITED":
    code==="ON_DEMAND_SOURCE_ACCESS_RESTRICTED"?"ACCESS_RESTRICTED":
    code==="ON_DEMAND_PROVIDER_COOLDOWN"?"COOLDOWN_ACTIVE":
    code==="ON_DEMAND_SOURCE_TRANSPORT_FAILURE" ||
    code==="BOUNDED_EXTERNAL_TRANSPORT_FAILURE"?"TRANSPORT_UNAVAILABLE":"PROVIDER_INVALID";
  return {...probe(family,0,false),reachable:false,retrieval_state};
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
  mineral: OnDemandMineral | null, topics:readonly string[]=[], countryIso3="",
  maxAgeMs=ONE_DAY_MS, deadlineMs=Date.now()+12_000,
): Promise<SourceProbe> {
  // GDELT is a discovery INDEX. Its "seendate" is NEVER original publication
  // and third-party discovery NEVER proves independent event corroboration.
  const scopedTerms=category==="geopolitics" && topics.includes("sanctions_restrictions")
    ? "(sanctions OR embargo OR export controls)"
    : category==="geopolitics" && topics.includes("conflict_geopolitics")
      ? "(ceasefire OR conflict OR war)"
      : category==="macro" && topics.includes("fx_external_risk")
        ? "(foreign exchange OR exchange rate OR currency)"
        : SEARCH_TERMS[category];
  const q = '"' + countryNameValue.replace(/"/g,"") + '" AND ' +
    (category === "rare_earth" && mineral ? '"' + mineral + '"' : scopedTerms);
  const params = new URLSearchParams({
    query:q,mode:"ArtList",format:"json",maxrecords:"10",
    sort:"DateDesc",timespan:Math.max(1,Math.ceil(maxAgeMs/ONE_DAY_MS))+"d",
  });
  const url="https://api.gdeltproject.org/api/v2/doc/doc?" + params;
  // Share ONE 12s latency envelope among the requested category-specific
  // GDELT indexes. Every retry consumes the same original deadline.
  const readIndex=()=>{
    const remaining=deadlineMs-Date.now();
    if(remaining<250)throw Error("ON_DEMAND_PROVIDER_COOLDOWN");
    return boundedFetch(fetchImpl,url,"application/json",Math.min(12_000,remaining));
  };
  let body:string;
  try {
    body=await readIndex();
  } catch(error) {
    // One bounded same-provider retry for 404/5xx only. Never retry
    // authorization (401/403), quota (429), invalid JSON, or bad timestamps.
    // The outer twelve-request budget also applies to this extra attempt.
    if(!(error instanceof Error) ||
       error.message!=="ON_DEMAND_SOURCE_TRANSIENT_HTTP")throw error;
    body=await readIndex();
  }
  const parsed: unknown = JSON.parse(body);
  const articles = typeof parsed === "object" && parsed !== null &&
    Array.isArray((parsed as {articles?:unknown}).articles)
    ? (parsed as {articles:unknown[]}).articles : [];
  // Repeated index entries for an identical publisher URL are one lead.
  // Keep publisher path/query identity; never infer event corroboration.
  const uniqueUrls = new Set<string>();
  for (const value of articles) {
    if (!value || typeof value !== "object") continue;
    const row = value as {url?:unknown,title?:unknown};
    if (typeof row.title !== "string" || row.title.trim().length < 10 ||
        typeof row.url !== "string") continue;
    try {
      const uri = new URL(row.url);
      if (uri.protocol !== "https:" || uri.username || uri.password ||
          uri.port || uri.hash || !uri.hostname) continue;
      if(topics.length>0 &&
        (!originalHeadlineMentionsCountry(row.title,countryIso3,countryNameValue) ||
         !matchesRequestedTopic(row.title,category,topics) ||
         (category==="rare_earth"&&mineral&&
           !MINERAL_TERMS.some(term=>term.value===mineral&&term.pattern.test(row.title)))))
        continue;
      uniqueUrls.add(uri.href);
    } catch { /* Reject an invalid upstream article URL. */ }
  }
  return probe("gdelt_doc_discovery",uniqueUrls.size,false);
}

/** ReliefWeb demands an operator-requested, provider-approved appname.
 * Missing/malformed approval skips traffic entirely, not a fake 403 success.
 * This server env value must be set only after ReliefWeb emails approval.
 */
function approvedReliefWebAppname():string|null {
  const value=typeof process==="undefined"?"":String(
    process.env.RELIEFWEB_APPROVED_APPNAME??"").trim();
  // Never accidentally re-enable the old arbitrary, unapproved domain token.
  if(value==="geomacro.live" ||
     !/^[A-Za-z][A-Za-z0-9_.-]{7,100}$/u.test(value))return null;
  return value;
}
async function reliefWeb(
  countryNameValue:string,fetchImpl:typeof fetch,now:Date,appname:string,maxAgeMs=ONE_DAY_MS,
) {
  const params = new URLSearchParams({
    appname,limit:"10",
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
      freshPublished(fields.date.original,now,maxAgeMs);
  });
  // Provider release date is evidence metadata, not signed same-event proof.
  return probe("reliefweb_discovery",published.length,published.length > 0);
}
export type PrivateMacroQualification = {
  indicator: PrivateOfficialMacroChange["indicator"];
  status:
    | "VALID_ANNUAL_CHANGE"
    | "INVALID_JSON_BODY"
    | "UNEXPECTED_JSON_SHAPE"
    | "NO_NON_NULL_COUNTRY_VALUES"
    | "DUPLICATE_YEAR_CONFLICT"
    | "NON_CONSECUTIVE_ANNUAL_YEARS";
  accepted_annual_values: number;
  latest_observation_year: number | null;
  previous_observation_year: number | null;
};
type PrivateMacroResult = {
  probe: SourceProbe;
  private_macro_changes: PrivateOfficialMacroChange[];
  // Internal, redacted period/validation status. Never leak raw WB values
  // and never mistake a 2xx endpoint for verified annual intelligence.
  private_macro_qualification: PrivateMacroQualification;
};
async function worldBank(
  country: string, indicator: PrivateOfficialMacroChange["indicator"],
  fetchImpl: typeof fetch, now: Date,
): Promise<PrivateMacroResult> {
  const body = await boundedFetch(fetchImpl,
    "https://api.worldbank.org/v2/country/" + country +
      "/indicator/" + indicator + "?format=json&per_page=6",
    "application/json");
  let json: unknown;
  try {json=JSON.parse(body);} catch {
    return {
      probe:failed("world_bank_official_"+indicator),
      private_macro_changes:[],
      private_macro_qualification:{
        indicator,status:"INVALID_JSON_BODY",
        accepted_annual_values:0,latest_observation_year:null,
        previous_observation_year:null,
      },
    };
  }
  const isData=Array.isArray(json) && Array.isArray(json[1]);
  const rows: unknown[] = isData ? json[1] : [];
  const currentYear=now.getUTCFullYear();
  const valid=rows.filter((x): x is {date:string;value:number;countryiso3code:string} => {
    if(!x || typeof x!=="object")return false;
    const row=x as {date?:unknown;value?:unknown;countryiso3code?:unknown;indicator?:{id?:unknown}};
    const year=Number(row.date);
    return typeof row.date==="string" && /^\d{4}$/.test(row.date) &&
      year>=1960 && year<=currentYear &&
      typeof row.value==="number" && Number.isFinite(row.value) &&
      row.countryiso3code===country &&
      (row.indicator?.id===undefined || row.indicator.id===indicator);
  });
  const years=new Map<number,number>();
  let duplicateConflict=false;
  for(const row of valid){
    const year=Number(row.date);
    if(years.has(year) && years.get(year)!==row.value)duplicateConflict=true;
    years.set(year,row.value);
  }
  const periodYears=[...years.keys()].sort((a,b)=>b-a);
  const latest=periodYears[0], previous=periodYears[1];
  const private_macro_changes:PrivateOfficialMacroChange[]=[];
  // Do not invent a change across missing years or conflicting observations.
  if(!duplicateConflict && latest!==undefined && previous===latest-1){
    const latestValue=years.get(latest)!,prevValue=years.get(previous)!;
    private_macro_changes.push({
      country_iso3:country,indicator,latest_observation_year:latest,
      previous_observation_year:previous,
      latest_annual_pct:latestValue,previous_annual_pct:prevValue,
      annual_rate_change_percentage_points:Math.round((latestValue-prevValue)*1e5)/1e5,
      source_observation_sha256:digest(JSON.stringify(
        [country,indicator,latest,latestValue,previous,prevValue])),
      observation_type:"ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS",
      publisher_original_release_date_verified:false,
      derived_commercial_rights_verified:false,
      risk_score_verified:false,paid_delivery_allowed:false,
    });
  }
  // 2xx is transport success, not usable WDI observations. Never synthesize
  // a missing year or expose upstream numerical values as customer output.
  const status:PrivateMacroQualification["status"]= !isData
    ?"UNEXPECTED_JSON_SHAPE":valid.length===0
    ?"NO_NON_NULL_COUNTRY_VALUES":duplicateConflict
    ?"DUPLICATE_YEAR_CONFLICT":private_macro_changes.length===0
    ?"NON_CONSECUTIVE_ANNUAL_YEARS":"VALID_ANNUAL_CHANGE";
  return {
    probe:!isData?failed("world_bank_official_"+indicator):
      probe("world_bank_official_"+indicator,valid.length,false),
    private_macro_changes,
    private_macro_qualification:{
      indicator,status,accepted_annual_values:valid.length,
      latest_observation_year:latest??null,
      previous_observation_year:previous??null,
    },
  };
}
// Independent first-party fallback feeds: never bypass blocked upstream
// APIs with mirrored copies from the SAME publisher. This broadens publisher
// TRANSPORT only, not legal rights, event corroboration or risk eligibility.
type OriginalFeed = {
  domain: OnDemandCategory;
  family:string;
  url:string;
  media:"rss"|"atom"|"search";
  originalHost:string;
  alternateUrl?:string;
  originalPath:RegExp;
  topic:RegExp;
  scopedTopics?:readonly string[];
};
const GOVUK_SEARCH_FALLBACKS:readonly OriginalFeed[]=[
  {
    domain:"geopolitics",family:"uk_fcdo_search_original_page",
    url:"https://www.gov.uk/api/search.json",
    media:"search",originalHost:"www.gov.uk",
    originalPath:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
    topic:/\b(?:sanctions?|embargo|export controls?|conflict|war|military|security|peace)\b/iu,
  },
  {
    domain:"macro",family:"uk_hmt_search_original_page",
    url:"https://www.gov.uk/api/search.json",
    media:"search",originalHost:"www.gov.uk",
    originalPath:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
    topic:/\b(?:econom(?:y|ic|ics)?|financial|chancellor|treasury|inflation|monetary)\b/iu,
  },
  {
    domain:"rare_earth",family:"uk_dbt_search_original_page",
    url:"https://www.gov.uk/api/search.json",
    media:"search",originalHost:"www.gov.uk",
    originalPath:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
    topic:/\b(?:critical minerals?|rare[- ]earths?|lithium|cobalt|nickel|graphite|mineral supply|mining)\b/iu,
  },
];
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
    // Fixed same-publisher backup only on transport errors/404/5xx.
    alternateUrl:"https://news.un.org/feed/subscribe/en/news/all/rss.xml",
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
    domain:"geopolitics",family:"uk_ofsi_original_publisher",
    url:"https://www.gov.uk/government/organisations/office-of-financial-sanctions-implementation.atom",
    media:"atom",originalHost:"www.gov.uk",
    originalPath:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
    topic:/\b(?:sanctions?|asset freezes?|designations?|restrictive measures?)\b/iu,
    scopedTopics:["sanctions_restrictions"],
  },
  {
    domain:"macro",family:"uk_hmt_original_publisher",
    url:"https://www.gov.uk/government/organisations/hm-treasury.atom",
    media:"atom",originalHost:"www.gov.uk",
    originalPath:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
    topic:/\b(?:financial|econom|inflation|interest rates?|treasury|chancellor|monetary)\b/iu,
  },
  {
    domain:"macro",family:"ecb_original_publisher",
    url:"https://www.ecb.europa.eu/rss/press.html",
    media:"rss",originalHost:"www.ecb.europa.eu",
    originalPath:/^\/press\/(?:pr|key|inter|accounts)\/date\/\d{4}\//u,
    topic:/\b(?:monetary|inflation|interest rates?|foreign exchange|economic|currency)\b/iu,
  },
  {
    domain:"rare_earth",family:"uk_desnz_original_publisher",
    url:"https://www.gov.uk/government/organisations/department-for-energy-security-and-net-zero.atom",
    media:"atom",originalHost:"www.gov.uk",
    originalPath:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
    topic:/\b(?:critical minerals?|rare[- ]earths?|lithium|cobalt|nickel|graphite|mineral supply|mining)\b/iu,
  },
  {
    domain:"rare_earth",family:"australian_industry_original_publisher",
    url:"https://www.minister.industry.gov.au/feed/t-ayres/rss.xml",
    // Official all-minister media releases from the same government publisher;
    // this is transport resilience, NOT independent source corroboration.
    alternateUrl:"https://www.minister.industry.gov.au/feed/media-releases/rss.xml",
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

/** RSS items can wrap title, pubDate and link in ONE exact CDATA section. */
function rssItemText(entry: string, tag: "title" | "pubDate" | "link"): string {
  const matched = new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + tag + ">", "iu").exec(entry);
  if (!matched) return "";
  const raw = matched[1].trim();
  if (raw.startsWith("<![CDATA[")) {
    const cdata = /^<!\[CDATA\[([\s\S]{1,1600})\]\]>$/u.exec(raw);
    return cdata?.[1]?.trim() ?? "";
  }
  return raw;
}

/**
 * UN News feed routing paths are not original articles. Resolve them ONLY
 * through matching same-publisher isPermaLink GUIDs with identical story IDs.
 * No redirects, off-host identity or retrieval-clock substitution.
 */
function originalRssArticleLink(entry: string, def: OriginalFeed): string {
  const link = rssItemText(entry, "link");
  if (def.family !== "un_news_original_publisher") return link;
  try {
    const router = new URL(link);
    if (router.protocol !== "https:" || router.hostname !== "news.un.org" ||
        router.username || router.password || router.port || router.hash) return "";
    if (/^\/en\/story\/\d{4}\/(?:0?[1-9]|1[0-2])\/[a-z0-9][a-z0-9-]{2,160}\/?$/u.test(router.pathname))
      return link;
    if (router.search) return "";
    const routed = /^\/feed\/view\/en\/story\/(\d{4})\/(0?[1-9]|1[0-2])\/(\d{5,12})\/?$/u.exec(router.pathname);
    if (!routed) return "";
    const guidTag = /<guid\b([^>]*)>([\s\S]*?)<\/guid>/iu.exec(entry);
    if (!guidTag || !/\bisPermaLink\s*=\s*["']true["']/iu.test(guidTag[1])) return "";
    const raw = guidTag[2].trim();
    const unwrapped = raw.startsWith("<![CDATA[")
      ? /^<!\[CDATA\[([\s\S]{1,1600})\]\]>$/u.exec(raw)?.[1]?.trim() : raw;
    if (!unwrapped) return "";
    const canonical = new URL(unwrapped);
    if (canonical.protocol !== "https:" || canonical.hostname !== "news.un.org" ||
        canonical.username || canonical.password || canonical.port ||
        canonical.search || canonical.hash) return "";
    const id = /^\/en\/story\/(\d{4})\/(0?[1-9]|1[0-2])\/(\d{5,12})\/?$/u.exec(canonical.pathname);
    if (!id || id[1] !== routed[1] || Number(id[2]) !== Number(routed[2]) ||
        id[3] !== routed[3]) return "";
    return canonical.toString();
  } catch {
    return "";
  }
}

// Trusted first-party RSS/Atom item summaries may carry exact subject/topic
// omitted from the headline. Bound parsing to 600 characters of item metadata;
// never use unrelated feed-level descriptions, updated clocks or linked pages.
function originalItemSummary(entry:string, atom:boolean):string {
  const tag=atom?"summary":"description";
  const matched=new RegExp("<(?:atom:)?"+tag+"(?:\\s[^>]*)?>([\\s\\S]{0,3000}?)<\\/(?:atom:)?"+tag+">","iu").exec(entry);
  if(!matched)return "";
  const raw=matched[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/u,"$1");
  return raw.replace(/<[^>]*>/gu," ")
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/giu," ")
    .replace(/\s+/gu," ").trim().slice(0,600);
}

/**
 * Narrow documented GOV.UK public Search API fallback when a first-party
 * organisational Atom feed returns no query-relevant item. Search results
 * NEVER prove original publication: only the GOV.UK original article page
 * and its exact first-published metadata may advance a candidate privately.
 */
async function govukOriginalSearch(
  def:OriginalFeed,countryIso3:string,countryNameValue:string,
  fetchImpl:typeof fetch,topics:readonly string[],mineral:OnDemandMineral|null,
):Promise<OriginalFeedResult> {
  if(def.media!=="search")throw Error("ON_DEMAND_GOVUK_SEARCH_SCOPE_INVALID");
  const org=def.domain==="geopolitics"?"foreign-commonwealth-development-office":
    def.domain==="macro"?"hm-treasury":
    "department-for-business-innovation-science-and-trade";
  const subject=countryIso3==="RUS"?"Russia":
    countryIso3==="IRN"?"Iran":countryIso3==="GBR"?"UK":countryNameValue;
  // Fixed identifiers are derived from validated ISO3 and enumerated topics,
  // not forwarded from the customer's freeform question.
  const words=def.domain==="rare_earth" && mineral ? mineral:
    def.domain==="geopolitics" && topics.includes("sanctions_restrictions")
      ? "sanctions":def.domain==="macro" ? "economic":"critical minerals";
  const query=def.domain==="rare_earth" && countryIso3==="GBR" && mineral
    ? mineral:subject+" "+words;
  const url=new URL(def.url);
  url.searchParams.set("q",query);
  url.searchParams.set("count","10");
  url.searchParams.set("order","-public_timestamp");
  url.searchParams.set("filter_organisations",org);
  url.searchParams.set("fields","title,description,link");
  const body=await boundedFetch(fetchImpl,url.toString(),"application/json");
  const parsed:unknown=JSON.parse(body);
  const results=parsed && typeof parsed==="object" &&
    Array.isArray((parsed as {results?:unknown}).results)
      ? (parsed as {results:unknown[]}).results.slice(0,10):[];
  const audit={inspected:0,native_dated:0,country_mentioned:0,
    scope_matched:0,eligible_pub_date:0,allowed_article_paths:0};
  const candidates:PrivateOriginalCandidate[]=[];
  for(const item of results){
    audit.inspected++;
    if(!item || typeof item!=="object")continue;
    const row=item as {title?:unknown;description?:unknown;link?:unknown};
    if(typeof row.title!=="string" || row.title.length<8 ||
      row.title.length>300 || typeof row.link!=="string")continue;
    const title=row.title.replace(/\s+/gu," ").trim();
    const description=typeof row.description==="string"
      ? row.description.replace(/\s+/gu," ").slice(0,500):"";
    const countryMention=originalHeadlineMentionsCountry(title,countryIso3,countryNameValue) ||
      originalHeadlineMentionsCountry(description.slice(0,300),countryIso3,countryNameValue);
    if(countryMention)audit.country_mentioned++;
    const subjectScope=title+" "+description;
    const matches=def.topic.test(subjectScope) &&
      matchesRequestedTopic(subjectScope,def.domain,topics) &&
      (!mineral || def.domain!=="rare_earth" ||
        MINERAL_TERMS.some(t=>t.value===mineral && t.pattern.test(subjectScope)));
    if(countryMention && matches)audit.scope_matched++;
    if(!countryMention || !matches || !row.link.startsWith("/government/"))continue;
    const article_url=originalArticleUrl("https://www.gov.uk"+row.link,def);
    if(!article_url)continue;
    audit.allowed_article_paths++;
    const article_identity_sha256=digest(def.family+"|"+article_url);
    if(candidates.some(x=>x.article_identity_sha256===article_identity_sha256))continue;
    candidates.push({
      domain:def.domain,publisher_family:def.family,article_url,article_title:title,
      item_scoped_summary_private:description,
      feed_item_published_at:null,search_index_original_page_pending:true,
      article_identity_sha256,first_party_article_url_verified:true,
      source_native_feed_publication_date_verified:false,
      publisher_article_page_date_verified:false,
      independent_same_event_verified:false,derived_commercial_rights_verified:false,
      score_verified:false,signed_gro_verified:false,paid_delivery_allowed:false,
    });
    if(candidates.length>=2)break;
  }
  return {probe:{...probe(def.family,candidates.length,false),feed_audit:audit},
    private_candidates:candidates};
}

type OriginalFeedResult={probe:SourceProbe;private_candidates:PrivateOriginalCandidate[]};
async function originalOfficialFeed(
  def:OriginalFeed,countryIso3:string,countryNameValue:string,
  fetchImpl:typeof fetch,now:Date,mineral:OnDemandMineral|null,
  topics:readonly string[]=[],maxAgeMs=ONE_DAY_MS,
):Promise<OriginalFeedResult>{
  let xml: string;
  try {
    xml = await boundedFetch(fetchImpl,def.url,
      "application/rss+xml,application/atom+xml,application/xml");
  } catch (error) {
    const retryable = error instanceof Error &&
      ["ON_DEMAND_SOURCE_TRANSPORT_FAILURE","ON_DEMAND_SOURCE_TRANSIENT_HTTP"]
        .includes(error.message);
    if (!retryable ||
        !["un_news_original_publisher","australian_industry_original_publisher"]
          .includes(def.family) || !def.alternateUrl) throw error;
    // One exact same-publisher alternate (UN News or Australia Industry);
    // never count this as corroboration or bypass an explicit 401/403/429.
    // No retry for malformed XML, oversized responses or bad publication.
    xml = await boundedFetch(fetchImpl,def.alternateUrl,
      "application/rss+xml,application/atom+xml,application/xml");
  }
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
  const audit={inspected:0,native_dated:0,country_mentioned:0,
    scope_matched:0,eligible_pub_date:0,allowed_article_paths:0};
  for(const [,entry] of entries.slice(0,80)){
    audit.inspected++;
    const title=atom
      ? /<(?:atom:)?title(?:\s[^>]*)?>([^<]{1,300})<\/(?:atom:)?title>/iu.exec(entry)?.[1] ?? ""
      : rssItemText(entry,"title");
    const date=atom
      ? /<(?:atom:)?published(?:\s[^>]*)?>([^<]+)<\/(?:atom:)?published>/iu.exec(entry)?.[1] ?? ""
      : rssItemText(entry,"pubDate");
    // A different mineral's article must not qualify as evidence for this
    // query just because both are under the broad Critical Minerals topic.
    const summary=originalItemSummary(entry,atom);
    const contextualText=(title+" "+summary).slice(0,850);
    const mineralMatches = !mineral || def.domain !== "rare_earth" ||
      MINERAL_TERMS.some((term) => term.value === mineral && term.pattern.test(contextualText));
    const hasNativeDate=freshPublished(date,now,maxAgeMs);
    if(date.trim())audit.native_dated++;
    const matchedCountry=originalHeadlineMentionsCountry(title,countryIso3,countryNameValue) ||
      originalHeadlineMentionsCountry(summary.slice(0,300),countryIso3,countryNameValue);
    if(matchedCountry)audit.country_mentioned++;
    const matchedScope=def.topic.test(contextualText) &&
      matchesRequestedTopic(contextualText,def.domain,topics) && mineralMatches;
    if(matchedCountry && matchedScope)audit.scope_matched++;
    const undatedGovukAtom=atom && !date.trim() &&
      ["uk_fcdo_original_publisher","uk_dbt_original_publisher",
       "uk_ofsi_original_publisher","uk_desnz_original_publisher","uk_hmt_original_publisher"].includes(def.family);
    // Missing Atom <published> may enter PRIVATE article-page verification,
    // not score/payment. Never accept <updated>, bad/missing RSS clocks, or
    // a stale/future <published> as original source time.
    if (!matchedCountry || !matchedScope || (!hasNativeDate && !undatedGovukAtom)) continue;
    audit.eligible_pub_date++;
    let href="";
    if(atom){
      const links=[...entry.matchAll(/<(?:atom:)?link\b([^>]*?)\/?\s*>/giu)];
      const first=links.find(x=>{
        const rel=/\brel\s*=\s*["']([^"']+)["']/iu.exec(x[1])?.[1] ?? "alternate";
        return rel==="alternate"||rel==="canonical";
      });
      href=first ? /\bhref\s*=\s*["']([^"']+)["']/iu.exec(first[1])?.[1] ?? "" : "";
    }else {
      href=originalRssArticleLink(entry,def);
    }
    const article_url=originalArticleUrl(href,def);
    if(!article_url)continue;
    audit.allowed_article_paths++;
    if(candidates.length>=4)continue; // fixed private evidence budget/issuer
    const article_title=title.replace(/\s+/gu," ").trim();
    const article_identity_sha256=digest(def.family+"|"+article_url);
    if(candidates.some(x=>x.article_identity_sha256===article_identity_sha256))
      continue; // Same publisher URL in a second feed entry is one article.
    candidates.push({
      domain:def.domain,publisher_family:def.family,article_url,article_title,
      item_scoped_summary_private:summary,
      feed_item_published_at:hasNativeDate?new Date(Date.parse(date)).toISOString():null,
      ...(undatedGovukAtom?{undated_atom_original_page_pending:true as const}:{}),
      article_identity_sha256,
      first_party_article_url_verified:true,
      source_native_feed_publication_date_verified:hasNativeDate,
      publisher_article_page_date_verified:false,
      independent_same_event_verified:false,
      derived_commercial_rights_verified:false,
      score_verified:false,
      signed_gro_verified:false,
      paid_delivery_allowed:false,
    });
  }
  return {probe:{...probe(def.family,candidates.length,
    candidates.some(x=>x.source_native_feed_publication_date_verified)),
    feed_audit:audit},
    private_candidates:candidates};
}

/**
 * Private narrow duplicate guard: different publisher feeds may carry the
 * exact same headline about the same domain at nearly the same original time.
 * Such syndication is one prospective story, not independent corroboration.
 * Never fuzzy-merge generic related articles, or dedup across risk domains.
 * The original source input retains its original item-native timestamp.
 */
export function deduplicateOnDemandOriginalHeadlines(
  candidates:readonly PrivateOriginalCandidate[],
):{
  unique_candidates:PrivateOriginalCandidate[];
  // Different original articles remain eligible for independent PRIVATE
  // page-date/claim review, even when the public story is deduplicated.
  // Same-title syndication NEVER counts as independent confirmation.
  original_review_candidates:PrivateOriginalCandidate[];
  duplicate_headlines_removed:number;
}{
  if(candidates.length>16)throw Error("ON_DEMAND_PRIVATE_CANDIDATE_BUDGET_INVALID");
  const unique_candidates:PrivateOriginalCandidate[]=[];
  let duplicate_headlines_removed=0;
  const original_review_candidates:PrivateOriginalCandidate[]=[];
  const headline=(title:string)=>
    title.normalize("NFKC").toLocaleLowerCase("en-US")
      .replace(/\s+/gu," ").trim();
  for(const item of candidates){
    const time=item.feed_item_published_at===null?NaN:
      Date.parse(item.feed_item_published_at);
    const def=[...ORIGINAL_FALLBACK_FEEDS,...GOVUK_SEARCH_FALLBACKS].find(x=>
      x.domain===item.domain && x.family===item.publisher_family);
    const nativeDated=item.source_native_feed_publication_date_verified===true &&
      Number.isFinite(time) && item.undated_atom_original_page_pending!==true;
    const undatedReview=def?.media==="atom" &&
      ["uk_fcdo_original_publisher","uk_dbt_original_publisher",
       "uk_ofsi_original_publisher","uk_desnz_original_publisher","uk_hmt_original_publisher"]
        .includes(item.publisher_family) &&
      item.undated_atom_original_page_pending===true &&
      item.feed_item_published_at===null &&
      item.source_native_feed_publication_date_verified===false;
    const searchReview=def?.media==="search" &&
      item.search_index_original_page_pending===true &&
      item.feed_item_published_at===null &&
      item.source_native_feed_publication_date_verified===false;
    // Preserve established native-dated candidate dedup contracts.
    // Enforce fixed issuer/host/path and exact SHA binding additionally ONLY
    // on the new missing-<published> GOV.UK Atom rescue path.
    const reviewedUndated=(undatedReview===true || searchReview===true) && !!def &&
      originalArticleUrl(item.article_url,def)===item.article_url &&
      item.article_identity_sha256===digest(def.family+"|"+item.article_url);
    if((!nativeDated&&!reviewedUndated)||
       !item.first_party_article_url_verified||
       !/^[a-f0-9]{64}$/.test(item.article_identity_sha256) ||
       item.paid_delivery_allowed!==false || item.signed_gro_verified!==false)
      continue;
    original_review_candidates.push(item);
    const duplicate=unique_candidates.some(previous=>
      previous.domain===item.domain &&
      headline(previous.article_title)===headline(item.article_title) &&
      nativeDated &&
      previous.source_native_feed_publication_date_verified===true &&
      previous.feed_item_published_at!==null &&
      Math.abs(Date.parse(previous.feed_item_published_at)-time)<=30*60*1000);
    if(duplicate)duplicate_headlines_removed++;
    else unique_candidates.push(item);
  }
  return {unique_candidates,original_review_candidates,duplicate_headlines_removed};
}

/** Never returns upstream text, URLs or source identities for paid output. */
async function discoverOnDemandImpl(
  input: OnDemandSearchInput,
  options: {fetchImpl?:typeof fetch; now?:Date; disableDiscoveryIndex?:boolean}={},
): Promise<{
  discovery:OnDemandDiscovery;
  private_candidates:PrivateOriginalCandidate[];
  // Strictly private independent original pages; never return in discovery.
  private_original_review_candidates:PrivateOriginalCandidate[];
  duplicate_original_headline_count:number;
  private_macro_changes:PrivateOfficialMacroChange[];
  private_macro_qualifications:PrivateMacroQualification[];
  /** Private first-party World Bank country identity; never in public discovery. */
  private_verified_country_name:string|null;
}> {
  const now=options.now ?? new Date(), fetchImpl=options.fetchImpl ?? fetch;
  const topics=input.topics??[];
  const allowedTopics=["sanctions_restrictions","conflict_geopolitics",
    "political_governance","macro_risk","sovereign_risk",
    "fx_external_risk","critical_minerals","hot_topics"];
  if(!Array.isArray(topics)||topics.length>8||
    topics.some(topic=>!allowedTopics.includes(topic)))
    throw Error("ON_DEMAND_TOPICS_INVALID");
  const newsMaxAgeMs=input.max_age_seconds===undefined?ONE_DAY_MS:
    Number.isInteger(input.max_age_seconds)&&input.max_age_seconds>0
      ? Math.min(MAX_NEWS_AGE_MS,input.max_age_seconds*1000):0;
  if(newsMaxAgeMs===0)throw Error("ON_DEMAND_FRESHNESS_INVALID");
  let networkAttempts=0;
  const trackedFetch:typeof fetch=(async (target,init)=>{
    const upstream=new URL(String(target));
    // Defense in depth: this wrapper must never become a variable-origin
    // proxy even if future callers bypass boundedFetch's own allowlist.
    const permittedHosts=["api.worldbank.org","api.gdeltproject.org",
      "api.reliefweb.int","www.gov.uk","news.un.org",
      "www.federalreserve.gov","www.ecb.europa.eu",
      "www.minister.industry.gov.au"];
    if(upstream.protocol!=="https:" || !permittedHosts.includes(upstream.hostname) ||
       upstream.username || upstream.password || upstream.port || upstream.hash)
      throw Error("ON_DEMAND_SOURCE_ORIGIN_NOT_ALLOWED");
    const host=upstream.hostname;
    // Per-worker provider cool-down limits calls after explicit denial.
    // A different publisher stays available; no mirrors for denied APIs.
    if(options.fetchImpl===undefined && (providerCooldownUntil.get(host)??0)>Date.now())
      throw Error("ON_DEMAND_PROVIDER_COOLDOWN");
    if(networkAttempts>=12)
      throw Error("ON_DEMAND_NETWORK_BUDGET_EXHAUSTED");
    networkAttempts++;
    const response=await fetchImpl(target,init);
    if(options.fetchImpl===undefined && response.status===429)
      providerCooldownUntil.set(host,Date.now()+
        retryAfterCooldownMs(response.headers.get("retry-after")));
    if(options.fetchImpl===undefined && response.status===403)
      providerCooldownUntil.set(host,Date.now()+RATE_LIMIT_COOLDOWNS_MS[403]);
    return response;
  }) as typeof fetch;
  if(!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw Error("ON_DEMAND_CLOCK_INVALID");
  const country = iso3(input.country_iso3);
  if (!Array.isArray(input.categories) || input.categories.length < 1 ||
      input.categories.length > 3 ||
      input.categories.some(v => !DOMAINS.includes(v)) ||
      new Set(input.categories).size !== input.categories.length)
    throw Error("ON_DEMAND_CATEGORIES_INVALID");
  const categories = [...input.categories].sort();
  const mineral = input.mineral ?? null;
  if (mineral !== null &&
      (!categories.includes("rare_earth") ||
       !MINERAL_TERMS.some((term) => term.value === mineral)))
    throw Error("ON_DEMAND_MINERAL_SCOPE_INVALID");
  // Always bound fan-out; missing country metadata is not substituted by an
  // ungrounded guessed country name.
  let name: string;
  try { name = await countryName(country,trackedFetch); }
  catch { name = ""; }
  const gdeltDeadline=Date.now()+12_000;
  const tasks: Array<{name:string;category:OnDemandCategory;run:()=>Promise<SourceProbe|OriginalFeedResult|PrivateMacroResult>}> = [];
  const approvedReliefAppname=approvedReliefWebAppname();
  if (name && !options.disableDiscoveryIndex) for (const category of categories) {
    tasks.push({name:"gdelt_doc_discovery",category,run:()=>gdelt(category,name,trackedFetch,mineral,topics,country,newsMaxAgeMs,gdeltDeadline)});
    // ReliefWeb changed to pre-approved appnames in Nov 2025. A pending
    // account approval must not generate repeat 403s on every user query.
    if (category==="geopolitics" && approvedReliefAppname)
      tasks.push({name:"reliefweb_discovery",category,run:()=>
        reliefWeb(name,trackedFetch,now,approvedReliefAppname,newsMaxAgeMs)});
  }
  if (name) for (const source of ORIGINAL_FALLBACK_FEEDS) {
    if(!topics.length && ["uk_ofsi_original_publisher","ecb_original_publisher",
      "uk_desnz_original_publisher","uk_hmt_original_publisher"].includes(source.family)) continue;
    if (categories.includes(source.domain) &&
        (!source.scopedTopics || !topics.length ||
         source.scopedTopics.some(t=>topics.includes(t)))) tasks.push({
      name:source.family,category:source.domain,
      run:()=>originalOfficialFeed(
        source.family==="uk_dbt_original_publisher" && topics.length>0
          ? {...source,url:"https://www.gov.uk/government/organisations/department-for-business-innovation-science-and-trade.atom"}
          : source,
        country,name,trackedFetch,now,mineral,topics,newsMaxAgeMs),
    });
  }
  if (categories.includes("macro")) for (const indicator of [
    "FP.CPI.TOTL.ZG","NY.GDP.MKTP.KD.ZG",
  ] as const) tasks.push({name:"world_bank_official_" + indicator,category:"macro",
    run:()=>worldBank(country,indicator,trackedFetch,now)});
  // Exactly one fixed metadata lookup + at most eleven provider requests,
  // no 195-country fanout and no user question passed upstream.
  // One country GET + at most eleven provider GETs. Prioritize annual macro
  // observables when optional approvals increase the configured fanout.
  const maxPrimary=topics.length?11-Math.min(categories.length,3):11;
  // An explicit cross-category question must not silently send all index
  // requests to only the first alphabetic category, or starve a category's
  // original publisher when the fixed request budget is tight. Reserve one
  // original publisher AND one optional discovery index per requested category,
  // retaining official annual macro reads and the existing <=12 total limit.
  // Unscoped legacy requests keep their existing selection/order intact.
  const selected=topics.length>0 && categories.length>1
    ? (()=>{
      const macro=tasks.filter(t=>t.name.startsWith("world_bank_official_"));
      const originals=categories.map(category=>tasks.find(t=>
        t.category===category && t.name!=="gdelt_doc_discovery" &&
        t.name!=="reliefweb_discovery" &&
        !t.name.startsWith("world_bank_official_"))).filter(
          (t):t is (typeof tasks)[number]=>Boolean(t));
      const indexes=categories.map(category=>tasks.find(t=>
        t.category===category && t.name==="gdelt_doc_discovery")).filter(
          (t):t is (typeof tasks)[number]=>Boolean(t));
      const primary=[...new Set([...macro,...originals,...indexes])];
      return [...primary,...tasks.filter(t=>!primary.includes(t))].slice(0,maxPrimary);
    })()
    : tasks.length>maxPrimary
      ? [...tasks.filter(t=>t.name.startsWith("world_bank_official_")),
         ...tasks.filter(t=>!t.name.startsWith("world_bank_official_"))].slice(0,maxPrimary)
      : tasks;
  // A single user query never bursts 2-3 category-index calls into GDELT
  // simultaneously. A real 429/403 on the FIRST scoped index suppresses
  // subsequent GDELT calls *for this request only*. Other independently
  // approved original publishers remain concurrent and unaffected.
  let gdeltDenied=false;
  let gdeltQueue:Promise<void>=Promise.resolve();
  const runPrimary=(task:(typeof tasks)[number])=>{
    if(task.name!=="gdelt_doc_discovery")return task.run();
    const pending=gdeltQueue.then(async()=>{
      if(gdeltDenied || gdeltDeadline-Date.now()<250){
        return {...probe("gdelt_doc_discovery",0,false),attempted:false,
          reachable:false,retrieval_state:"COOLDOWN_ACTIVE" as const};
      }
      try{return await task.run();}
      catch(error){
        if(error instanceof Error &&
          ["ON_DEMAND_SOURCE_RATE_LIMITED","ON_DEMAND_SOURCE_ACCESS_RESTRICTED",
           "ON_DEMAND_PROVIDER_COOLDOWN"].includes(error.message))
          gdeltDenied=true;
        throw error;
      }
    });
    gdeltQueue=pending.then(()=>{},()=>{});
    return pending;
  };
  const settled=await Promise.allSettled(selected.map(runPrimary));
  const source_probes:SourceProbe[]=settled.map((result,i)=>{
    const row = result.status==="rejected" ? failed(selected[i].name,result.reason) :
      "probe" in result.value ? result.value.probe : result.value;
    return {...row,category:selected[i].category};
  });
  const fallbackIssuerGroups:PrivateOriginalCandidate[][]=[];
  // If a selected original publisher fails or returns zero matching records,
  // try another already registered original institution within the SAME
  // twelve-request budget. Do not promote GDELT index links to originals, and
  // do not turn a source outage into a positive coverage claim.
  if(name && topics.length>0 && categories.length>1){
    for(const category of categories){
      const hasOriginal=()=>settled.some(result=>
        result.status==="fulfilled" &&
        "private_candidates" in result.value &&
        result.value.private_candidates.some(item=>item.domain===category)) ||
        fallbackIssuerGroups.some(group=>group.some(item=>item.domain===category));
      if(hasOriginal()||networkAttempts>=12)continue;
      const alternates=tasks.filter(t=>
        t.category===category && !selected.includes(t) &&
        t.name!=="gdelt_doc_discovery" && t.name!=="reliefweb_discovery" &&
        !t.name.startsWith("world_bank_official_"));
      for(const alternate of alternates){
        if(networkAttempts>=12)break;
        try{
          const found=await alternate.run();
          if(!("private_candidates" in found))continue;
          source_probes.push({...found.probe,category});
          if(found.private_candidates.length>0){
            fallbackIssuerGroups.push(found.private_candidates);
            break;
          }
        }catch(error){
          source_probes.push({...failed(alternate.name,error),category});
        }
      }
    }
  }
  // A reachable 2xx feed with zero exact-topic records is a valid search
  // miss, not proof the original publisher has no matching article.
  // Reuse one bounded public issuer search only when the original feed mesh
  // found nothing relevant to this country/commodity.
  if(name && topics.length>0)for(const category of categories){
    const originalPresent=settled.some(result=>
      result.status==="fulfilled" &&
      "private_candidates" in result.value &&
      result.value.private_candidates.some(item=>item.domain===category)) ||
      fallbackIssuerGroups.some(group=>group.some(item=>item.domain===category));
    if(originalPresent || networkAttempts>=12)continue;
    const def=GOVUK_SEARCH_FALLBACKS.find(item=>item.domain===category)!;
    try {
      const found=await govukOriginalSearch(def,country,name,trackedFetch,topics,mineral);
      source_probes.push({...found.probe,category});
      if(found.private_candidates.length>0)
        fallbackIssuerGroups.push(found.private_candidates);
    }catch(error){
      source_probes.push({...failed(def.family,error),category});
    }
  }
  // Never persist, log, or expose raw first-party titles/articles here.
  // Every candidate requires the later governed article-page/rights/signing
  // stages; each source institution stays independently identified.
  const issuerCandidateGroups=[
    ...settled.flatMap(result=>
      result.status==="fulfilled" && "private_candidates" in result.value
        ? [result.value.private_candidates] : []),
    ...fallbackIssuerGroups,
  ];
  const private_macro_changes=settled.flatMap(result=>
    result.status==="fulfilled" && "private_macro_changes" in result.value
      ? result.value.private_macro_changes : []);
  const private_macro_qualifications=settled.flatMap(result=>
    result.status==="fulfilled" && "private_macro_qualification" in result.value
      ? [result.value.private_macro_qualification] : []);
  const private_candidates:PrivateOriginalCandidate[]=[];
  // Round-robin preserves distinct publisher families and all 3 categories
  // under heavy news flow; a dominant feed cannot starve a later independent
  // original source of the 16-entry bounded producer budget.
  for(let i=0;i<4 && private_candidates.length<16;i++) {
    for(const issuer of issuerCandidateGroups) {
      if(private_candidates.length>=16)break;
      if(issuer[i])private_candidates.push(issuer[i]);
    }
  }
  // The same GDELT producer searched for 3 different topics is ONE family,
  // and two World Bank indicator requests are ONE official institution.
  const reached=new Set(source_probes.filter(p=>p.reachable).map(p=>
    p.family.startsWith("world_bank_official_") ? "world_bank_official" :
    p.family==="uk_fcdo_search_original_page" ? "uk_fcdo_original_publisher":
    p.family==="uk_hmt_search_original_page" ? "uk_hmt_original_publisher":
    p.family==="uk_dbt_search_original_page" ? "uk_dbt_original_publisher":
    p.family)).size;
  const grouped=deduplicateOnDemandOriginalHeadlines(private_candidates);
  const discovery:OnDemandDiscovery={
    schema:"geomacro.on-demand-global-private-discovery.v1",
    country_iso3:country,categories,checked_at:now.toISOString(),
    searched_in_parallel:true,network_attempts:networkAttempts,
    reached_source_families:reached,source_probes,
    // Preserve existing fingerprints for country/category-only requests.
    query_fingerprint_sha256:digest(JSON.stringify(
      topics.length>0 || input.max_age_seconds!==undefined
        ? [country,categories,mineral,[...topics].sort(),newsMaxAgeMs]
        : mineral ? [country,categories,mineral] : [country,categories])),
    status:reached>0?"DISCOVERY_OBSERVED_NOT_YET_VERIFIED":"DISCOVERY_DEGRADED",
    independent_same_event_corroboration_verified:false,
    source_derived_commercial_rights_verified:false,
    signed_derived_intelligence_created:false,payable:false,
    raw_upstream_delivered:false,supabase_requests:0,b2_requests:0,
    settlement_attempted:false,
  };
  return {
    discovery,private_candidates:grouped.unique_candidates,
    private_original_review_candidates:grouped.original_review_candidates,
    duplicate_original_headline_count:grouped.duplicate_headlines_removed,
    private_macro_changes,
    private_macro_qualifications,
    private_verified_country_name:name||null,
  };
}


/**
 * PRIVATE next step: match first-party article-page publication metadata
 * against its own feed date, without creating a paid or signed intelligence
 * product. Bound to four HTTPS reads; raw HTML never leaves request memory.
 */
export type PrivatePageDatedOriginal = Omit<
  PrivateOriginalCandidate, "publisher_article_page_date_verified"
> & { publisher_article_page_date_verified: true; page_original_published_at: string };

export type PrivatePageDateResult = {
  attempted: number;
  verified: number;
  verified_candidates: PrivatePageDatedOriginal[];
};

const MAX_ARTICLE_PAGE_PROBES = 4;
// Do not maintain a second, permissive on-demand <meta> scraper. The shared
// first-party verifier rejects conflicting originals, date-only, missing
// timezone, future/stale release clocks and updated/modified dates. Article
// feed timestamps are cross-checked separately below.

/** Internal-only evidence continuation; never serialize verified_candidates. */
export async function verifyOnDemandOriginalArticlePages(
  candidates: readonly PrivateOriginalCandidate[],
  options: {fetchImpl?:typeof fetch; now?:Date; maxAgeSeconds?:number}={},
): Promise<PrivatePageDateResult> {
  const now=options.now ?? new Date();
  const maxAgeMs=options.maxAgeSeconds===undefined?ONE_DAY_MS:
    Math.min(MAX_NEWS_AGE_MS,options.maxAgeSeconds*1000);
  if(!Number.isFinite(now.getTime()) || !Number.isFinite(maxAgeMs) || maxAgeMs<=0)
    throw Error("ON_DEMAND_CLOCK_INVALID");
  const eligible=candidates.slice(0,16).filter((candidate)=>{
    const def=[...ORIGINAL_FALLBACK_FEEDS,...GOVUK_SEARCH_FALLBACKS].find((feed)=>
      feed.family===candidate.publisher_family && feed.domain===candidate.domain);
    return !!def &&
      originalArticleUrl(candidate.article_url,def)===candidate.article_url &&
      candidate.article_identity_sha256===digest(def.family+"|"+candidate.article_url) &&
      candidate.first_party_article_url_verified===true &&
      (
        (candidate.source_native_feed_publication_date_verified===true &&
         candidate.feed_item_published_at!==null &&
         freshPublished(candidate.feed_item_published_at,now,maxAgeMs) &&
         candidate.undated_atom_original_page_pending!==true) ||
        (def.media==="atom" &&
         ["uk_fcdo_original_publisher","uk_dbt_original_publisher",
       "uk_ofsi_original_publisher","uk_desnz_original_publisher","uk_hmt_original_publisher"]
           .includes(def.family) &&
         candidate.source_native_feed_publication_date_verified===false &&
         candidate.feed_item_published_at===null &&
         candidate.undated_atom_original_page_pending===true) ||
        (def.media==="search" && candidate.search_index_original_page_pending===true &&
         candidate.feed_item_published_at===null &&
         candidate.source_native_feed_publication_date_verified===false)
      );
  });
  const chosen:PrivateOriginalCandidate[]=[];
  const used=new Set<string>();
  const add=(candidate:PrivateOriginalCandidate)=>{
    if(chosen.length>=MAX_ARTICLE_PAGE_PROBES ||
       used.has(candidate.publisher_family))return;
    chosen.push(candidate);
    used.add(candidate.publisher_family);
  };
  // One issuer per category first, then remaining distinct publishers.
  for(const domain of ["geopolitics","macro","rare_earth"] as const){
    const next=eligible.find(x=>x.domain===domain && !used.has(x.publisher_family));
    if(next)add(next);
  }
  for(const candidate of eligible)add(candidate);

  const dates=await Promise.all(chosen.map(async(candidate)=>{
    try{
      const html=await boundedFetch(options.fetchImpl??fetch,candidate.article_url,"text/html");
      const originalDate=verifiedPublisherPageDate(html,now,null,{maxAgeMs});
      if(!originalDate || !freshPublished(originalDate,now,maxAgeMs) ||
        (candidate.feed_item_published_at!==null &&
         Math.abs(Date.parse(originalDate)-Date.parse(candidate.feed_item_published_at))>10*60*1000))
        return null;
      return {...candidate,publisher_article_page_date_verified:true as const,
        page_original_published_at:originalDate};
    }catch{
      // Redirect, source outage, oversized page or invalid clock => no proof.
      // Never log private originals, URLs or source payloads.
      return null;
    }
  }));
  const verified_candidates=dates.filter((c):c is PrivatePageDatedOriginal=>c!==null);
  return {attempted:chosen.length,verified:verified_candidates.length,verified_candidates};
}

/** Client-safe shape: no upstream article, URLs, text, or private evidence. */
export async function discoverOnDemandGlobal(
  input:OnDemandSearchInput,
  options:{fetchImpl?:typeof fetch;now?:Date;disableDiscoveryIndex?:boolean}={},
):Promise<OnDemandDiscovery>{
  return (await discoverOnDemandImpl(input,options)).discovery;
}

/**
 * PRIVATE INTERNAL producer interface for the same bounded one-shot fetch.
 * Never serialize this tuple to a customer, audit log or x402 quote.
 */
export async function discoverOnDemandForPrivateQualification(
  input:OnDemandSearchInput,
  options:{fetchImpl?:typeof fetch;now?:Date;disableDiscoveryIndex?:boolean}={},
):Promise<{
  discovery:OnDemandDiscovery;
  private_candidates:PrivateOriginalCandidate[];
  private_original_review_candidates:PrivateOriginalCandidate[];
  duplicate_original_headline_count:number;
  private_macro_changes:PrivateOfficialMacroChange[];
  private_macro_qualifications:PrivateMacroQualification[];
  private_verified_country_name:string|null;
}>{
  return discoverOnDemandImpl(input,options);
}
