import {fetchWithoutRedirectUsing} from "./fetch-without-redirect";
import {approvedOnDemandSourceHostname} from "../../scripts/lib/on-demand-source-origin-allowlist.mjs";
import {pinnedRbiPressReleaseLink} from "../../scripts/lib/rbi-official-macro-release.mjs";
import {GLOBAL_OFFICIAL_RELEASE_FEEDS,verifiedGlobalRdfFeed,globalOriginalArticleUrl,ieaMineralsIndexCandidates,verifiedIeaOriginalPublication} from '../../scripts/lib/global-official-release-feeds.mjs';
import { createHash } from "node:crypto";
import {indexedHeadlineMatchesOriginalPage,indexedPublisherHasOriginalMetaOutsideScripts} from "./on-demand-index-original-title.server";
import {fetchGdeltDocWithBudget,gdeltRetryAfterMs} from "../../scripts/lib/gdelt-doc-request-gate.mjs";
import { originalHeadlineMentionsCountry, originalPublisherMatchesCountry } from "./on-demand-original-subject-matching";
// One strict original-publication verifier for BOTH 30m and customer on-demand paths.
import { verifiedPublisherPageDate } from "../../scripts/lib/official-original-article-date.mjs";
import {pinnedGovUkContentApiUrl,verifiedGovUkContentFirstPublishedAt} from "../../scripts/lib/govuk-original-content-clock.mjs";
import { country195ByIso3 } from "./canonical-country-registry-195";
import { classifyGlobalEntity } from "./global-entity-classification";
import { verifiedFedBoardDiscountMinutesOriginal } from "./on-demand-fed-board-discount-release.server";
import { originalFedDiscountMinutesArchiveLinks } from "./on-demand-fed-official-archive.server";
import { canadaOriginalPublicationDay } from "./stateless-canada-original.server";

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
  // Private country binding is assigned ONLY after canonical ISO3 validation
  // and issuer-specific subject matching in the discovery engine.
  country_iso3?: string;
  publisher_family: string;
  article_url: string;
  article_title: string;
  // Only exact same-item original first-party feed summary or GOV.UK
  // first-party search description. Private, bounded and never returned
  // in public discovery, user payloads or audit logs.
  item_scoped_summary_private?: string;
  feed_item_published_at: string | null;
  // Never promote a feed <updated> as original publication. Only allowlisted
  // official original article pages may rescue an undated Atom lead.
  undated_atom_original_page_pending?: true;
  search_index_original_page_pending?: true;
  // An external index is only a private lead, never an original clock.
  index_original_page_pending?: true;
  official_archive_release_day?: string; // official issuer index day, never exact clock
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
  sanctions_restrictions:/\b(?:sanctions?|embargo(?:es)?|export controls?|trade restrictions?|investment restrictions?|asset freezes?|restrictive measures?)\b/iu,
  conflict_geopolitics:/\b(?:conflicts?|ceasefires?|wars?|militar(?:y|ies)|defen[cs]e|airstrikes?|missiles?|peace(?: talks?)?|security council|terror(?:ism|ist)|border clashes?|armed groups?|hostilities|troops?|treaties|diplomac(?:y|ies)|foreign ministr(?:y|ies))\b/iu,
  political_governance:/\b(?:governments?|governance|elections?|parliaments?|diplomatic|cabinet|political parties|constitutional|referendums?|presidential|legislative|regulator(?:y|s)|public administration)\b/iu,
  macro_risk:/\b(?:inflation|deflation|consumer prices?|producer prices?|cpi|pce|gdp|gross domestic product|monetary|central banks?|growth|interest rates?|discount rates?|econom(?:y|ic|ics)|financial|chancellor|treasury|tariffs?|trade flows?|trade balances?|trade deficits?|trade surpluses?|current accounts?|balance of payments|liquidity|banking|bond yields?|treasury yields?|purchasing managers? index|pmi|manufacturing|industrial production|commodity prices?|energy prices?|unemployment|wages?|payrolls?|employment|fiscal|debt|capital flows?|foreign exchange|exchange rates?|currencies|fx reserves?|foreign reserves|economic outlook|business confidence|retail sales|consumer spending|exports?|imports?)\b/iu,
  sovereign_risk:/\b(?:fiscal|sovereign|budgets?|government borrowing|public finances?|bond(?:s)?|debt(?: servicing| issuance| restructuring)?|deficits?|credit ratings?|treasury yields?|sovereign yields?|refinancing|default risk|public borrowing|government bonds?)\b/iu,
  fx_external_risk:/\b(?:foreign[- ]exchange|exchange rates?|currencies|currency|fx|fx reserves?|foreign reserves|reserve assets|balance of payments|current account|capital flows?|currency volatility|exchange markets?|foreign assets|cross[- ]border payments?)\b/iu,
  critical_minerals:/\b(?:critical minerals?|critical raw materials?|strategic minerals?|rare[- ]earth(?:s?| elements?)?|lanthanides?|lithium|cobalt|nickel|graphite|copper|gallium|germanium|antimony|tungsten|manganese|vanadium|scandium|tantalum|niobium|dysprosium|neodymium|terbium|praseodymium|samarium|yttrium|mineral supply|minerals? processing|mining|mine closures?|ore processing|smelting|refining|refineries|mineral exports?|permanent magnets?|magnet production|battery materials|national battery strateg(?:y|ies)|battery manufacturing accelerator|battery supply chains?|supply chains?|export controls?)\b/iu,
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

const GDELT_TOPIC_QUERY_TERMS:Readonly<Record<string,readonly string[]>>={
  sanctions_restrictions:["sanctions","embargo","export controls","trade restrictions"],
  conflict_geopolitics:["ceasefire","conflict","war","military","airstrike","peace","security council","border clashes","missiles"],
  political_governance:["elections","government","parliament","governance","diplomacy","foreign ministry"],
  macro_risk:["inflation","GDP","monetary","central bank","growth","interest rates","economy","financial","PMI","manufacturing","tariffs","trade flows","industrial production","commodity prices","energy prices","employment","unemployment","wages","exports","imports"],
  sovereign_risk:["fiscal","sovereign debt","budget deficit","bond yields","treasury yields","government borrowing","credit ratings","public debt"],
  fx_external_risk:["foreign exchange","exchange rates","currency","FX reserves","balance of payments","current account","capital flows"],
  critical_minerals:["critical minerals","critical raw materials","strategic minerals","rare earth","lithium","cobalt","nickel","graphite","copper","gallium","germanium","antimony","tungsten","manganese","vanadium","scandium","tantalum","niobium","neodymium","dysprosium","refining","mineral processing","permanent magnets","battery materials"],
};

/**
 * Scope a GDELT lead query to ALL reviewed fixed topics supplied for the
 * requested category. Do not let the first topic (e.g. sanctions) or a single
 * FX topic silently hide other country-specific macro/critical-mineral leads.
 * GDELT remains a discovery index; its links still need a pinned original
 * issuer, exact native publication clock and first-party article readback.
 */
export function buildCountryScopedGdeltTerms(
  category:OnDemandCategory,topics:readonly string[],
):string {
  const scoped=topics.filter(topic=>CATEGORY_TOPICS[category].includes(topic));
  const terms=[...new Set(scoped.flatMap(topic=>GDELT_TOPIC_QUERY_TERMS[topic]??[]))];
  return terms.length>0?"("+terms.join(" OR ")+")":SEARCH_TERMS[category];
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
  return gdeltRetryAfterMs(value,now);
}

