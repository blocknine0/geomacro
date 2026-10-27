// Read-only post-deploy acceptance of the SAME D1 record IDs delivered
// to Geomacro Intelligence and the Predge pilot. No source fetching or funds.
const ROOT="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/";
async function read(path,fetcher){
 const response=await fetcher(ROOT+path,{method:"GET",redirect:"error",
  // Explicit edge bypass: Node fetch cache:"no-store" alone does not bypass
  // the Cloudflare per-POP Cache API on production requests.
  cache:"no-store",headers:{Accept:"application/json","Cache-Control":"no-cache"},
  signal:AbortSignal.timeout(12_000)});
 if(!response.ok){
  // Only a small fixed allowlist leaves the isolated verifier runner.
  // Never log response text, headers, URLs, or private records. This
  // distinguishes a D1/Worker 503 from an edge 429 or auth/route failure.
  const error=new Error("D1_SHARED_NEWS_HTTP_UNAVAILABLE");
  error.safe_http_status=[400,401,403,404,408,409,413,422,429,500,502,503,504,520,522,524]
    .includes(response.status)?response.status:0;
  error.safe_route=path.startsWith("derived-structural-72h")?
    "SOURCE_NEUTRAL_MACHINE":"CANONICAL_NEWS_PAGE";
  if(error.safe_http_status===503){
    try{
      const size=Number(response.headers.get("content-length")||0);
      if(size<=2048){
        const doc=await response.clone().json();
        if(["SHARED_NEWS_D1_JOURNAL_OVER_CAP","SHARED_NEWS_D1_UNAVAILABLE",
             "DERIVED_NEWS_D1_READ_UNAVAILABLE","D1_FREE_QUOTA_EXCEEDED",
             "DERIVED_NEWS_BUNDLE_HARD_CAP_EXCEEDED"].includes(doc?.error))
          error.safe_public_code=doc.error;
      }
    }catch{/* No response body or upstream text is ever surfaced */ }
  }
  throw error;
 }
 if(Number(response.headers.get("content-length")||0)>600000)
  throw Error("D1_SHARED_NEWS_OVERSIZE");
 const txt=await response.text();
 if(txt.length>600000)throw Error("D1_SHARED_NEWS_OVERSIZE");
 return JSON.parse(txt);
}
export async function verifySharedNewsLive(fetcher=fetch){
 const feed=await read("derived-structural-72h",fetcher);
 const domains=["geopolitics","macro","rare_earth"];
 if(feed?.schema!=="geomacro.derived-news-structural-feed.v1"||
    feed.ok!==true||feed.chargeable!==false||
    feed.commercial_rights_verified!==false||
    feed.partner_resale_or_commercial_redistribution_authorized!==false||
    feed.raw_upstream_delivered!==false||!Array.isArray(feed.items)||
    feed.items.length>600||
    domains.some(c=>!Number.isSafeInteger(feed.counts?.[c])||
      !feed.availability_by_category?.[c]||
     feed.availability_by_category[c].latest_source_check?.commercial_rights_verified!==false||
     feed.availability_by_category[c].latest_source_check?.paid_delivery_authorized!==false||
     !Number.isSafeInteger(feed.availability_by_category[c].journal_derived_records_72h)))
   throw Error("D1_SHARED_NEWS_CONTRACT_INVALID");
 const journal=new Map();
 for(const offset of [0,250,500]){
  // The shared 72h public research feed reads zero-delay D1 rows. The
  // legacy /website-derived-news alias has a 15-minute presentation hold;
  // comparing it with the immediate shared feed creates false parity reds
  // precisely when new genuine rows arrive. Compare the SAME immediate D1
  // journal, never reassign first-seen or publisher publication timestamps.
  const page=await read("website-derived-news-immediate"+
    (offset?"?offset="+offset:""),fetcher);
  if(page.ok!==true||page.page_offset!==offset||page.page_size!==250||
     !Array.isArray(page.signals)||page.signals.length>250||
     typeof page.has_more!=="boolean")throw Error("D1_SHARED_NEWS_PAGE_INVALID");
  for(const story of page.signals){
   if(journal.has(story.id))throw Error("D1_SHARED_NEWS_DUPLICATE");
   journal.set(story.id,story);
  }
  if(!page.has_more){
   if(page.next_offset!==null)throw Error("D1_SHARED_NEWS_CURSOR_INVALID");
   break;
  }
  if(offset===500||page.next_offset!==offset+250)
   throw Error("D1_SHARED_NEWS_CURSOR_INVALID");
 }
 const expected=[...journal.values()].filter(s=>s.sources_credited?.length===0);
 if(expected.length!==feed.items.length)
  throw Error("D1_SHARED_NEWS_DIFFERENT_ID_COUNT");
 const used=new Set();
 for(const row of feed.items){
  const original=journal.get(row.id);
  if(used.has(row.id)||!original||original.sources_credited.length!==0||
    original.category!==row.category||
    original.published_at!==row.original_published_at||
    original.what_changed!==row.observed_change||
    original.why_it_matters!==row.potential_relevance||
    row.qualifying_topic_release_verified!==(original.status==="official_release_observed_unscored")||
    row.topical_match_verified!==(original.status==="official_release_observed_unscored")||
    row.confidence_state!==(original.status==="official_feed_candidate_unscored"?
      "DATED_OFFICIAL_FEED_CANDIDATE_UNCLASSIFIED":"OFFICIAL_RELEASE_OBSERVED_UNSCORED")||
    row.payable!==false||row.commercial_derived_rights_verified!==false)
   throw Error("D1_SHARED_NEWS_SOURCE_PARITY_MISMATCH");
  used.add(row.id);
 }
 for(const category of domains){
  if(feed.counts[category]!==feed.items.filter(r=>r.category===category).length)
   throw Error("D1_SHARED_NEWS_DOMAIN_COUNT_MISMATCH");
  const observed=[...journal.values()].filter(s=>s.category===category);
  const sourceHeld=observed.filter(s=>s.sources_credited?.length>0).length;
  const state=feed.availability_by_category[category];
  if(state.journal_derived_records_72h!==observed.length||
     state.journal_credit_required_records_72h!==sourceHeld||
     state.withheld_from_source_neutral_view_72h!==observed.length-feed.counts[category]||
     state.producer_run_freshness_verified!==
       state.latest_source_check.current_source_check_verified||
     state.reference_data_is_not_a_new_official_release!==true)
    throw Error("D1_SHARED_NEWS_DIAGNOSIS_PARITY_MISMATCH");
 }
 return {schema:"geomacro.shared-d1-predge-live-proof.v1",
  same_journal_ids_verified:true,counts:feed.counts,
  retention_hours:72,original_release_delay_minutes:0,
  commercial_rights_verified:false,b2_requests:0,d1_writes:0,payments:0};
}
// Bounded, public-source-free diagnostics. Do not echo provider responses,
// article IDs/URLs, D1 records, request headers, addresses or error.stack.
// A failed online check must NEVER be converted into a success exit status.
const SAFE_SHARED_NEWS_FAILURES=new Set([
 "D1_SHARED_NEWS_HTTP_UNAVAILABLE",
 "D1_SHARED_NEWS_OVERSIZE",
 "D1_SHARED_NEWS_CONTRACT_INVALID",
 "D1_SHARED_NEWS_PAGE_INVALID",
 "D1_SHARED_NEWS_DUPLICATE",
 "D1_SHARED_NEWS_CURSOR_INVALID",
 "D1_SHARED_NEWS_DIFFERENT_ID_COUNT",
 "D1_SHARED_NEWS_SOURCE_PARITY_MISMATCH",
 "D1_SHARED_NEWS_DOMAIN_COUNT_MISMATCH",
 "D1_SHARED_NEWS_DIAGNOSIS_PARITY_MISMATCH",
]);
export function safeSharedNewsParityFailure(error){
 const reason=error instanceof Error&&SAFE_SHARED_NEWS_FAILURES.has(error.message)
  ?error.message:"D1_SHARED_NEWS_UNCLASSIFIED_OR_TRANSPORT_FAILURE";
 const scoped=reason==="D1_SHARED_NEWS_HTTP_UNAVAILABLE";
 const status=scoped&&[400,401,403,404,408,409,413,422,429,500,502,503,504,520,522,524]
  .includes(error?.safe_http_status)?error.safe_http_status:0;
 const route=scoped&&["SOURCE_NEUTRAL_MACHINE","CANONICAL_NEWS_PAGE"].includes(error?.safe_route)?
  error.safe_route:null;
 const publicCode=scoped&&[
  "SHARED_NEWS_D1_JOURNAL_OVER_CAP","SHARED_NEWS_D1_UNAVAILABLE",
  "DERIVED_NEWS_D1_READ_UNAVAILABLE","D1_FREE_QUOTA_EXCEEDED",
  "DERIVED_NEWS_BUNDLE_HARD_CAP_EXCEEDED"
 ].includes(error?.safe_public_code)?error.safe_public_code:null;
 return Object.freeze({
  schema:"geomacro.shared-d1-predge-safe-failure.v1",
  verified:false,reason,upstream_http_status:status,
  failed_public_route:route,upstream_public_error_code:publicCode,
  partner_delivery_verified:false,
  original_source_rights_verified:false,paid_product_ready:false,
  private_article_or_record_id_exposed:false,
  raw_upstream_data_exposed:false,network_retry_or_write_performed:false,
  payments:0,
 });
}
if(process.argv[1]?.endsWith("verify-shared-derived-news-live.mjs")){
 try{console.log(JSON.stringify(await verifySharedNewsLive()))}
 catch(error){
  console.error("::error::SHARED_NEWS_PREDGE_LIVE_PARITY_FAILED");
  console.error(JSON.stringify(safeSharedNewsParityFailure(error)));
  process.exitCode=2;
 }
}
