import {fetchWithoutRedirectUsing} from "./fetch-without-redirect.ts";
import {isSafeDerivedNewsReadbackSignal} from "../../scripts/lib/derived-news-readback-policy.mjs";
import {safeDerivedNewsD1FailureClass} from "../../scripts/lib/derived-news-d1-failure.mjs";
/**
 * Direct, public, derived-only newsroom GET for browser clients.
 * This intentionally bypasses the React Start server-function transport when
 * the site's SSR/RPC runtime is unhealthy. It never asks for upstream sources,
 * private article URLs, raw feeds, Supabase, B2, credentials or payments.
 */
import type { StatelessIntelligenceSignal } from "./stateless-intelligence-model.ts";

const TRANSIENT_PUBLIC_READ_STATUSES=new Set([408,425,429,500,502,503,504]);
const PUBLIC_READ_MAX_ATTEMPTS=3;
const NON_RETRYABLE_D1_FAILURES=new Set([
  "D1_DAILY_ROW_READ_LIMIT","D1_DAILY_ROW_WRITE_LIMIT","D1_STORAGE_LIMIT","D1_SCHEMA_OR_SQL",
]);
async function waitForPublicReadRetry(attempt:number){
  await new Promise(resolve=>setTimeout(resolve,100*attempt));
}
async function publicD1FailureClass(response:Response):Promise<string|null>{
  try{
    const clone=response.clone();
    const declared=Number(clone.headers.get("content-length")??0);
    if(Number.isFinite(declared)&&declared>4096)return null;
    const text=await clone.text();
    if(text.length>4096)return null;
    const doc=JSON.parse(text) as {diagnostic_code?:unknown};
    if(typeof doc?.diagnostic_code!=="string")return null;
    return safeDerivedNewsD1FailureClass(doc.diagnostic_code);
  }catch{return null;}
}
/** Bounded retry for idempotent public GETs only. Deterministic D1 failure
 * classes stop immediately; transient/overloaded failures retain bounded retry. */
async function fetchPublicReadWithRetry(
  fetchImpl:typeof fetch,input:RequestInfo|URL,init:RequestInit,timeoutMs:number,
):Promise<Response>{
  let lastD1FailureClass:string|null=null;
  for(let attempt=1;attempt<=PUBLIC_READ_MAX_ATTEMPTS;attempt++){
    let response:Response;
    try{
      response=await fetchWithoutRedirectUsing(fetchImpl,input,{
        ...init,signal:AbortSignal.timeout(timeoutMs),
      });
    }catch(error){
      if(error instanceof TypeError&&error.message==="UPSTREAM_REDIRECT_REJECTED")throw error;
      if(attempt===PUBLIC_READ_MAX_ATTEMPTS)
        throw Error(lastD1FailureClass
          ? "DERIVED_NEWS_PUBLIC_FETCH_"+lastD1FailureClass
          : "DERIVED_NEWS_PUBLIC_FETCH_UNAVAILABLE");
      await waitForPublicReadRetry(attempt);
      continue;
    }
    if(!TRANSIENT_PUBLIC_READ_STATUSES.has(response.status))return response;
    if(response.status===503){
      lastD1FailureClass=await publicD1FailureClass(response)??lastD1FailureClass;
      if(lastD1FailureClass&&NON_RETRYABLE_D1_FAILURES.has(lastD1FailureClass)){
        try{await response.body?.cancel();}catch{/* discard only the deterministic failure */}
        throw Error("DERIVED_NEWS_PUBLIC_FETCH_"+lastD1FailureClass);
      }
    }
    try{await response.body?.cancel();}catch{/* discard only the transient response */}
    if(attempt===PUBLIC_READ_MAX_ATTEMPTS)
      throw Error(lastD1FailureClass
        ? "DERIVED_NEWS_PUBLIC_FETCH_"+lastD1FailureClass
        : "DERIVED_NEWS_PUBLIC_FETCH_UNAVAILABLE");
    await waitForPublicReadRetry(attempt);
  }
  throw Error(lastD1FailureClass
    ? "DERIVED_NEWS_PUBLIC_FETCH_"+lastD1FailureClass
    : "DERIVED_NEWS_PUBLIC_FETCH_UNAVAILABLE");
}

export const GEOMACRO_DERIVED_JOURNAL_URL =
  "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news-immediate";
export const GEOMACRO_DERIVED_BUNDLE_URL =
  "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news-bundle";
