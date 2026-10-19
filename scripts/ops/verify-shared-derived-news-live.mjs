// Read-only post-deploy acceptance of the SAME D1 record IDs delivered
// to Geomacro Intelligence and the Predge pilot. No source fetching or funds.
const ROOT="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/";
async function read(path,fetcher){
 const response=await fetcher(ROOT+path,{method:"GET",redirect:"error",
  cache:"no-store",headers:{Accept:"application/json"},
  signal:AbortSignal.timeout(12_000)});
 if(!response.ok||Number(response.headers.get("content-length")||0)>600000)
  throw Error("D1_SHARED_NEWS_HTTP_UNAVAILABLE");
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
      !feed.availability_by_category?.[c]))
   throw Error("D1_SHARED_NEWS_CONTRACT_INVALID");
 const journal=new Map();
 for(const offset of [0,250,500]){
  const page=await read("website-derived-news"+(offset?"?offset="+offset:""),fetcher);
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
    row.payable!==false||row.commercial_derived_rights_verified!==false)
   throw Error("D1_SHARED_NEWS_SOURCE_PARITY_MISMATCH");
  used.add(row.id);
 }
 for(const category of domains){
  if(feed.counts[category]!==feed.items.filter(r=>r.category===category).length)
   throw Error("D1_SHARED_NEWS_DOMAIN_COUNT_MISMATCH");
 }
 return {schema:"geomacro.shared-d1-predge-live-proof.v1",
  same_journal_ids_verified:true,counts:feed.counts,
  retention_hours:72,original_release_delay_minutes:15,
  commercial_rights_verified:false,b2_requests:0,d1_writes:0,payments:0};
}
if(process.argv[1]?.endsWith("verify-shared-derived-news-live.mjs")){
 try{console.log(JSON.stringify(await verifySharedNewsLive()))}
 catch{console.error("::error::SHARED_NEWS_PREDGE_LIVE_PARITY_FAILED");process.exitCode=2}
}
