// Independent public D1 audit. It uses only derived-story IDs and timestamps;
// no upstream article, commercial grant, signed GRO or website-first-render claim.
const CATS=["geopolitics","macro","rare_earth"];
const MAX=600, WINDOW=72*3600_000, DELAY=0, TARGET=20*60_000;
const fail=reason=>{throw Error("DERIVED_JOURNAL_AUDIT_"+reason);};
const parse=s=>Number.isFinite(Date.parse(s))?Date.parse(s):NaN;
export function auditDerivedJournalPages(pages,now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    !Array.isArray(pages)||pages.length<1||pages.length>3)fail("INPUT_INVALID");
 const idSet=new Set(), records=[], ingestion=[];
 let closed=false;
 for(let i=0;i<pages.length;i++){
  const p=pages[i],offset=i*250;
  if(closed||p?.ok!==true||
     p.schema!=="geomacro.website-derived-news-feed.v1"||
     p.page_offset!==offset||p.page_size!==250||
     (p.original_release_delay_minutes!==0&&p.original_release_delay_minutes!==15)||
     p.retention_hours!==72||p.delivery_scope!=="free_website_only"||
     p.ingest_clock_kind!=="D1_FIRST_INSERT_NOT_WEBSITE_FIRST_RENDER"||
     !Array.isArray(p.signals)||!Array.isArray(p.first_ingest)||
     p.signals.length!==p.first_ingest.length||
     p.signals.length>250||typeof p.has_more!=="boolean"||
     p.has_more!==(i<pages.length-1)||
     p.next_offset!==(p.has_more?offset+250:null))fail("PAGE_INVALID");
  const at=parse(p.checked_at);
  if(!Number.isFinite(at)||at>now.getTime()+60_000||
     now.getTime()-at>5*60_000)fail("CLOCK_STALE");
  for(let j=0;j<p.signals.length;j++){
   const s=p.signals[j],i0=p.first_ingest[j];
   if(!CATS.includes(s?.category)||typeof s?.id!=="string"||
      idSet.has(s.id)||i0?.id!==s.id)fail("IDENTITY_MISMATCH");
   const published=parse(s.published_at),first=parse(i0.first_seen_at);
   if(!Number.isFinite(published)||!Number.isFinite(first)||
      first>now.getTime()+60_000||first<published+DELAY||
      published>now.getTime()||published<now.getTime()-WINDOW||
      !["exact","day"].includes(s.date_precision)||
      !Array.isArray(s.sources_credited))fail("TIME_OR_PROVENANCE_INVALID");
   idSet.add(s.id);records.push(s);ingestion.push({s,published,first});
  }
  closed=!p.has_more;
 }
 if(!closed||records.length>MAX)fail("TRUNCATED_OR_OVER_CAP");
 const exact=ingestion.filter(x=>x.s.date_precision==="exact");
 const latency=exact.map(x=>Math.round((x.first-x.published)/60_000));
 latency.sort((a,b)=>a-b);
 const categoryCounts=Object.fromEntries(CATS.map(c=>[c,records.filter(s=>s.category===c).length]));
 const creditRequired=records.filter(s=>s.sources_credited.length>0).length;
 const first20=exact.filter(x=>x.first-x.published<=TARGET).length;
 return Object.freeze({
  schema:"geomacro.global-derived-journal-latency-audit.v1",
  audited_at:now.toISOString(),
  readback_pages:pages.length,retained_unique_rows:records.length,
  retained_limit:MAX,retained_capacity_pct:Number((records.length*100/MAX).toFixed(1)),
  remaining_record_slots:MAX-records.length,
  total_source_history_complete:false, // 600 cap can evict before the 72h TTL
  potential_early_eviction_risk:records.length>=MAX,
  counts:categoryCounts,credit_required_rows:creditRequired,
  source_neutral_rows:records.length-creditRequired,
  exact_publication_clock_rows:exact.length,
  day_precision_excluded_rows:records.length-exact.length,
  d1_first_insert_within_20m:first20,
  d1_first_insert_over_20m:exact.length-first20,
  d1_first_insert_p95_minutes:latency.length?latency[Math.ceil(latency.length*.95)-1]:null,
  d1_first_insert_median_minutes:latency.length?latency[Math.floor((latency.length-1)/2)]:null,
  website_first_render_timestamp_verified:false,
  actual_website_20min_sla_verified:false,
  country_labels_are_not_195x3_original_coverage:true,
  live_585_original_cells_verified_by_this_audit:0,
  commercial_rights_verified:false,signed_products_verified:false,
  raw_upstream_content_logged:false,supabase_requests:0,b2_requests:0,payments:0,
 });
}
const ROOT="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news-immediate";
const BUNDLE="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news-bundle";
export async function auditLiveDerivedJournal(fetcher=fetch,now=new Date()){
 const response=await fetcher(BUNDLE,{method:"GET",redirect:"error",cache:"no-store",
  headers:{Accept:"application/json"},signal:AbortSignal.timeout(12000)});
 if(!response.ok||Number(response.headers.get("content-length")||0)>4_000_000)
  fail("PUBLIC_READBACK_UNAVAILABLE");
 const raw=await response.text();
 if(raw.length>4_000_000)fail("PUBLIC_READBACK_OVERSIZE");
 const bundle=JSON.parse(raw);
 if(bundle?.ok!==true||bundle.schema!=="geomacro.website-derived-news-bundle.v1"||
    bundle.complete!==true||bundle.item_cap!==600||bundle.returned_rows!==bundle.signals?.length||
    bundle.delivery_scope!=="free_website_only"||bundle.retention_hours!==72||
    bundle.original_release_delay_minutes!==0||
    !Array.isArray(bundle.signals)||bundle.signals.length>600||
    !Array.isArray(bundle.first_ingest)||bundle.first_ingest.length!==bundle.signals.length||
    bundle.first_ingest.some((row,i)=>!row||row.id!==bundle.signals[i]?.id||
      !(row.first_seen_at===null||typeof row.first_seen_at==="string"&&Number.isFinite(Date.parse(row.first_seen_at)))))
  fail("BUNDLE_INVALID");
 const at=parse(bundle.checked_at);
 if(!Number.isFinite(at)||at>now.getTime()+60_000||now.getTime()-at>5*60_000)
  fail("CLOCK_STALE");
 const pages=[];
 if(bundle.signals.length===0){
  pages.push({ok:true,schema:"geomacro.website-derived-news-feed.v1",
   checked_at:bundle.checked_at,original_release_delay_minutes:0,
   retention_days:3,retention_hours:72,delivery_scope:"free_website_only",
   ingest_clock_kind:bundle.ingest_clock_kind,page_offset:0,page_size:250,
   has_more:false,next_offset:null,signals:[],first_ingest:[]});
 }else{
  for(let start=0;start<bundle.signals.length;start+=250){
   const signals=bundle.signals.slice(start,start+250);
   const first_ingest=bundle.first_ingest.slice(start,start+250);
   const hasMore=start+250<bundle.signals.length;
   pages.push({ok:true,schema:"geomacro.website-derived-news-feed.v1",
    checked_at:bundle.checked_at,original_release_delay_minutes:0,
    retention_days:3,retention_hours:72,delivery_scope:"free_website_only",
    ingest_clock_kind:bundle.ingest_clock_kind,page_offset:start,page_size:250,
    has_more:hasMore,next_offset:hasMore?start+250:null,signals,first_ingest});
  }
 }
 return auditDerivedJournalPages(pages,now);
}
/** Receipt time provides a conservative upper bound: this exact derived
 * story was in served article HTML by then. It is not the first browser paint
 * and never establishes an unconditional global delivery SLA. */
