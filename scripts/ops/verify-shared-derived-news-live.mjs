// Read-only post-deploy acceptance of the SAME D1 record IDs delivered
// to Geomacro Intelligence and the Predge pilot. No source fetching or funds.
const ROOT="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/";
async function read(path,fetcher,maxChars=600000){
 const response=await fetcher(ROOT+path,{method:"GET",redirect:"error",
  cache:"no-store",headers:{Accept:"application/json","Cache-Control":"no-cache"},
  signal:AbortSignal.timeout(12_000)});
 if(!response.ok||Number(response.headers.get("content-length")||0)>maxChars)
  throw Error("D1_SHARED_NEWS_HTTP_UNAVAILABLE");
 const txt=await response.text();
 if(txt.length>maxChars)throw Error("D1_SHARED_NEWS_OVERSIZE");
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
 // One bounded bundle fetch replaces three repeated LIMIT/OFFSET reads.
 // The source-neutral structural feed above already reuses this same D1
 // journal through the one-query Worker bundle.
 const bundle=await read("website-derived-news-bundle",fetcher,4_000_000);
 const checkedAt=Date.parse(bundle.checked_at??"");
 if(bundle.ok!==true||bundle.schema!=="geomacro.website-derived-news-bundle.v1"||
    bundle.complete!==true||bundle.item_cap!==600||bundle.returned_rows!==bundle.signals?.length||
    bundle.delivery_scope!=="free_website_only"||bundle.retention_hours!==72||
    bundle.original_release_delay_minutes!==0||
    !Number.isFinite(checkedAt)||Date.now()-checkedAt>30_000||
    !Array.isArray(bundle.signals)||bundle.signals.length>600||
    !Array.isArray(bundle.first_ingest)||bundle.first_ingest.length!==bundle.signals.length||
    bundle.first_ingest.some((row,i)=>!row||row.id!==bundle.signals[i]?.id||
      !(row.first_seen_at===null||typeof row.first_seen_at==="string"&&Number.isFinite(Date.parse(row.first_seen_at)))))
   throw Error("D1_SHARED_NEWS_BUNDLE_INVALID");
 for(const story of bundle.signals){
  if(typeof story?.id!=="string"||journal.has(story.id))throw Error("D1_SHARED_NEWS_DUPLICATE");
  journal.set(story.id,story);
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
 "D1_SHARED_NEWS_BUNDLE_INVALID",
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
 return Object.freeze({
  schema:"geomacro.shared-d1-predge-safe-failure.v1",
  verified:false,reason,partner_delivery_verified:false,
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