export const GEOMACRO_PERMANENT_ARCHIVE_BASE_URL =
  "https://geomacro-public-finds-archive.daspallab202391.workers.dev";
export const GEOMACRO_PERMANENT_LATEST_URL=GEOMACRO_PERMANENT_ARCHIVE_BASE_URL+"/latest.json";
const PERMANENT_ARCHIVE_INDEX_SCHEMA="geomacro.permanent-derived-news-archive-index.v1";
const PERMANENT_ARCHIVE_MONTH_SCHEMA="geomacro.permanent-derived-news-archive-month.v1";
const PERMANENT_ARCHIVE_CATEGORIES=["geopolitics","macro","rare_earth"] as const;

const SIGNAL_FIELDS = new Set(["id","category","title","what_changed","why_it_matters",
  "topic","geography","development_type","published_at","date_precision",
  "observed_release_count","sources_credited","status","same_event_corrob_verified","severity"]);
function safeSignal(value: unknown, now: number, allowHistorical = false): value is StatelessIntelligenceSignal {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const s = value as Record<string, unknown>;
  if (!isSafeDerivedNewsReadbackSignal(s) ||
      Object.keys(s).length!==SIGNAL_FIELDS.size ||
      Object.keys(s).some(key=>!SIGNAL_FIELDS.has(key)) ||
      !["geopolitics", "macro", "rare_earth"].includes(String(s.category)) ||
      typeof s.id !== "string" ||
      !/^(?:geopolitics|macro|rare_earth)-[0-9a-f]{8}$/u.test(s.id) ||
      typeof s.title !== "string" || s.title.length>240 || !s.title.startsWith("Geomacro finds ") ||
      typeof s.topic!=="string" || s.topic.length>120 ||
      !(s.geography===null || typeof s.geography==="string"&&s.geography.length<=70) ||
      typeof s.development_type!=="string" || s.development_type.length>80 ||
      typeof s.what_changed !== "string" || s.what_changed.length < 30 || s.what_changed.length>650 ||
      typeof s.why_it_matters !== "string" || s.why_it_matters.length < 30 || s.why_it_matters.length>700 ||
      !((s.status==="official_release_observed_unscored" &&
          !String(s.topic).endsWith(" publisher candidate") &&
          s.development_type!=="unverified OSINT feed observation" &&
          Array.isArray(s.sources_credited) &&
          !s.sources_credited.some(x=>typeof x==="string"&&x.startsWith("Monitored feed: "))) ||
        (s.status==="official_feed_candidate_unscored" &&
          ((s.category==="geopolitics"&&s.topic==="geopolitical publisher candidate")||
           (s.category==="macro"&&s.topic==="macro publisher candidate")||
           (s.category==="rare_earth"&&s.topic==="minerals publisher candidate")) &&
          s.development_type==="unclassified publisher update" &&
          s.geography===null) ||
        (s.status==="osint_feed_observed_unverified" &&
          s.development_type==="unverified OSINT feed observation" &&
          s.date_precision==="exact" && s.geography===null &&
          Array.isArray(s.sources_credited)&&s.sources_credited.length===1&&
          typeof s.sources_credited[0]==="string"&&
          s.sources_credited[0].startsWith("Monitored feed: "))) ||
      s.same_event_corrob_verified !== false || s.severity !== null ||
      s.observed_release_count !== 1 ||
      !Array.isArray(s.sources_credited) ||
      s.sources_credited.length > 2 ||
      s.sources_credited.some(c => typeof c !== "string" || c.length > 230)) return false;
  const original = typeof s.published_at === "string" ? s.published_at : "";
  const ms = Date.parse(original);
  if (!Number.isFinite(ms) || ms > now || (!allowHistorical && ms < now - 72 * 3_600_000)) return false;
  // Date.parse can normalize impossible days (e.g. 2026-02-30); require the
  // exact originating Gregorian date, never a JavaScript-normalized alias.
  if (s.date_precision === "day" && new Date(ms).toISOString().slice(0, 10) !== original)
    return false;
  if (s.date_precision === "exact" &&
      (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(original) ||
       new Date(ms).toISOString().slice(0,19)!==original.slice(0,19))) return false;
  // D1 accepts verified publisher-day (without inventing a publication hour)
  // from the three domains, including Statistics Canada original article day.
  // All day-only issues wait the complete next-day 12:00 UTC date-uncertainty boundary.
  const embargoEnd = s.date_precision === "day" &&
    ["rare_earth", "geopolitics", "macro"].includes(String(s.category)) &&
    /^\d{4}-\d{2}-\d{2}$/u.test(original)
    ? ms + 36 * 60 * 60_000
    : s.date_precision === "exact" && /^\d{4}-\d{2}-\d{2}T/u.test(original)
      ? ms
      : Infinity;
  // Source credit for an explicitly UNVERIFIED OSINT record may contain a
  // pinned feed hostname (including www.), not a hyperlink. Never weaken
  // the URL/raw-text prohibition in titles, event text, topics or old cards.
  const raw = JSON.stringify(s);
  const proseOnly = s.status === "osint_feed_observed_unverified"
    ? JSON.stringify({...s, sources_credited:[]}) : raw;
  if (embargoEnd > now || raw.length > 5_000 ||
      /https?:\/\/|www\./iu.test(proseOnly) ||
      (s.status==="osint_feed_observed_unverified" &&
        !/^Monitored feed: [a-z0-9.-]+(?: \(aggregator; original publisher not verified\))?$/u.test(s.sources_credited[0] as string))) return false;
  return true;
}