async function boundedFetch(
  fetchImpl: typeof fetch, url: string, accept: string,
  timeoutMs = TIMEOUT_MS,
): Promise<string> {
  const target = new URL(url);
  // This whitelist is not caller configurable. Do not follow redirects to
  // arbitrary locations, signed querystrings, credentials or metadata IPs.
  if (target.protocol !== "https:" ||
      !approvedOnDemandSourceHostname(target.hostname) ||
      target.username || target.password || target.port || target.hash) {
    throw Error("ON_DEMAND_SOURCE_ORIGIN_NOT_ALLOWED");
  }
  const maxBytes = accept === "text/html" ? MAX_FIRST_PARTY_HTML_BYTES : MAX_BODY_BYTES;
  let response: Response;
  try {
    response = await fetchWithoutRedirectUsing(fetchImpl,url, {
      method: "GET",
      redirect: "error",
      headers: { Accept: accept },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch(error) {
    if(error instanceof Error&&error.message==="ON_DEMAND_PROVIDER_COOLDOWN")throw error;
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
  const country=String(value||"").toUpperCase();
  if(!/^[A-Z]{3}$/u.test(country))
    throw Error("ON_DEMAND_ISO3_INVALID");
  if(!country195ByIso3(country) &&
     classifyGlobalEntity(country)==="UNCLASSIFIED")
    throw Error("ON_DEMAND_COUNTRY_NOT_IN_CANONICAL_REGISTRY");
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
): Promise<OriginalFeedResult> {
  // GDELT is a discovery INDEX. Its "seendate" is NEVER original publication
  // and third-party discovery NEVER proves independent event corroboration.
  const scopedTerms=buildCountryScopedGdeltTerms(category,topics);
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
  const candidates:PrivateOriginalCandidate[]=[];
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
           !MINERAL_TERMS.some(term=>term.value===mineral&&term.pattern.test(row.title as string)))))
        continue;
      uniqueUrls.add(uri.href);
      // Reuse pinned issuer paths; third-party reports remain discovery counts.
      // Index headlines and seendate cannot authorize a dated original.
      const publisher=[...ORIGINAL_FALLBACK_FEEDS,...INTERNATIONAL_ORIGINAL_FEEDS]
        .find(def=>def.domain===category && originalArticleUrl(uri.href,def)!==null &&
          def.topic.test(row.title as string));
      if(uri.search || !publisher || candidates.length>=4 ||
         !originalHeadlineMentionsCountry(row.title,countryIso3,countryNameValue) ||
         !matchesRequestedTopic(row.title,category,topics) ||
         (category==="rare_earth" && mineral!==null &&
          !MINERAL_TERMS.some(t=>t.value===mineral&&t.pattern.test(row.title as string))))continue;
      const article_url=originalArticleUrl(uri.href,publisher);
      if(!article_url)continue;
      const article_identity_sha256=digest(publisher.family+"|"+article_url);
      if(candidates.some(c=>c.article_identity_sha256===article_identity_sha256))continue;
      candidates.push({domain:category,publisher_family:publisher.family,article_url,
        article_title:row.title.trim().slice(0,300),feed_item_published_at:null,
        index_original_page_pending:true,article_identity_sha256,
        first_party_article_url_verified:true,source_native_feed_publication_date_verified:false,
        publisher_article_page_date_verified:false,independent_same_event_verified:false,
        derived_commercial_rights_verified:false,score_verified:false,
        signed_gro_verified:false,paid_delivery_allowed:false});
    } catch { /* Reject an invalid upstream article URL. */ }
  }
  return {probe:probe("gdelt_doc_discovery",uniqueUrls.size,false),private_candidates:candidates};
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
  const parsedRows=Array.isArray(json)?json[1]:null;
  const isData=Array.isArray(parsedRows);
  const rows: unknown[] = isData ? parsedRows : [];
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
    topic:/\b(?:sanctions?|embargo(?:es)?|export controls?|trade restrictions?|conflict|ceasefire|war|military|defen[cs]e|security|peace|treaties|diplomac(?:y|ies)|foreign ministr(?:y|ies)|border clashes?|missiles?)\b/iu,
  },
  {
    domain:"macro",family:"uk_hmt_search_original_page",
    url:"https://www.gov.uk/api/search.json",
    media:"search",originalHost:"www.gov.uk",
    originalPath:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
    topic:/\b(?:econom(?:y|ic|ics)?|financial|chancellor|treasury|inflation|deflation|monetary|central banks?|interest rates?|foreign[- ]exchange|exchange rates?|currencies|fx reserves?|fiscal|sovereign|budgets?|debt|bond yields?|trade flows?|tariffs?|manufacturing|industrial production|pmi|commodity prices?|energy prices?|capital flows?|current account|balance of payments|exports?|imports?)\b/iu,
  },
  {
    domain:"rare_earth",family:"uk_dbt_search_original_page",
    url:"https://www.gov.uk/api/search.json",
    media:"search",originalHost:"www.gov.uk",
    originalPath:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
    topic:/\b(?:critical minerals?|critical raw materials?|strategic minerals?|rare[- ]earth(?:s?| elements?)?|lanthanides?|lithium|cobalt|nickel|graphite|copper|gallium|germanium|antimony|tungsten|manganese|vanadium|scandium|tantalum|niobium|dysprosium|neodymium|terbium|praseodymium|samarium|yttrium|mineral supply|minerals? processing|mining|ore processing|smelting|refining|refineries|permanent magnets?|magnet production|battery materials)\b/iu,
  },
];
const INTERNATIONAL_ORIGINAL_FEEDS:readonly OriginalFeed[]=GLOBAL_OFFICIAL_RELEASE_FEEDS.filter((s:{format:string})=>s.format!=='json').map(
  s=>({
    domain:s.category as OnDemandCategory,family:s.family,url:s.url,media:s.format==='rss'?'rss' as const:'search' as const,
    originalHost:s.host,originalPath:s.path,topic:s.topic,
  }));
