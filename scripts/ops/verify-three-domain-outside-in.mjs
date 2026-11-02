#!/usr/bin/env node
/**
 * Independent, NO-FUNDS, read-only three-domain publication acceptance.
 * Exactly one public journal bundle read and public archive/site GETs.
 * This does not certify private original bytes, merchant rights, paid GRO,
 * or the freshness of every one of the 585 country-category cells.
 */
const DOMAIN=["geopolitics","macro","rare_earth"];
const BASE="https://geomacro-public-finds-archive.daspallab202391.workers.dev";
const SITE="https://geomacro.live";
const JOURNAL="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news-bundle";
const MAX_SNAPSHOT_AGE=6*3600_000, RETENTION=72*3600_000;
const fail=code=>{throw Error("THREE_DOMAIN_LIVE_"+code)};
const stamp=v=>Date.parse(typeof v==="string"?v:"");
const safeId=s=>typeof s==="string"&&/^(?:geopolitics|macro|rare_earth)-[0-9a-f]{8}$/u.test(s);
const escDecode=s=>s.replace(/&#x([0-9a-f]+);/giu,(_,n)=>String.fromCodePoint(parseInt(n,16)))
 .replace(/&#([0-9]+);/gu,(_,n)=>String.fromCodePoint(Number(n)))
 .replace(/&(?:amp|quot|apos|lt|gt|#39);/gu,m=>
 ({"&amp;":"&","&quot;":'"',"&apos;":"'","&lt;":"<","&gt;":">","&#39;":"'"}[m]??m));
export function verifyThreeDomainLivePublication({
 index,latest,coverage,daily,journal,htmlByCategory,now=Date.now(),requirePositive=true,
 classifyDisplay=null,isArchiveEligible=null,isTemplateObservation=null,strictBacklog=true,
 archiveOriginalIds=null
}={}){
 if(!Number.isFinite(now)||!index||!latest||!coverage||!daily||!journal||!htmlByCategory)
  fail("MISSING_DOCUMENT");
 if(index.schema!=="geomacro.permanent-derived-news-archive-index.v1"||
  latest.schema!=="geomacro.website-derived-news-feed.v1"||latest.ok!==true||
  latest.retention_hours!==72||latest.chargeable!==false||latest.scored!==false||
  latest.delivery_scope!=="free_website_only"||latest.supabase_dependency!==false||
  coverage.schema!=="geomacro.free-derived-archive-eligibility.v1"||
  coverage.retention_hours!==72||coverage.signed_or_scored!==false||
  coverage.paid_customer_eligible!==false||coverage.live_payment_authorized!==false||
  daily.schema!=="geomacro.public-daily-official-finds.v1"||
  daily.ok!==true||daily.chargeable!==false||daily.official_only!==true||
  journal.schema!=="geomacro.website-derived-news-bundle.v1"||journal.ok!==true||
  journal.complete!==true||journal.item_cap!==600)
  fail("CONTRACT_INVALID");
 const clock=stamp(latest.checked_at);
 if(!Number.isFinite(clock)||clock>now+60_000||now-clock>MAX_SNAPSHOT_AGE||
  coverage.checked_at!==latest.checked_at||
  daily.generated_at!==latest.checked_at||
  index.updated_at!==latest.checked_at)
  fail("STATIC_COHORT_CLOCK_MISMATCH");
 if(!Array.isArray(latest.signals)||latest.signals.length>250||
  !Array.isArray(daily.signals)||daily.signals.length>36||
  !Array.isArray(journal.signals)||journal.signals.length>600||
  journal.returned_rows!==journal.signals.length||
  !Number.isSafeInteger(index.total_signals)||index.total_signals<latest.signals.length)
  fail("ROW_BOUND_INVALID");
 const journalClock=stamp(journal.checked_at);
 if(!Number.isFinite(journalClock)||Math.abs(now-journalClock)>120_000)
  fail("JOURNAL_CLOCK_INVALID");
 const byCategory=Object.fromEntries(DOMAIN.map(c=>[c,{archive:[],journal:[],official:0,osint:0}]));
 const ids=new Set();
 for(const s of latest.signals){
  if(!DOMAIN.includes(s?.category)||!safeId(s?.id)||ids.has(s.id)||
   !["official_release_observed_unscored","osint_feed_observed_unverified","official_feed_candidate_unscored"].includes(s.status)||
   !Number.isFinite(stamp(s.published_at))||stamp(s.published_at)>clock||
   stamp(s.published_at)<clock-RETENTION||
   s.same_event_corrob_verified!==false||s.severity!==null)
   fail("STATIC_NATIVE_OR_ID_INVALID");
  ids.add(s.id);
  const c=byCategory[s.category];
  c.archive.push(s);
  if(s.status==="official_release_observed_unscored")c.official++;
  if(s.status==="osint_feed_observed_unverified")c.osint++;
 }
 const journalIds=new Map();
 for(const s of journal.signals){
  if(!safeId(s?.id)||!DOMAIN.includes(s.category)||journalIds.has(s.id))
   fail("JOURNAL_ID_INVALID");
  journalIds.set(s.id,s);
  byCategory[s.category].journal.push(s);
 }
 if(daily.signals.some(s=>s.status!=="official_release_observed_unscored"||
  !DOMAIN.includes(s.category)||!safeId(s.id)))
  fail("DAILY_OFFICIAL_ONLY_INVALID");
 const firstIngest=new Map(
  (Array.isArray(journal.first_ingest)?journal.first_ingest:[])
    .filter(x=>safeId(x?.id)).map(x=>[x.id,stamp(x.first_seen_at)]));
 const result={};
 let agedBacklog=0;
 for(const category of DOMAIN){
  const domain=byCategory[category];
  // D1 releases expired originals immediately; a static snapshot remains
  // coherent for up to 6h. Compare ONLY original-dated rows still within
  // the rolling 72h window at the outside-in observation time.
  const active=domain.archive.filter(s=>
   stamp(s.published_at)>=now-RETENTION&&stamp(s.published_at)<=now);
  const matching=active.filter(s=>{
   const d=journalIds.get(s.id);
   return d&&d.category===s.category&&d.published_at===s.published_at&&
    d.date_precision===s.date_precision&&d.status===s.status;
  });
  const html=htmlByCategory[category];
  if(typeof html!=="string"||html.length<100||
   !html.includes("What changed in the world"))fail("WEBSITE_HTML_"+category);
  // Source-derived text may retain an HTML entity (e.g. &#x27;) that React
  // renders as a character. Decode both sides, not only the HTML bytes.
  const decoded=escDecode(escDecode(html));
  const rendered=active.filter(s=>typeof s.title==="string"&&
   decoded.includes(escDecode(escDecode(s.title))));
  if(requirePositive&&active.length===0)
   fail("THREE_CATEGORY_NO_CURRENT_ORIGINAL_"+category);
  if(matching.length!==active.length)
   fail("D1_PUBLIC_JOURNAL_EXACT_ID_MISMATCH_"+category);
  if(rendered.length!==active.length)
   fail("WEBSITE_EXACT_RENDER_MISMATCH_"+category);
  // The 250-row public "latest" is a intentionally deduplicated/ranked
  // presentation, not the immutable archive. A canonical article already
  // retained in a month/category static shard is NOT unpublished just
  // because its display card is omitted from the preview.
  const previewIds=new Set(domain.archive.map(x=>x.id));
  const archivedIds=archiveOriginalIds instanceof Set?
    archiveOriginalIds:previewIds;
  const unrepresented=domain.journal.filter(s=>
   !archivedIds.has(s.id)&&stamp(s.published_at)>=now-RETENTION&&
   stamp(s.published_at)<=now);
  // Static publisher intentionally rejects generic placeholder/actorless
  // templates even if an older display heuristic considers them concrete.
  // Measure backlog using the EXACT same archive admissions, never charge
  // an intentional rejection against operational source-to-archive parity.
  const templatesExcluded=typeof isTemplateObservation==="function"?
    unrepresented.filter(s=>isTemplateObservation(s)).length:0;
  const concreteEligible=typeof classifyDisplay==="function"&&
   typeof isArchiveEligible==="function"
    ?unrepresented.filter(s=>classifyDisplay(s)===null&&
      isArchiveEligible(s,now,{allowHistorical:false})&&
      !(typeof isTemplateObservation==="function"&&isTemplateObservation(s)))
    :[];
  const overdueConcrete=concreteEligible.filter(s=>{
    const first=firstIngest.get(s.id);
    return Number.isFinite(first)&&first<=clock;
  });
  const overdue90=overdueConcrete.filter(s=>
    now-(firstIngest.get(s.id)??now)>=90*60_000);
  // A valid, concrete source-neutral D1 finding that remains absent from
  // static for over an hourly primary + recovery interval is an actual
  // publication gap, even when all the already-archived rows render.
  agedBacklog+=overdue90.length;
  if(overdue90.length>0&&strictBacklog){
   // Counts-only diagnostic from the same single already-budgeted journal
   // GET: no extra source/D1 reads, no original URLs, no private raw bytes.
   console.error(JSON.stringify({
    schema:"geomacro.canonical-static-backlog-diagnostic.v1",
    category,canonical_rows:domain.journal.length,
    public_archive_rows:domain.archive.length,
    unrepresented_d1_rows:unrepresented.length,
    intentional_templates_excluded:templatesExcluded,
   represented_in_full_shards_not_latest_preview:domain.journal.filter(x=>
     !previewIds.has(x.id)&&archivedIds.has(x.id)).length,
    eligible_unrepresented:concreteEligible.length,
    eligible_older_than_90m:overdue90.length,
    total_original_event_ids_logged:0,
    new_d1_requests:0,rights_verified:false,
   }));
   fail("CANONICAL_ELIGIBLE_ARCHIVE_BACKLOG_"+category);
  }
  const rejectionClasses=typeof classifyDisplay==="function"
   ?Object.fromEntries([...new Set(unrepresented.map(s=>classifyDisplay(s)??"ELIGIBLE"))]
      .map(reason=>[reason,unrepresented.filter(s=>(classifyDisplay(s)??"ELIGIBLE")===reason).length]))
   :null;
  result[category]={
   public_d1_not_in_static:unrepresented.length,
   intentionally_rejected_archive_templates:templatesExcluded,
   public_d1_not_in_static_display_rejections:rejectionClasses,
   public_d1_not_in_static_concrete:concreteEligible.length,
   concrete_not_static_before_snapshot:overdueConcrete.length,
   concrete_missing_older_than_30m:overdueConcrete.filter(s=>
    now-(firstIngest.get(s.id)??now)>=30*60_000).length,
   concrete_missing_first_ingest_age_minutes:Object.fromEntries(
    overdueConcrete.slice(0,8).map(s=>[s.id,
     Math.floor((now-(firstIngest.get(s.id)??now))/60_000)])),
   concrete_not_static_before_snapshot_ids:overdueConcrete.map(s=>s.id).slice(0,8),
   public_d1_not_in_static_by_status:Object.fromEntries(
    ["official_release_observed_unscored","official_feed_candidate_unscored",
     "osint_feed_observed_unverified"].map(status=>
      [status,unrepresented.filter(s=>s.status===status).length])),
   public_d1_not_in_static_sample_ids:unrepresented.map(s=>s.id).slice(0,8),
   static_snapshot_rows:domain.archive.length,
   expired_since_snapshot:domain.archive.length-active.length,
   live_72h_rows:active.length,public_d1_rows:domain.journal.length,
   matching_public_d1_ids:matching.length,website_rendered_matching_archive:rendered.length,
   missing_website_derived_ids:active.filter(s=>!rendered.includes(s))
    .map(s=>s.id).slice(0,10),
   official_derived:active.filter(s=>s.status==="official_release_observed_unscored").length,
   unverified_osint:active.filter(s=>s.status==="osint_feed_observed_unverified").length,
   newest_original:active.map(x=>x.published_at).sort().at(-1)??null
  };
 }
 return Object.freeze({
  schema:"geomacro.three-domain-outside-in-parity.v1",
  verified:agedBacklog===0,source_to_public_complete:agedBacklog===0,
  aged_eligible_unpublished:agedBacklog,original_dates_preserved:true,
  public_d1_to_static_id_parity:true,public_website_rendering_verified:true,
  canonical_private_d1_write_receipt_verified:false,
  static_snapshot_at:latest.checked_at,
  static_total_historical:index.total_signals,
  static_latest_rows:latest.signals.length,
  homepage_official_highlights:daily.signals.length,
  category:result,raw_source_bytes_logged:false,
  private_source_references_logged:false,paid_eligible:false,predge_modified:false,payments:0
 });
}
async function readText(url,limit=2_000_000,attempts=3){
 let last;
 for(let i=0;i<attempts;i++){
  try{
   const r=await fetch(url,{method:"GET",redirect:"error",cache:"no-store",
    headers:{Accept:"application/json,text/html","Cache-Control":"no-cache"},
    signal:AbortSignal.timeout(12_000)});
   if(r.ok&&r.status===200){
    const text=await r.text();
    if(text.length>limit)fail("PUBLIC_READ_OVERSIZE");
    return text;
   }
   last=Error("HTTP_"+r.status);
  }catch(e){last=e;}
  if(i+1<attempts)await new Promise(resolve=>setTimeout(resolve,(i+1)*800));
 }
 const reason=/^HTTP_[0-9]{3}$/u.test(String(last?.message??""))
   ?String(last.message):"NETWORK";
 throw Error("THREE_DOMAIN_LIVE_PUBLIC_READ_UNAVAILABLE_"+new URL(url).hostname+"_"+reason);
}
/** Download only public, immutable month shards overlapping the rolling
 * 72-hour original window. No D1/B2/publisher calls, and no preview-based
 * false positives. Existing index.months provides exact announced partitions.
 */
export async function readCurrentArchiveOriginalIds(index,now=Date.now(),read=readText){
 if(!Number.isFinite(now)||!Array.isArray(index?.months)||
    index.months.length>600)fail("ARCHIVE_INDEX_MONTHS_INVALID");
 const start=new Date(now-RETENTION).toISOString().slice(0,7);
 const end=new Date(now).toISOString().slice(0,7);
 const months=index.months.filter(m=>/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(m)&&
   m>=start&&m<=end);
 if(!months.length)fail("ARCHIVE_CURRENT_SHARDS_NOT_INDEXED");
 const ids=new Set();
 for(const month of months){
  for(const category of DOMAIN){
   const doc=JSON.parse(await read(BASE+"/archive/"+month+"/"+category+".json",
     20*1024*1024));
   if(doc?.schema!=="geomacro.permanent-derived-news-archive-month.v1"||
      doc.month!==month||doc.category!==category||
      !Array.isArray(doc.signals)||doc.signals.length>100_000)
     fail("ARCHIVE_MONTH_SHARD_INVALID");
   for(const row of doc.signals){
    if(row?.category!==category||!safeId(row?.id)||
       typeof row.published_at!=="string"||
       !row.published_at.startsWith(month)||ids.has(row.id))
      fail("ARCHIVE_MONTH_SHARD_ID_INVALID");
    ids.add(row.id);
   }
  }
 }
 return ids;
}

async function run(){
 const paths=["/index.json","/latest.json","/coverage-72h.json","/daily-highlights.json"];
 let docs;
 for(let i=0;i<3;i++){
  docs=await Promise.all(paths.map(path=>readText(BASE+path).then(JSON.parse)));
  if(docs[1].checked_at===docs[2].checked_at&&docs[1].checked_at===docs[3].generated_at&&
    docs[0].updated_at===docs[1].checked_at)break;
  if(i<2)await new Promise(resolve=>setTimeout(resolve,1200));
 }
 // Public D1 is a quota-governed read; never amplify a 429/503 into
 // three expensive identical D1 requests. PRs report external unavailability
 // as NOT VERIFIED; trusted main production health remains fail-closed.
 let journal;
 try{journal=JSON.parse(await readText(JOURNAL,4_000_000,1));}
 catch{
  if(process.env.GITHUB_EVENT_NAME!=="pull_request")
   throw Error("THREE_DOMAIN_LIVE_PUBLIC_D1_READBACK_UNAVAILABLE");
  console.warn("::warning::THREE_DOMAIN_LIVE_PUBLIC_D1_UNAVAILABLE_PR_DIAGNOSTIC");
  console.log(JSON.stringify({schema:"geomacro.three-domain-outside-in-parity.v1",
   verified:false,source_to_public_complete:false,
   reason:"PUBLIC_D1_READBACK_UNAVAILABLE",static_snapshot_at:docs[1].checked_at,
   static_latest_rows:docs[1].signals?.length??null,
   canonical_private_d1_write_receipt_verified:false,
   raw_source_bytes_logged:false,predge_modified:false,payments:0}));
  return;
 }
 const [geo,macro,minerals]=await Promise.all([
  readText(SITE+"/intelligence?category=geopolitics"),
  readText(SITE+"/intelligence?category=macro"),
  readText(SITE+"/intelligence?category=rare_earth")
 ]);
 // The exact existing website display gate and static archive contract,
 // not a weaker parallel heuristic, classifies journal-only observations.
 const {intelligenceDisplayRejection}=await import("../../src/lib/intelligence-concrete-publication.ts");
 const {isPermanentArchiveSignal,isTemplateObservation}=await import("./publish-permanent-derived-news-archive.mjs");
 const archiveOriginalIds=await readCurrentArchiveOriginalIds(docs[0]);
 const proof=verifyThreeDomainLivePublication({
  index:docs[0],latest:docs[1],coverage:docs[2],daily:docs[3],journal,
  archiveOriginalIds,
  classifyDisplay:intelligenceDisplayRejection,isArchiveEligible:isPermanentArchiveSignal,
  isTemplateObservation,
  htmlByCategory:{geopolitics:geo,macro,rare_earth:minerals},
  requirePositive:process.env.GEOMACRO_REQUIRE_THREE_CATEGORY_POSITIVE!=="0",
  strictBacklog:process.env.GEOMACRO_ENFORCE_CANONICAL_BACKLOG!=="0"
 });
 if(!proof.source_to_public_complete)
  console.warn("::warning::THREE_DOMAIN_LIVE_BACKLOG_DIAGNOSTIC_ONLY");
 console.log(JSON.stringify(proof));
}
if(process.argv[1]&&import.meta.url==="file://"+process.argv[1])
 run().catch(e=>{console.error(String(e.message||e));process.exitCode=1});