export function checkedDerivedNews(doc: unknown, now = Date.now()): StatelessIntelligenceSignal[] {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw Error("DERIVED_NEWS_PUBLIC_DOCUMENT_INVALID");
  }
  const value = doc as Record<string, unknown>;
  if (value.ok !== true ||
      value.schema !== "geomacro.website-derived-news-feed.v1" ||
      (value.original_release_delay_minutes!==0&&value.original_release_delay_minutes!==15) ||
      value.retention_days !== 3 || value.retention_hours !== 72 ||
      value.delivery_scope !== "free_website_only" ||
      !Array.isArray(value.signals) || value.signals.length > 250) {
    throw Error("DERIVED_NEWS_PUBLIC_DOCUMENT_INVALID");
  }
  // A malformed object cannot be permitted to smuggle source metadata to UI.
  return value.signals.filter(s => safeSignal(s, now));
}

export async function fetchDirectDerivedNews(
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<StatelessIntelligenceSignal[]> {
  const response = await fetchPublicReadWithRetry(fetchImpl,GEOMACRO_PERMANENT_LATEST_URL,{
    method:"GET",
    headers:{Accept:"application/json"},
  },8_000);
  if (!response.ok || Number(response.headers.get("content-length") ?? 0) > 512_000) {
    throw Error("DERIVED_NEWS_PUBLIC_FETCH_UNAVAILABLE");
  }
  const text = await response.text();
  if (text.length > 512_000) throw Error("DERIVED_NEWS_PUBLIC_TOO_LARGE");
  return checkedDerivedNews(JSON.parse(text), now);
}

/**
 * Read the append-only public archive served by Cloudflare Static Assets.
 * These reads never query D1. Every month/category is an independent immutable
 * shard so one file can stay well below the static-asset size limit.
 */
export async function fetchPermanentDerivedNews(
  fetchImpl:typeof fetch=fetch,now=Date.now(),
):Promise<StatelessIntelligenceSignal[]>{
  if(!Number.isFinite(now))throw Error("DERIVED_NEWS_ARCHIVE_CLOCK_INVALID");
  const indexResponse=await fetchWithoutRedirectUsing(fetchImpl,GEOMACRO_PERMANENT_ARCHIVE_BASE_URL+"/index.json",{
    method:"GET",
    headers:{Accept:"application/json"},signal:AbortSignal.timeout(8_000),
  });
  if(!indexResponse.ok||Number(indexResponse.headers.get("content-length")??0)>256_000)
    throw Error("DERIVED_NEWS_ARCHIVE_INDEX_UNAVAILABLE");
  const indexText=await indexResponse.text();
  if(indexText.length>256_000)throw Error("DERIVED_NEWS_ARCHIVE_INDEX_TOO_LARGE");
  const index=JSON.parse(indexText) as Record<string,unknown>;
  const categories=index.categories;
  if(index.schema!==PERMANENT_ARCHIVE_INDEX_SCHEMA||
     !Array.isArray(index.months)||index.months.length>600||
     index.months.some(month=>typeof month!=="string"||!/^[0-9]{4}-(?:0[1-9]|1[0-2])$/u.test(month))||
     !Array.isArray(index.categories)||
     PERMANENT_ARCHIVE_CATEGORIES.some(category=>!index.categories?.includes(category)))
    throw Error("DERIVED_NEWS_ARCHIVE_INDEX_INVALID");
  const months=[...new Set(index.months as string[])];
  const tasks=months.flatMap(month=>PERMANENT_ARCHIVE_CATEGORIES.map(category=>({month,category})));
  const collected:StatelessIntelligenceSignal[]=[];
  const seen=new Set<string>();
  const batchSize=9;
  for(let start=0;start<tasks.length;start+=batchSize){
    const batch=tasks.slice(start,start+batchSize);
    const documents=await Promise.all(batch.map(async task=>{
      const url=GEOMACRO_PERMANENT_ARCHIVE_BASE_URL+"/archive/"+
        task.month+"/"+task.category+".json";
      const response=await fetchWithoutRedirectUsing(fetchImpl,url,{
        method:"GET",
        headers:{Accept:"application/json"},signal:AbortSignal.timeout(12_000),
      });
      if(!response.ok||Number(response.headers.get("content-length")??0)>20*1024*1024)
        throw Error("DERIVED_NEWS_ARCHIVE_MONTH_UNAVAILABLE");
      const body=await response.text();
      if(body.length>20*1024*1024)throw Error("DERIVED_NEWS_ARCHIVE_MONTH_TOO_LARGE");
      const doc=JSON.parse(body) as Record<string,unknown>;
      if(doc.schema!==PERMANENT_ARCHIVE_MONTH_SCHEMA||doc.month!==task.month||
         doc.category!==task.category||!Array.isArray(doc.signals)||doc.signals.length>100_000)
        throw Error("DERIVED_NEWS_ARCHIVE_MONTH_INVALID");
      return {task,signals:doc.signals};
    }));
    for(const document of documents){
      for(const value of document.signals){
        if(!safeSignal(value,now,true))continue;
        const signal=value as StatelessIntelligenceSignal;
        const originalMonth=signal.date_precision==="day"
          ?signal.published_at.slice(0,7):signal.published_at.slice(0,7);
        if(signal.category!==document.task.category||originalMonth!==document.task.month)
          throw Error("DERIVED_NEWS_ARCHIVE_SHARD_MISMATCH");
        if(seen.has(signal.id))throw Error("DERIVED_NEWS_ARCHIVE_DUPLICATE_ID");
        seen.add(signal.id);collected.push(signal);
      }
    }
  }
  return collected.sort((a,b)=>b.published_at.localeCompare(a.published_at)||a.id.localeCompare(b.id));
}

/**
 * Read every currently retained row of the SAME 72h D1 journal (at most 600),
 * in strict 250-row pages. This does not scan any extra issuer, mutate storage,
 * promote commercial rights or request a payment. Fail closed if a page is
 * missing, duplicated or served by a stale non-paginated Worker.
 */
/** Backward-compatible page reader used only while an older Worker rolls out. */
async function fetchAllDerivedNewsLegacy(
  fetchImpl:typeof fetch,now:number,
):Promise<StatelessIntelligenceSignal[]> {
  const collected:StatelessIntelligenceSignal[]=[];
  const seen=new Set<string>();
  for(const offset of [0,250,500]){
    const url=GEOMACRO_DERIVED_JOURNAL_URL+(offset===0?"":"?offset="+offset);
    // The page fallback is used only for a rolling deployment; request
    // exact fresh pages because the old Worker may serve a longer public TTL.
    const response=await fetchPublicReadWithRetry(fetchImpl,url,{
      method:"GET",redirect:"error",cache:"no-store",
      headers:{Accept:"application/json","Cache-Control":"no-cache"},
    },8_000);
    if(!response.ok||Number(response.headers.get("content-length")??0)>512_000)
      throw Error("DERIVED_NEWS_PAGE_UNAVAILABLE");
    const body=await response.text();
    if(body.length>512_000)throw Error("DERIVED_NEWS_PAGE_TOO_LARGE");
    const doc=JSON.parse(body) as Record<string,unknown>;
    const checkedAt=Date.parse(String(doc.checked_at??""));
    if(!Number.isFinite(checkedAt)||checkedAt>now+5_000||now-checkedAt>30_000)
      throw Error("DERIVED_NEWS_PAGE_STALE_READBACK");
    if(doc.page_offset!==offset||doc.page_size!==250||typeof doc.has_more!=="boolean")
      throw Error("DERIVED_NEWS_PAGE_CONTRACT_INVALID");
    for(const row of checkedDerivedNews(doc,now)){
      if(seen.has(row.id))throw Error("DERIVED_NEWS_PAGE_DUPLICATE_ID");
      seen.add(row.id);collected.push(row);
    }
    if(doc.has_more===false){
      if(doc.next_offset!==null)throw Error("DERIVED_NEWS_PAGE_CURSOR_INVALID");
      return collected;
    }
    if(offset===500||doc.next_offset!==offset+250)
      throw Error("DERIVED_NEWS_PAGE_CURSOR_INVALID");
  }
  throw Error("DERIVED_NEWS_PAGINATION_INCOMPLETE");
}

/**
 * Complete journal read using ONE D1 query/HTTP round-trip, bounded at 600
 * retained rows. The legacy page route is consulted only during deployment
 * propagation when the bundled route is still absent; hard D1 quota failures
 * are never retried or downgraded to three expensive scans.
 */
export async function fetchAllDerivedNews(
  fetchImpl:typeof fetch=fetch,now=Date.now(),options:{fresh?:boolean}={},
):Promise<StatelessIntelligenceSignal[]> {
  if(!Number.isFinite(now))throw Error("DERIVED_NEWS_PAGE_CLOCK_INVALID");
  const fresh=options.fresh!==false;
  // Ordinary website/Ask reads may use the Worker’s short 15s per-POP cache.
  // Exact publication/acceptance callers explicitly set fresh:true, which
  // bypasses that cache without turning every user read into a D1 query.
  const headers:Record<string,string>={Accept:"application/json"};
  if(fresh)headers["Cache-Control"]="no-cache";
  const init:RequestInit={method:"GET",redirect:"error",headers};
  if(fresh)init.cache="no-store";
  const response=await fetchPublicReadWithRetry(fetchImpl,GEOMACRO_DERIVED_BUNDLE_URL,init,8_000);
  if(response.status===401||response.status===404||response.status===405){
    try{await response.body?.cancel()}catch{/* discard old Worker response */}
    return fetchAllDerivedNewsLegacy(fetchImpl,now);
  }
  if(!response.ok||Number(response.headers.get("content-length")??0)>4_000_000)
    throw Error("DERIVED_NEWS_BUNDLE_UNAVAILABLE");
  const body=await response.text();
  if(body.length>4_000_000)throw Error("DERIVED_NEWS_BUNDLE_TOO_LARGE");
  let doc:Record<string,unknown>;
  try{doc=JSON.parse(body) as Record<string,unknown>}
  catch{throw Error("DERIVED_NEWS_BUNDLE_JSON_INVALID")}
  // Older Worker revisions route an unrecognised public path through the
  // default protected handler (401) or return 404/405. Only these route-absence
  // statuses and the explicit old feed schema get a legacy fallback; 429/5xx
  // quota/storage failures are never downgraded to multiple expensive reads.
  if(doc.schema==="geomacro.website-derived-news-feed.v1")
    return fetchAllDerivedNewsLegacy(fetchImpl,now);
  const checkedAt=Date.parse(String(doc.checked_at??""));
  if(!Number.isFinite(checkedAt)||checkedAt>now+5_000||now-checkedAt>30_000)
    throw Error("DERIVED_NEWS_BUNDLE_STALE_READBACK");
  if(doc.ok!==true||doc.schema!=="geomacro.website-derived-news-bundle.v1"||
     doc.original_release_delay_minutes!==0||doc.retention_days!==3||
     doc.retention_hours!==72||doc.delivery_scope!=="free_website_only"||
     doc.complete!==true||doc.item_cap!==600||
     !Array.isArray(doc.signals)||doc.signals.length>600||
     doc.returned_rows!==doc.signals.length||
     !Array.isArray(doc.first_ingest)||doc.first_ingest.length!==doc.signals.length||
     doc.first_ingest.some((row:any,i:number)=>!row||row.id!==((doc.signals as any[])[i] as any)?.id||
       !(row.first_seen_at===null||typeof row.first_seen_at==="string"&&
         Number.isFinite(Date.parse(row.first_seen_at)))))
    throw Error("DERIVED_NEWS_BUNDLE_CONTRACT_INVALID");
  const collected:StatelessIntelligenceSignal[]=[];
  const seen=new Set<string>();
  for(const value of doc.signals){
    if(!safeSignal(value,now))continue;
    const row=value as StatelessIntelligenceSignal;
    if(seen.has(row.id))throw Error("DERIVED_NEWS_BUNDLE_DUPLICATE_ID");
    seen.add(row.id);collected.push(row);
  }
  return collected;
}