const ORIGINAL_FALLBACK_FEEDS: readonly OriginalFeed[] = [
  {
    // Existing protected-main first-party RBI press RSS was independently
    // live checked, but item pubDates were missing. Feed entries are ONLY
    // index leads for exact native clock + HTML byte readback, NOT current
    // statistical values, source rights or paid intelligence.
    domain:"macro",family:"rbi_india_original_macro_publisher",
    url:"https://www.rbi.org.in/pressreleases_rss.xml",
    media:"rss",originalHost:"www.rbi.org.in",
    originalPath:/^\/Scripts\/BS_PressReleaseDisplay\.aspx$/u,
    topic:/\b(?:monetary|repo rate|reverse repo|liquidity|inflation|foreign exchange|currency|financial stability|bank rate|payment systems?|policy rates?|credit growth|exchange reserves?)\b/iu,
  },
  {
    domain:"rare_earth",family:"uk_dbt_original_publisher",
    url:"https://www.gov.uk/government/organisations/department-for-business-and-trade.atom",
    media:"atom",originalHost:"www.gov.uk",
    originalPath:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
    topic:/\b(?:critical minerals?|rare[- ]earths?|lithium|cobalt|nickel|graphite|copper|mineral supply|mining)\b/iu,
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
    topic:/\b(?:monetary policy|interest rates?|discount rates?|inflation|foreign exchange|economic activity|financial stability|liquidity|federal funds)\b/iu,
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
    topic:/\b(?:financial|econom|inflation|interest rates?|treasury|chancellor|monetary|foreign exchange|exchange rates?|currency|reserves?)\b/iu,
  },
  {
    domain:"macro",family:"ecb_original_publisher",
    url:"https://www.ecb.europa.eu/rss/press.html",
    // ECB itself publishes a separate official statistical press feed.
    // Backup only after transient transport/5xx, NOT 401/403/429 bypass.
    alternateUrl:"https://www.ecb.europa.eu/rss/statpress.html",
    media:"rss",originalHost:"www.ecb.europa.eu",
    originalPath:/^\/press\/(?:pr|key|inter|accounts)\/date\/\d{4}\//u,
    topic:/\b(?:monetary|inflation|interest rates?|foreign exchange|economic|currency)\b/iu,
  },
  {
    domain:"rare_earth",family:"uk_desnz_original_publisher",
    url:"https://www.gov.uk/government/organisations/department-for-energy-security-and-net-zero.atom",
    media:"atom",originalHost:"www.gov.uk",
    originalPath:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
    topic:/\b(?:critical minerals?|rare[- ]earths?|lithium|cobalt|nickel|graphite|copper|mineral supply|mining)\b/iu,
  },
  {
    // Reuse the original Natural Resources Canada Atom connector already
    // running in the Supabase-free website newsroom. A lead is never itself
    // signed, rights-certified or evidence of actual mineral output.
    domain:"rare_earth",family:"canada_nrcan_original_publisher",
    url:"https://api.io.canada.ca/io-server/gc/news/en/v2?dept=naturalresourcescanada&sort=publishedDate&orderBy=desc&publishedDate%3E=2021-07-23&pick=50&format=atom&atomtitle=Natural%20Resources%20Canada",
    media:"atom",originalHost:"www.canada.ca",
    originalPath:/^\/en\/natural-resources-canada\/news\/20\d{2}\/(?:0[1-9]|1[0-2])\/[a-z0-9-]+\.html$/u,
    topic:/\b(?:critical minerals?|rare[- ]earths?|lithium|cobalt|nickel|graphite|copper|mineral supply|mining|mineral processing)\b/iu,
  },
  {
    domain:"rare_earth",family:"australian_industry_original_publisher",
    url:"https://www.minister.industry.gov.au/feed/t-ayres/rss.xml",
    // Official all-minister media releases from the same government publisher;
    // this is transport resilience, NOT independent source corroboration.
    alternateUrl:"https://www.minister.industry.gov.au/feed/media-releases/rss.xml",
    media:"rss",originalHost:"www.minister.industry.gov.au",
    originalPath:/^\/(?:t-ayres|king)\/media\//u,
    topic:/\b(?:critical minerals?|rare[- ]earths?|lithium|cobalt|nickel|graphite|copper|mineral supply|mining)\b/iu,
  },
];
function originalArticleUrl(value:string, def:OriginalFeed):string|null {
  if(def.family==="rbi_india_original_macro_publisher")
    return pinnedRbiPressReleaseLink(value);
  const global=GLOBAL_OFFICIAL_RELEASE_FEEDS.find((s:{family:string})=>s.family===def.family);
  if(global)return globalOriginalArticleUrl(value,global);
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
  if (def.originalHost !== "news.un.org") return link;
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
/**
 * A first-party RSS/Atom feed is not guaranteed to be in publication order.
 * Preserve all bounded eligible original candidates (up to 80 entries)
 * while selecting the four FRESHEST source-native item clocks per issuer.
 * Undated official Atom leads remain private rescue candidates, never
 * receive an invented time or a commercial permission.
 */
export function freshestPrivateOriginalFeedCandidates(
  candidates:readonly PrivateOriginalCandidate[],limit=4,
):PrivateOriginalCandidate[]{
 if(!Array.isArray(candidates)||candidates.length>80||
    !Number.isInteger(limit)||limit<1||limit>4)
   throw Error("ON_DEMAND_ORIGINAL_CANDIDATE_SELECTION_INVALID");
 const nativeTime=(c:PrivateOriginalCandidate)=>{
  if(c.source_native_feed_publication_date_verified!==true ||
     typeof c.feed_item_published_at!=="string")return Number.NEGATIVE_INFINITY;
  const t=Date.parse(c.feed_item_published_at);
  return Number.isFinite(t)?t:Number.NEGATIVE_INFINITY;
 };
 // Stable native-date descending order, then original entry order.
 return candidates.map((candidate,index)=>({candidate,index}))
  .sort((a,b)=>nativeTime(b.candidate)-nativeTime(a.candidate)||a.index-b.index)
  .slice(0,limit).map(x=>x.candidate);
}


async function originalOfficialFeed(
  def:OriginalFeed,countryIso3:string,countryNameValue:string,
  fetchImpl:typeof fetch,now:Date,mineral:OnDemandMineral|null,
  topics:readonly string[]=[],maxAgeMs=ONE_DAY_MS,
):Promise<OriginalFeedResult>{
  if(def.family==='iea_minerals_original_publisher'){
    const html=await boundedFetch(fetchImpl,def.url,'text/html');
    const candidates:PrivateOriginalCandidate[]=ieaMineralsIndexCandidates(html)
      .filter((row:{title:string})=>originalHeadlineMentionsCountry(row.title,countryIso3,countryNameValue)&&
        matchesRequestedTopic(row.title,def.domain,topics)&&(!mineral||row.title.toLowerCase().includes(mineral)))
      .slice(0,2).map((row:{title:string;articleUrl:string})=>({
        domain:def.domain,publisher_family:def.family,article_url:row.articleUrl,article_title:row.title,
        feed_item_published_at:null,search_index_original_page_pending:true as const,
        article_identity_sha256:digest(def.family+'|'+row.articleUrl),first_party_article_url_verified:true as const,
        source_native_feed_publication_date_verified:false,publisher_article_page_date_verified:false as const,
        independent_same_event_verified:false as const,derived_commercial_rights_verified:false as const,
        score_verified:false as const,signed_gro_verified:false as const,paid_delivery_allowed:false as const,
      }));
    return {probe:probe(def.family,candidates.length,false),private_candidates:candidates};
  }
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
  const rdf=verifiedGlobalRdfFeed(def.family,def.url,xml);
  if(atom ? !/<(?:atom:)?feed(?:\s|>)/iu.test(xml)
          : !/<rss(?:\s|>)/iu.test(xml)&&!rdf)
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
      : rdf?(/<dc:date(?:\s[^>]*)?>([^<>]+)<\/dc:date>/iu.exec(entry)?.[1]??""):rssItemText(entry,"pubDate");
    // A different mineral's article must not qualify as evidence for this
    // query just because both are under the broad Critical Minerals topic.
    const summary=originalItemSummary(entry,atom);
    const contextualText=(title+" "+summary).slice(0,850);
    const mineralMatches = !mineral || def.domain !== "rare_earth" ||
      MINERAL_TERMS.some((term) => term.value === mineral && term.pattern.test(contextualText));
    const hasNativeDate=freshPublished(date,now,maxAgeMs);
    if(date.trim())audit.native_dated++;
    const matchedCountry=originalPublisherMatchesCountry(
      title,summary,countryIso3,countryNameValue,def.family);
    if(matchedCountry)audit.country_mentioned++;
    const matchedScope=def.topic.test(contextualText) &&
      matchesRequestedTopic(contextualText,def.domain,topics) && mineralMatches;
    if(matchedCountry && matchedScope)audit.scope_matched++;
    const undatedRbiOriginalIndex=def.family==="rbi_india_original_macro_publisher" && !date.trim();
    const undatedFirstPartyAtom=atom && !date.trim() &&
      ["uk_fcdo_original_publisher","uk_dbt_original_publisher",
       "uk_ofsi_original_publisher","uk_desnz_original_publisher","uk_hmt_original_publisher",
       "canada_nrcan_original_publisher"].includes(def.family);
    // Missing Atom <published> may enter PRIVATE article-page verification,
    // not score/payment. Never accept <updated>, bad/missing RSS clocks, or
    // a stale/future <published> as original source time.
    if (!matchedCountry || !matchedScope || (!hasNativeDate && !undatedFirstPartyAtom && !undatedRbiOriginalIndex)) continue;
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
    // Scan the bounded 80 feed entries before selecting 4 by true native
    // publication clock. An unordered feed must not hide fresh originals.
    const article_title=title.replace(/\s+/gu," ").trim();
    const article_identity_sha256=digest(def.family+"|"+article_url);
    if(candidates.some(x=>x.article_identity_sha256===article_identity_sha256))
      continue; // Same publisher URL in a second feed entry is one article.
    candidates.push({
      domain:def.domain,publisher_family:def.family,article_url,article_title,
      item_scoped_summary_private:summary,
      feed_item_published_at:hasNativeDate?new Date(Date.parse(date)).toISOString():null,
      ...(undatedFirstPartyAtom?{undated_atom_original_page_pending:true as const}:{}),
      ...(undatedRbiOriginalIndex?{index_original_page_pending:true as const}:{}),
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
  const freshest=freshestPrivateOriginalFeedCandidates(candidates);
  return {probe:{...probe(def.family,freshest.length,
    freshest.some(x=>x.source_native_feed_publication_date_verified)),
    feed_audit:audit},
    private_candidates:freshest};
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
    const def=[...ORIGINAL_FALLBACK_FEEDS,...INTERNATIONAL_ORIGINAL_FEEDS,...GOVUK_SEARCH_FALLBACKS].find(x=>
      x.domain===item.domain && x.family===item.publisher_family);
    const nativeDated=item.source_native_feed_publication_date_verified===true &&
      Number.isFinite(time) && item.undated_atom_original_page_pending!==true;
    const undatedReview=def?.media==="atom" &&
      ["uk_fcdo_original_publisher","uk_dbt_original_publisher",
       "uk_ofsi_original_publisher","uk_desnz_original_publisher","uk_hmt_original_publisher",
       "canada_nrcan_original_publisher"]
        .includes(item.publisher_family) &&
      item.undated_atom_original_page_pending===true &&
      item.feed_item_published_at===null &&
      item.source_native_feed_publication_date_verified===false;
    const indexedReview=item.index_original_page_pending===true &&
      item.undated_atom_original_page_pending!==true &&
      item.search_index_original_page_pending!==true &&
      item.feed_item_published_at===null &&
      item.source_native_feed_publication_date_verified===false;
    const searchReview=def?.media==="search" &&
      item.search_index_original_page_pending===true &&
      item.feed_item_published_at===null &&
      item.source_native_feed_publication_date_verified===false;
    // Fixed Fed first-party archive is a narrow, same-issuer, day-only
    // review lead; never mark archive-only records feed-clock verified.
    const archiveReview=def?.family==="us_federal_reserve_original_publisher" &&
      def?.domain==="macro" &&
      item.feed_item_published_at===null &&
      item.source_native_feed_publication_date_verified===false &&
      typeof item.official_archive_release_day==="string" &&
      /^20\d{2}-\d{2}-\d{2}$/u.test(item.official_archive_release_day);
    // Preserve established native-dated candidate dedup contracts.
    // Enforce fixed issuer/host/path and exact SHA binding additionally ONLY
    // on the new missing-<published> GOV.UK Atom rescue path.
    const reviewedUndated=(undatedReview===true || searchReview===true ||
      archiveReview===true || indexedReview) && !!def &&
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
  options: {fetchImpl?:typeof fetch; now?:Date; disableDiscoveryIndex?:boolean;
    directPublisherOnly?:boolean}={},
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
    if(upstream.protocol!=="https:" ||
       !approvedOnDemandSourceHostname(upstream.hostname) ||
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
    const response=host==="api.gdeltproject.org"&&options.fetchImpl===undefined
      ?await fetchGdeltDocWithBudget(String(target),init,(input,options)=>fetchWithoutRedirectUsing(fetchImpl,input,options)):await fetchWithoutRedirectUsing(fetchImpl,target,init);
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
  // Explicit recent three-domain discovery is a NEWS/EVENT retrieval lane.
  // Annual WDI observation years are structural context and must not take
  // a scarce 12-request original-source slot in a <=24h event search.
  // Ordinary numeric/structural country requests still retain both WDI series.
  const freshThreeDomainEventDiscovery = categories.length===3 &&
    input.max_age_seconds!==undefined && input.max_age_seconds<=86_400 &&
    Array.isArray(input.topics) && input.topics.length>0;
  const mineral = input.mineral ?? null;
  if (mineral !== null &&
      (!categories.includes("rare_earth") ||
       !MINERAL_TERMS.some((term) => term.value === mineral)))
    throw Error("ON_DEMAND_MINERAL_SCOPE_INVALID");
  // Always bound fan-out; missing country metadata is not substituted by an
  // ungrounded guessed country name.
  // The canonical 195-country registry is the authoritative local query
  // label. No speculative World Bank GET is needed for any of those 195
  // countries; avoid burning one of only twelve provider requests per
  // on-demand query before the original publishers are even consulted.
  // Non-195 legacy territories may still use the existing bounded external
  // lookup, which never proves a current source or country-specific event.
  let name=country195ByIso3(country)?.name??"";
  if(!name){
    try {name=await countryName(country,trackedFetch);}
    catch {name="";}
  }
  // World Bank describes Palestine as "West Bank and Gaza", but routing a
  // PSE query must still match the UN observer-state country denominator.
  if(country==="PSE" && name)name="State of Palestine";
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
  if (name) for (const source of [...ORIGINAL_FALLBACK_FEEDS,...(topics.length?INTERNATIONAL_ORIGINAL_FEEDS:[])]) {
    // Reuse the Canadian government publisher for verified Canadian country
    // scope only. Do not consume a scarce original-provider slot or alter
    // unrelated global/China queries simply because a new issuer was added.
    if(source.family==="canada_nrcan_original_publisher" && country!=="CAN") continue;
    // Preserve legacy no-topic quota/source contracts; the RBI lane is
    // reserved for explicit India original-event review or on-demand
    // query topics, not annual structural reference retrieval.
    if(source.family==="rbi_india_original_macro_publisher" &&
       (country!=="IND" || !topics.length)) continue;
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
  if (!options.directPublisherOnly && categories.includes("macro") &&
      !freshThreeDomainEventDiscovery) for (const indicator of [
    "FP.CPI.TOTL.ZG","NY.GDP.MKTP.KD.ZG",
  ] as const) tasks.push({name:"world_bank_official_" + indicator,category:"macro",
    run:()=>worldBank(country,indicator,trackedFetch,now)});
  // Exactly one fixed metadata lookup + at most eleven provider requests,
  // no 195-country fanout and no user question passed upstream.
  // One country GET + at most eleven provider GETs. Prioritize annual macro
  // observables when optional approvals increase the configured fanout.
  // Three-domain news searches preserve quota: for <=24h queries, reserve
  // three slots for existing country-scoped first-party GOV.UK discovery;
  // structural queries continue to use their previous two-slot rescue.
  // For other three-domain requests, reserve two slots
  // for the existing country-scoped first-party GOV.UK Search rescue
  // (the search itself never supplies an original article clock). We can
  // afford 6 independent originating publisher feeds + 3 GDELT scopes +
  // 1 annual WDI context = 10 primary GETs, never more than the existing
  // 12 total. WDI annual records are NOT current event proof. Two-domain
  // queries and unscoped legacy requests retain their existing behaviour.
  const maxPrimary=freshThreeDomainEventDiscovery?9:
    topics.length>0 && categories.length===3?10:11;
  // Multi-category current-event questions must sample two distinct
  // ORIGINAL issuers per requested domain before spending the bounded
  // request budget on GDELT discovery indexes (never original evidence).
  // Preserve the existing max 12 requests, issuer allowlist, WDI structural
  // reads where headroom permits, and no-403/429 bypass. A publisher feed
  // success is still NOT verified same-event facts or commercial rights.
  // Unscoped legacy requests keep their existing selection/order intact.
  // Unscoped legacy requests keep their existing selection/order intact.
  const selected=topics.length>0 && categories.length>1
    ? (()=>{
      const macro=tasks.filter(t=>t.name.startsWith("world_bank_official_"))
        .slice(0,categories.length===3?1:2);
      // Use an already registered country-relevant issuer for the first
      // source-native release slot. All other publishers remain fallback
      // candidates; no new URL, credential, source rights or network budget.
      // Current euro-area membership includes Bulgaria from 1 January 2026.
      // An ECB release is only a country lead when the item's own text
      // passes the existing exact-country relevance and page-date checks.
      const euroAreaIso3=new Set([
        "AUT","BEL","BGR","HRV","CYP","EST","FIN","FRA","DEU",
        "GRC","IRL","ITA","LVA","LTU","LUX","MLT","NLD",
        "PRT","SVK","SVN","ESP",
      ]);
      const preferredNational=(category:OnDemandCategory):string|null=>
        category==="rare_earth" && country==="USA"
          ?"us_doe_minerals_original_publisher":
        category==="rare_earth" && country==="CAN"
          ?"canada_nrcan_original_publisher":
        category==="rare_earth" && country==="AUS"
          ?"australian_industry_original_publisher":
        category==="rare_earth" && country==="GBR"
          ?"uk_dbt_original_publisher":
        category==="geopolitics" && country==="GBR"
          ?"uk_fcdo_original_publisher":
        category==="macro" && country==="CAN"
          ?"boc_original_publisher":
        category==="macro" && country==="JPN"
          ?"boj_original_publisher":
        category==="macro" && country==="IND"
          ?"rbi_india_original_macro_publisher":
        category==="macro" && country==="GBR"
          ?"uk_hmt_original_publisher":
        category==="macro" && euroAreaIso3.has(country)
          ?"ecb_original_publisher":
        category==="macro" && country==="USA"
          ?"us_federal_reserve_original_publisher":null;
      const originalTask=(t:(typeof tasks)[number],category:OnDemandCategory)=>
        t.category===category && t.name!=="gdelt_doc_discovery" &&
        t.name!=="reliefweb_discovery" &&
        !t.name.startsWith("world_bank_official_");
      const originals=categories.map(category=>
        tasks.find(t=>originalTask(t,category) &&
          t.name===preferredNational(category)) ??
        (input.max_age_seconds!==undefined&&input.max_age_seconds<=86400
          ?tasks.find(t=>originalTask(t,category)&&t.name===
            (category==='geopolitics'?'un_press_original_publisher':category==='macro'?'bis_original_publisher':'un_minerals_original_publisher')):undefined) ??
        tasks.find(t=>originalTask(t,category)),
      ).filter((t):t is (typeof tasks)[number]=>Boolean(t));
      // Never mistake two articles from one institution for two issuers.
      // Each secondary must have a different registered publisher family
      // from this category's selected primary. No extra provider requests:
      // replace lower-priority index-only slots when the cap is full.
      // Prioritize a different *real issuer* within the same bounded
      // original GET budget, never imply independent same-event proof.
      const secondary=categories.map((category,index)=>{
        const preferredSecondary=category==="geopolitics"
          ?"eu_council_original_publisher":null;
        return (preferredSecondary?tasks.find(t=>originalTask(t,category) &&
          t.name===preferredSecondary && t.name!==originals[index]?.name):undefined) ??
          tasks.find(t=>originalTask(t,category) &&
            t.name!==originals[index]?.name);
      }).filter((t):t is (typeof tasks)[number]=>Boolean(t));
      const indexes=categories.map(category=>tasks.find(t=>
        t.category===category && t.name==="gdelt_doc_discovery")).filter(
          (t):t is (typeof tasks)[number]=>Boolean(t));
      const primary=[...new Set([...originals,...secondary,...macro,...indexes])];
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
  const searchedGovukCategories=new Set<OnDemandCategory>();
  // For an explicit three-domain country question, the fixed primary
  // 1-country + 8-provider budget often leaves only three source GETs.
  // If all rotating feeds missed an original, the old sequence consumed the
  // remaining GETs on unrelated global feeds BEFORE the country-filtered
  // official GOV.UK Search API was reached. Reserve at most two issuer-index
  // attempts for the weakest world-wide categories (minerals, geopolitics),
  // preserving at least one remaining network slot for an independent
  // original-publisher fallback. Every search lead still requires its
  // first-party article page and real original publication date.
  if(name && topics.length>0 && categories.length===3){
    // In a genuine <=24h three-domain search, include Macro in issuer-index
    // rescue instead of spending that slot on an annual WDI statistic.
    const targeted=freshThreeDomainEventDiscovery
      ?(["rare_earth","macro","geopolitics"] as const)
      :(["rare_earth","geopolitics"] as const);
    for(const category of targeted){
      if(!categories.includes(category) || networkAttempts>=
          (freshThreeDomainEventDiscovery?12:11))break;
      const originalPresent=settled.some(result=>
        result.status==="fulfilled" &&
        "private_candidates" in result.value &&
        result.value.private_candidates.some(item=>item.domain===category && item.index_original_page_pending!==true));
      if(originalPresent)continue;
      const def=GOVUK_SEARCH_FALLBACKS.find(item=>item.domain===category)!;
      searchedGovukCategories.add(category);
      try{
        const found=await govukOriginalSearch(def,country,name,trackedFetch,topics,mineral);
        source_probes.push({...found.probe,category});
        if(found.private_candidates.length>0)
          fallbackIssuerGroups.push(found.private_candidates);
      }catch(error){
        source_probes.push({...failed(def.family,error),category});
      }
    }
  }
  // If a selected original publisher fails or returns zero matching records,
  // try another already registered original institution within the SAME
  // twelve-request budget. Do not promote GDELT index links to originals, and
  // do not turn a source outage into a positive coverage claim.
  if(name && topics.length>0 && categories.length>1){
    for(const category of categories){
      const hasOriginal=()=>settled.some(result=>
        result.status==="fulfilled" &&
        "private_candidates" in result.value &&
        result.value.private_candidates.some(item=>item.domain===category && item.index_original_page_pending!==true)) ||
        fallbackIssuerGroups.some(group=>group.some(item=>item.domain===category && item.index_original_page_pending!==true));
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
  // A live Federal Reserve RSS is rolling-window limited. This ONE
  // optional official annual press index GET recovers missing source leads.
  // It does not prove a precise release clock, licence, corroboration or GRO.
  if(country==="USA" && categories.includes("macro") &&
     topics.includes("macro_risk") && networkAttempts<12 &&
     !settled.some(result=>result.status==="fulfilled" &&
       "private_candidates" in result.value &&
       result.value.private_candidates.some(x=>
         x.publisher_family==="us_federal_reserve_original_publisher" && x.index_original_page_pending!==true))){
    const def=ORIGINAL_FALLBACK_FEEDS.find(x=>
      x.family==="us_federal_reserve_original_publisher")!;
    try{
      const index=await boundedFetch(trackedFetch,
        "https://www.federalreserve.gov/newsevents/pressreleases/"+
          now.getUTCFullYear()+"-press.htm","text/html");
      const leads=originalFedDiscountMinutesArchiveLinks(
        index,now.getUTCFullYear(),now,newsMaxAgeMs);
      const results:PrivateOriginalCandidate[]=leads.flatMap(x=>{
        if(originalArticleUrl(x.article_url,def)!==x.article_url ||
           !def.topic.test(x.article_title) ||
           !matchesRequestedTopic(x.article_title,"macro",topics))return [];
        return [{
          domain:"macro" as const,publisher_family:def.family,
          article_url:x.article_url,article_title:x.article_title,
          official_archive_release_day:x.official_archive_release_day,
          feed_item_published_at:null,
          article_identity_sha256:digest(def.family+"|"+x.article_url),
          first_party_article_url_verified:true as const,
          source_native_feed_publication_date_verified:false,
          publisher_article_page_date_verified:false as const,
          independent_same_event_verified:false as const,
          derived_commercial_rights_verified:false as const,
          score_verified:false as const,signed_gro_verified:false as const,
          paid_delivery_allowed:false as const,
        }];
      });
      source_probes.push({...probe("us_federal_reserve_annual_archive",
        results.length,false),category:"macro"});
      if(results.length)fallbackIssuerGroups.push(results);
    }catch(error){
      source_probes.push({...failed("us_federal_reserve_annual_archive",error),
        category:"macro"});
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
      result.value.private_candidates.some(item=>item.domain===category && item.index_original_page_pending!==true)) ||
      fallbackIssuerGroups.some(group=>group.some(item=>item.domain===category && item.index_original_page_pending!==true));
    if(originalPresent || searchedGovukCategories.has(category) ||
       networkAttempts>=12)continue;
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
  const allIssuerCandidateGroups=[
    ...settled.flatMap(result=>
      result.status==="fulfilled" && "private_candidates" in result.value
        ? [result.value.private_candidates] : []),
    ...fallbackIssuerGroups,
  ];
  const candidateTiers=[
    allIssuerCandidateGroups.map(group=>group.filter(x=>x.index_original_page_pending!==true)),
    allIssuerCandidateGroups.map(group=>group.filter(x=>x.index_original_page_pending===true)),
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
  // Fill the existing budget from native/issuer leads first. External-index
  // leads only use leftover capacity, never displacing original feed evidence.
  for(const issuerCandidateGroups of candidateTiers){
    for(let i=0;i<4 && private_candidates.length<16;i++) {
      for(const issuer of issuerCandidateGroups) {
        if(private_candidates.length>=16)break;
        if(issuer[i])private_candidates.push(issuer[i]);
      }
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
  // Bind each private lead to the exact canonical country searched by the
  // existing source-specific matcher. The downstream 585-cell compiler must
  // reject unbound or foreign-country candidates, even with a valid page date.
  const bindCountry=(candidate:PrivateOriginalCandidate):PrivateOriginalCandidate=>
    ({...candidate,country_iso3:country});
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
    discovery,private_candidates:grouped.unique_candidates.map(bindCountry),
    private_original_review_candidates:grouped.original_review_candidates.map(bindCountry),
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
> & { publisher_article_page_date_verified: true; page_original_published_at: string;
  verified_original_event_kind?:"FED_BOARD_DISCOUNT_WINDOW_MEETING_MINUTES_PUBLISHED";
};

export type PrivatePageDayOriginal = Readonly<{
  publisher_family:"canada_nrcan_original_publisher";
  article_identity_sha256:string;
  page_original_publication_day:string; // YYYY-MM-DD; never a synthetic UTC clock
  original_clock_precision:"day";
  original_issuer_page_verified:true;
  article_commercial_rights_verified:false;
  signed_customer_answer_verified:false;
}>;
export type PrivatePageDateResult = {
  attempted: number;
  verified: number;
  verified_candidates: PrivatePageDatedOriginal[];
  // Present only for a verified Canada.ca calendar-day original. This is
  // NEVER admitted as an exact-dated or signed customer evidence object.
  day_only_originals?: PrivatePageDayOriginal[];
  // Only populated by privileged bounded source-intake operators when
  // explicitly requested. Coarse counts: no URLs, article titles or hashes.
  page_rejection_counts?: Partial<Record<PrivatePageRejectReason,number>>;
};
export type PrivatePageRejectReason =
  "ISSUER_FIRST_PUBLICATION_DAY_INVALID" |
  "PUBLISHER_ORIGINAL_BODY_DATE_UNVERIFIED" |
  "PUBLISHER_PUBLICATION_METADATA_MISSING" |
  "PUBLISHER_PUBLICATION_TIME_IMPRECISE" |
  "PUBLISHER_PUBLICATION_METADATA_CONFLICT" |
  "PUBLISHER_PUBLICATION_DATE_INVALID_OR_EXPIRED" |
  "INDEX_HEADLINE_OR_PAGE_IDENTITY_MISMATCH" |
  "ORIGINAL_FEED_AND_PAGE_CLOCK_MISMATCH" |
  "PAGE_DATE_OR_ISSUER_SCOPE_UNVERIFIED" |
  "FIRST_PARTY_SOURCE_ACCESS_DENIED" |
  "SOURCE_FETCH_TRANSPORT_OR_MIME_FAILURE";


const MAX_ARTICLE_PAGE_PROBES = 4;
// Do not maintain a second, permissive on-demand <meta> scraper. The shared
// first-party verifier rejects conflicting originals, date-only, missing
// timezone, future/stale release clocks and updated/modified dates. Article
// feed timestamps are cross-checked separately below.

/** Internal-only evidence continuation; never serialize verified_candidates. */
export async function verifyOnDemandOriginalArticlePages(
  candidates: readonly PrivateOriginalCandidate[],
  options: {fetchImpl?:typeof fetch; now?:Date; maxAgeSeconds?:number;diagnostics?:boolean;maxProbes?:number}={},
): Promise<PrivatePageDateResult> {
  const now=options.now ?? new Date();
  const maxProbes=options.maxProbes??MAX_ARTICLE_PAGE_PROBES;
  const maxAgeMs=options.maxAgeSeconds===undefined?ONE_DAY_MS:
    Math.min(MAX_NEWS_AGE_MS,options.maxAgeSeconds*1000);
  if(!Number.isSafeInteger(maxProbes)||maxProbes<1||maxProbes>MAX_ARTICLE_PAGE_PROBES||
     !Number.isFinite(now.getTime()) || !Number.isFinite(maxAgeMs) || maxAgeMs<=0)
    throw Error("ON_DEMAND_CLOCK_INVALID");
  const eligible=candidates.slice(0,16).filter((candidate)=>{
    const def=[...ORIGINAL_FALLBACK_FEEDS,...INTERNATIONAL_ORIGINAL_FEEDS,...GOVUK_SEARCH_FALLBACKS].find((feed)=>
      feed.family===candidate.publisher_family && feed.domain===candidate.domain);
    return !!def &&
      originalArticleUrl(candidate.article_url,def)===candidate.article_url &&
      candidate.article_identity_sha256===digest(def.family+"|"+candidate.article_url) &&
      candidate.first_party_article_url_verified===true &&
      (
        (candidate.index_original_page_pending===true &&
         candidate.undated_atom_original_page_pending!==true &&
         candidate.search_index_original_page_pending!==true &&
         candidate.source_native_feed_publication_date_verified===false &&
         candidate.feed_item_published_at===null) ||
        (candidate.source_native_feed_publication_date_verified===true &&
         candidate.feed_item_published_at!==null &&
         freshPublished(candidate.feed_item_published_at,now,maxAgeMs) &&
         candidate.undated_atom_original_page_pending!==true) ||
        (def.media==="atom" &&
         ["uk_fcdo_original_publisher","uk_dbt_original_publisher",
       "uk_ofsi_original_publisher","uk_desnz_original_publisher","uk_hmt_original_publisher",
           "canada_nrcan_original_publisher"]
           .includes(def.family) &&
         candidate.source_native_feed_publication_date_verified===false &&
         candidate.feed_item_published_at===null &&
         candidate.undated_atom_original_page_pending===true) ||
        (def.media==="search" && candidate.search_index_original_page_pending===true &&
         candidate.feed_item_published_at===null &&
         candidate.source_native_feed_publication_date_verified===false) ||
         (def.family==="us_federal_reserve_original_publisher" &&
          candidate.source_native_feed_publication_date_verified===false &&
          candidate.feed_item_published_at===null &&
          typeof candidate.official_archive_release_day==="string" &&
          /^20\d{2}-\d{2}-\d{2}$/u.test(candidate.official_archive_release_day))
      );
  });
  eligible.sort((a,b)=>Number(a.index_original_page_pending===true)-Number(b.index_original_page_pending===true));
  const chosen:PrivateOriginalCandidate[]=[];
  const used=new Set<string>();
  const add=(candidate:PrivateOriginalCandidate)=>{
    if(chosen.length>=maxProbes ||
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

  // First pass covers distinct approved originating publishers/categories.
  // A secondary page from the SAME publisher is only an evidence-rescue
  // attempt if its first article failed publication-clock verification and
  // the four-page budget still has headroom; it is never independent proof.
  const verifyCandidate=async(candidate:PrivateOriginalCandidate):Promise<{
    verified:PrivatePageDatedOriginal|null;
    dayOnly:PrivatePageDayOriginal|null; denied:boolean;
    reason?:PrivatePageRejectReason;
  }>=>{
    const reason=(reason:PrivatePageRejectReason,denied=false)=>({
      verified:null,dayOnly:null,denied,reason
    });
    try{
      const html=await boundedFetch(options.fetchImpl??fetch,candidate.article_url,"text/html");
      const isCanada=candidate.publisher_family==="canada_nrcan_original_publisher";
      // Reuse the independently tested Canada.ca issuer/H1/first-publication
      // verifier already powering the official website feed; never substitute
      // Atom <updated>, crawl clocks, or article URL month for issue date.
      const canadaDay=isCanada?canadaOriginalPublicationDay(
        html,candidate.article_url,candidate.article_title,now.getTime()):null;
      if(isCanada && !canadaDay)return reason("ISSUER_FIRST_PUBLICATION_DAY_INVALID");
      const publisherDateDiagnostics:{date_reason?:string}={};
      const metadataDate=verifiedPublisherPageDate(html,now,publisherDateDiagnostics,{maxAgeMs});
      const ieaDate=candidate.publisher_family==='iea_minerals_original_publisher'
        ?verifiedIeaOriginalPublication(html,{title:candidate.article_title,articleUrl:candidate.article_url},now,maxAgeMs):null;
      if(candidate.publisher_family==='iea_minerals_original_publisher'&&!ieaDate)
        return reason("PUBLISHER_ORIGINAL_BODY_DATE_UNVERIFIED");
      // A pinned issuer-specific visible original may rescue absent metadata,
      // never conflicting, stale, future or malformed original metadata.
      // GOV.UK often has only publication DAY in HTML. Recover the
      // first-party, precise first_published_at ONLY from its pinned Content
      // API after matching original HTML H1, canonical path and issuer title.
      // Do not override conflicting HTML clocks or leave the page GET cap.
      let govPrecise:string|null=null;
      const apiUrl=candidate.publisher_family.startsWith("uk_")?
        pinnedGovUkContentApiUrl(candidate.article_url):null;
      if(apiUrl && metadataDate===null &&
        ["MISSING_PUBLISHER_PUBLICATION_METADATA","IMPRECISE_DATE_ONLY"]
          .includes(publisherDateDiagnostics.date_reason??"")){
        try {
          const contentJson=await boundedFetch(options.fetchImpl??fetch,apiUrl,"application/json");
          govPrecise=verifiedGovUkContentFirstPublishedAt({
            articleUrl:candidate.article_url,html,contentJson,
            articleTitle:candidate.article_title,now,maxAgeMs
          });
        }catch{govPrecise=null}
      }
      const precise=metadataDate??govPrecise??(
        publisherDateDiagnostics.date_reason==='MISSING_PUBLISHER_PUBLICATION_METADATA'?ieaDate:null);
      // For a Board discount-meeting minutes original whose page has a
      // timezone-labelled release line but not machine-readable precise
      // metadata, independently bind issuer URL, native feed clock, the
      // actual first-party Board release body and New York DST.
      const boardRelease=candidate.publisher_family==="us_federal_reserve_original_publisher"
        ? verifiedFedBoardDiscountMinutesOriginal(
            html,candidate.article_url,candidate.article_title,
            candidate.feed_item_published_at,now,
            candidate.official_archive_release_day??null):null;
      // Never let a plausible visible clock override contradictory original
      // publisher datePublished metadata. Also require the requested window.
      const boardBodyTimeAdmissible=boardRelease!==null &&
        (precise!==null ||
         publisherDateDiagnostics.date_reason==="MISSING_PUBLISHER_PUBLICATION_METADATA");
      const originalDate=precise && boardRelease &&
         Math.abs(Date.parse(precise)-Date.parse(boardRelease.publication_utc))>60_000
        ? null : (precise??(boardBodyTimeAdmissible?boardRelease?.publication_utc:null)??null);
      if(originalDate && freshPublished(originalDate,now,maxAgeMs) &&
          (candidate.index_original_page_pending!==true ||
           (indexedHeadlineMatchesOriginalPage(candidate.article_title,html) &&
            indexedPublisherHasOriginalMetaOutsideScripts(html))) &&
          (!isCanada || originalDate.slice(0,10)===canadaDay) &&
          (!candidate.official_archive_release_day ||
           originalDate.slice(0,10)===candidate.official_archive_release_day) &&
          (candidate.feed_item_published_at===null ||
           Math.abs(Date.parse(originalDate)-Date.parse(candidate.feed_item_published_at))<=10*60*1000))
        return {verified:{...candidate,publisher_article_page_date_verified:true as const,
          page_original_published_at:originalDate,
          ...(boardRelease?{verified_original_event_kind:boardRelease.verified_event}:{})},
          dayOnly:null,denied:false};
      // Conservative boundary: require the beginning of the publisher's
      // calendar day to fit the requested window. This may reject useful
      // news, but cannot claim an invented exact hour of publication.
      const at=canadaDay?Date.parse(canadaDay+"T00:00:00.000Z"):NaN;
      const dayOnly=canadaDay && Number.isFinite(at) && at<=now.getTime() &&
          now.getTime()-at<=maxAgeMs
        ? {publisher_family:"canada_nrcan_original_publisher" as const,
           article_identity_sha256:candidate.article_identity_sha256,
           page_original_publication_day:canadaDay,
           original_clock_precision:"day" as const,
           original_issuer_page_verified:true as const,
           article_commercial_rights_verified:false as const,
           signed_customer_answer_verified:false as const}:null;
      if(dayOnly)return {verified:null,dayOnly,denied:false,
        reason:"PUBLISHER_PUBLICATION_TIME_IMPRECISE"};
      if(!originalDate){
        const why=publisherDateDiagnostics.date_reason;
        const kind:PrivatePageRejectReason=
          why==="MISSING_PUBLISHER_PUBLICATION_METADATA"
            ?"PUBLISHER_PUBLICATION_METADATA_MISSING":
          why==="IMPRECISE_DATE_ONLY"
            ?"PUBLISHER_PUBLICATION_TIME_IMPRECISE":
          why==="CONFLICTING_PUBLISHER_PUBLICATION"
            ?"PUBLISHER_PUBLICATION_METADATA_CONFLICT":
            "PUBLISHER_PUBLICATION_DATE_INVALID_OR_EXPIRED";
        return reason(kind);
      }
      if(candidate.index_original_page_pending===true &&
          (!indexedHeadlineMatchesOriginalPage(candidate.article_title,html) ||
           !indexedPublisherHasOriginalMetaOutsideScripts(html)))
        return reason("INDEX_HEADLINE_OR_PAGE_IDENTITY_MISMATCH");
      if(candidate.feed_item_published_at!==null &&
          Math.abs(Date.parse(originalDate)-Date.parse(candidate.feed_item_published_at))>
            10*60*1000)
        return reason("ORIGINAL_FEED_AND_PAGE_CLOCK_MISMATCH");
      return reason("PAGE_DATE_OR_ISSUER_SCOPE_UNVERIFIED");
    }catch(error){
      const code=error instanceof Error?error.message:"";
      const denied=["ON_DEMAND_SOURCE_ACCESS_RESTRICTED",
        "ON_DEMAND_SOURCE_RATE_LIMITED"].includes(code);
      return reason(denied?"FIRST_PARTY_SOURCE_ACCESS_DENIED":
        "SOURCE_FETCH_TRANSPORT_OR_MIME_FAILURE",denied);
    }
  };
  const first=await Promise.all(chosen.map(verifyCandidate));
  const verified_candidates:PrivatePageDatedOriginal[]=[];
  const day_only_originals:PrivatePageDayOriginal[]=[];
  const rejected:PrivatePageRejectReason[]=[];
  const blockedFamilies=new Set<string>();
  const successfulFamilies=new Set<string>();
  const seenIds=new Set(chosen.map(x=>x.article_identity_sha256));
  for(let i=0;i<chosen.length;i++){
    const receipt=first[i];
    if(!receipt.verified && receipt.reason) rejected.push(receipt.reason);
    if(first[i].verified){
      verified_candidates.push(first[i].verified!);
      successfulFamilies.add(chosen[i].publisher_family);
    }
    if(first[i].dayOnly){day_only_originals.push(first[i].dayOnly!);
      successfulFamilies.add(chosen[i].publisher_family);}
    if(first[i].denied)blockedFamilies.add(chosen[i].publisher_family);
  }
  let attempted=chosen.length;
  // Try at most one different original article per failed publisher.
  // Keep independent source identity intact and never exceed total page quota.
  for(let i=0;i<chosen.length && attempted<maxProbes;i++){
    const family=chosen[i].publisher_family;
    if(successfulFamilies.has(family) || blockedFamilies.has(family))continue;
    const alternate=eligible.find(x=>x.publisher_family===family &&
      !seenIds.has(x.article_identity_sha256));
    if(!alternate)continue;
    seenIds.add(alternate.article_identity_sha256);
    attempted++;
    const outcome=await verifyCandidate(alternate);
    if(!outcome.verified && outcome.reason)rejected.push(outcome.reason);
    if(outcome.verified){
      verified_candidates.push(outcome.verified);
      successfulFamilies.add(family);
    }
    if(outcome.dayOnly){day_only_originals.push(outcome.dayOnly);successfulFamilies.add(family);}
    if(outcome.denied)blockedFamilies.add(family);
  }
  const page_rejection_counts:Partial<Record<PrivatePageRejectReason,number>>={};
  if(options.diagnostics===true){
    for(const code of rejected)
      page_rejection_counts[code]=(page_rejection_counts[code]??0)+1;
  }
  return {attempted,verified:verified_candidates.length,verified_candidates,
    ...(day_only_originals.length?{day_only_originals}:{}),
    ...(options.diagnostics===true?{page_rejection_counts}:{})};
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

/** Same canonical engine, current original-publisher research only.
 * Fixed country/category terms reach publishers; no Telegram, discovery
 * index or annual statistical record can masquerade as current news.
 */
export async function discoverDirectPublisherForPrivateQualification(
  input:OnDemandSearchInput,
  options:{fetchImpl?:typeof fetch;now?:Date}={},
){
  if(!country195ByIso3(input.country_iso3))throw Error("ON_DEMAND_COUNTRY_INVALID");
  const topics=input.topics?.length?input.topics:
    input.categories.flatMap(category=>CATEGORY_TOPICS[category]??[]);
  return discoverOnDemandImpl({...input,topics},{...options,
    disableDiscoveryIndex:true,directPublisherOnly:true});
}


/** Private bridge to the EXISTING website deriver. No extra source reads.
 * Registry path, identity, native clock and actual page verification remain mandatory.
 */
export function websiteCandidateFromCountryOriginal(
 page:PrivatePageDatedOriginal,country:string,now=new Date(),
):import("./stateless-intelligence-model").StatelessSourceCandidate|null {
 if(!page||!country195ByIso3(country)||!Number.isFinite(now.getTime()))return null;
 const def=[...ORIGINAL_FALLBACK_FEEDS,...INTERNATIONAL_ORIGINAL_FEEDS,...GOVUK_SEARCH_FALLBACKS]
  .find(d=>d.family===page.publisher_family&&d.domain===page.domain);
 const at=Date.parse(page.page_original_published_at);
 if(!def||page.country_iso3!==country||page.publisher_article_page_date_verified!==true||
    page.first_party_article_url_verified!==true||originalArticleUrl(page.article_url,def)!==page.article_url||
    page.article_identity_sha256!==digest(def.family+"|"+page.article_url)||
    !Number.isFinite(at)||at>now.getTime()||now.getTime()-at>ONE_DAY_MS||
    !/(?:Z|[+-]\d\d:\d\d)$/u.test(page.page_original_published_at))return null;
 if(page.source_native_feed_publication_date_verified===true){
  const feed=Date.parse(page.feed_item_published_at??"");
  if(!Number.isFinite(feed)||feed>now.getTime()||now.getTime()-feed>ONE_DAY_MS||Math.abs(feed-at)>600000)return null;
 }
 const ogl="Contains public sector information licensed under the Open Government Licence v3.0.";
 const fixed:Record<string,{id:string;credit:string|null}>={
  uk_dbt_original_publisher:{id:"uk_dbt",credit:ogl},
  uk_dbt_search_original_page:{id:"uk_dbt",credit:ogl},
  uk_fcdo_original_publisher:{id:"uk_fcdo",credit:ogl},
  uk_fcdo_search_original_page:{id:"uk_fcdo",credit:ogl},
  uk_hmt_original_publisher:{id:"uk_hmt",credit:ogl},
  uk_hmt_search_original_page:{id:"uk_hmt",credit:ogl},
  uk_ofsi_original_publisher:{id:"uk_ofsi_sanctions",credit:ogl},
  uk_desnz_original_publisher:{id:"uk_energy",credit:ogl},
  us_federal_reserve_original_publisher:{id:"fed_press",credit:"Federal Reserve Board"},
  ecb_original_publisher:{id:"ecb_press",credit:"European Central Bank"},
  canada_nrcan_original_publisher:{id:"nrcan_releases",credit:"Natural Resources Canada"},
  australian_industry_original_publisher:{id:"au_industry_minister",credit:null},
  un_news_original_publisher:{id:"un_news",credit:null},
 };
 const global=GLOBAL_OFFICIAL_RELEASE_FEEDS.find((d:{family:string;category:string})=>d.family===page.publisher_family&&d.category===page.domain);
 const source=fixed[page.publisher_family]??(global?{id:global.websiteId??global.id,credit:global.credit}:null);
 if(!source)return null;
 return {title:page.article_title,articleUrl:page.article_url,publishedAt:new Date(at).toISOString(),
  sourceId:source.id,category:page.domain,credit:source.credit};
}