export function auditObservedWebsiteLatency(journal,html,observedAt=new Date()){
 if(!Array.isArray(journal?.signals)||typeof html!=="string"||
    !(observedAt instanceof Date)||!Number.isFinite(observedAt.getTime()))
  fail("WEBSITE_OBSERVATION_INVALID");
 const rendered=new Set([...html.matchAll(/<article\b[^>]*\bdata-geomacro-story-id="((?:geopolitics|macro|rare_earth)-[0-9a-f]{8})"/gu)]
  .map(match=>match[1]));
 const ids=new Set(),samples=[];
 for(const row of journal.signals){
  if(!CATS.includes(row?.category)||!rendered.has(row?.id)||ids.has(row.id)||row.date_precision!=="exact"||
     row.status!=="official_release_observed_unscored"||
     typeof row.topic!=="string"||row.topic.endsWith(" publisher candidate"))continue;
  const published=parse(row.published_at),latency=observedAt.getTime()-published;
  if(!Number.isFinite(published)||latency<DELAY||latency>WINDOW)continue;
  ids.add(row.id);samples.push({id:row.id,category:row.category,
   source_published_at:row.published_at,website_observed_at:observedAt.toISOString(),
   latency_upper_bound_seconds:Math.ceil(latency/1000),within_20_minutes:latency<=TARGET});
 }
 const qualifying=samples.filter(s=>s.within_20_minutes);
 return {schema:"geomacro.website-observed-publication-latency.v1",
  observed_at:observedAt.toISOString(),measurement:"SERVED_ARTICLE_HTML_RECEIPT_UPPER_BOUND",
  samples,matched_exact_clock_stories:samples.length,
  qualifying_20min_samples:qualifying.length,
  actual_website_20min_sample_verified:qualifying.length>0,
  qualifying_categories:CATS.filter(c=>qualifying.some(s=>s.category===c)),
  website_first_render_timestamp_verified:false,universal_20min_sla_verified:false,
  raw_upstream_content_logged:false,payments:0};
}
export async function auditLiveWebsiteLatency(fetcher=fetch){
 const [j,s]=await Promise.all([
  fetcher(ROOT,{headers:{Accept:"application/json"},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(12000)}),
  fetcher("https://geomacro.live/intelligence",{headers:{Accept:"text/html"},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(12000)}),
 ]);
 if(j.status!==200||s.status!==200)fail("WEBSITE_READBACK_UNAVAILABLE");
 const [raw,html]=await Promise.all([j.text(),s.text()]);
 const observedAt=new Date();
 if(raw.length>600000||html.length>1500000)fail("WEBSITE_READBACK_OVERSIZE");
 const journal=JSON.parse(raw);
 if(journal.schema!=="geomacro.website-derived-news-feed.v1"||journal.ok!==true||
    (journal.original_release_delay_minutes!==0&&journal.original_release_delay_minutes!==15)||journal.retention_hours!==72)
  fail("WEBSITE_JOURNAL_INVALID");
 return auditObservedWebsiteLatency(journal,html,observedAt);
}
if(process.argv[1]?.endsWith("derived-news-latency-audit.mjs")){
 try{console.log(JSON.stringify(process.argv.includes("--website-observed")
  ?await auditLiveWebsiteLatency():await auditLiveDerivedJournal()));}
 catch{console.error("::error::DERIVED_NEWS_LATENCY_OR_JOURNAL_AUDIT_UNAVAILABLE");process.exitCode=2;}
}
