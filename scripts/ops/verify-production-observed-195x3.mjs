// Independent actual-publication readback from Geomacro's EXISTING live
// 72-hour Cloudflare D1 derived journal via the website API. No new data
// source, cron, paid service, B2, Supabase, x402, raw article or D1 writes.
// Routing every country != verified current source material in every country.
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const ENDPOINT="https://geomacro.live/api/v1/intelligence/query?view=country-coverage-195x3";
const DOMAINS=["geopolitics","macro","rare_earth"];
const MAX_BYTES=900_000;
const RETENTION_MS=72*60*60_000;
const ISO=/^[A-Z]{3}$/u;
const STRUCTURAL_STATES=new Set([
 "DERIVED_OFFICIAL_COUNTRY_MENTION_OBSERVED_UNVERIFIED",
 "NO_MATCHING_COUNTRY_MENTION_IN_BOUNDED_JOURNAL"
]);

export function inspectObservedCountryGrid(doc,now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    !doc||typeof doc!=="object"||Array.isArray(doc)||
    doc.schema!=="geomacro.195x3-observed-derived-news-coverage.v1"||
    doc.country_count!==195||doc.category_count!==3||
    doc.total_country_category_cells!==585||doc.returned_cells!==585||
    doc.coverage_scope!=="OBSERVED_DERIVED_RELEASES_IN_EXISTING_72H_D1_JOURNAL_ONLY"||
    doc.country_routing_basis!=="EXACT_DERIVED_TITLE_GEOGRAPHY_MENTION_ONLY"||
    doc.not_observed_means_no_news!==false||
    doc.exhaustive_country_news_coverage_verified!==false||
    doc.producer_country_original_coverage_verified!==false||
    (doc.original_release_delay_minutes!==0&&doc.original_release_delay_minutes!==15)||doc.retention_hours!==72||
    doc.payment_required_now!==false||doc.chargeable!==false||
    doc.scored!==false||doc.signed!==false||doc.raw_upstream_delivered!==false||
    !Number.isSafeInteger(doc.source_neutral_derived_records_in_journal)||
    doc.source_neutral_derived_records_in_journal<0||
    doc.source_neutral_derived_records_in_journal>600||
    !Number.isSafeInteger(doc.unassigned_or_regional_derived_records_72h)||
    doc.unassigned_or_regional_derived_records_72h<0||
    doc.unassigned_or_regional_derived_records_72h>600||
    !doc.observed_derived_records_by_category||
    typeof doc.observed_derived_records_by_category!=="object"||
    !Array.isArray(doc.cells)||doc.cells.length!==585)
    throw Error("LIVE_195X3_COVERAGE_CONTRACT_INVALID");
 const generated=Date.parse(doc.generated_at??"");
 if(!Number.isFinite(generated)||generated>now.getTime()+120_000||
    now.getTime()-generated>20*60_000)
   throw Error("LIVE_195X3_RESPONSE_CLOCK_STALE");
 const totals=Object.fromEntries(DOMAINS.map(d=>[d,0]));
 const occupied=new Set(),countries=new Set();
 let totalObserved=0,classified=0,unclassified=0,latest=-Infinity,empty=0;
 for(const domain of DOMAINS){
   const v=doc.observed_derived_records_by_category[domain];
   if(!Number.isSafeInteger(v)||v<0||v>600)
     throw Error("LIVE_195X3_DOMAIN_TOTAL_INVALID");
 }
 for(const row of doc.cells){
   if(!row||typeof row!=="object"||!ISO.test(row.country_iso3??"")||
      !DOMAINS.includes(row.category)||!STRUCTURAL_STATES.has(row.status)||
      typeof row.country_name!=="string"||row.country_name.length<2||
      !Number.isSafeInteger(row.observed_derived_records_72h)||
      row.observed_derived_records_72h<0||row.observed_derived_records_72h>600||
      !Number.isSafeInteger(row.classified_topic_releases_72h)||
      !Number.isSafeInteger(row.unclassified_candidates_72h)||
      row.classified_topic_releases_72h<0||row.unclassified_candidates_72h<0||
      row.classified_topic_releases_72h+row.unclassified_candidates_72h!==
        row.observed_derived_records_72h||
      row.country_subject_verified!==false||
      row.local_original_publisher_verified!==false||
      row.independent_same_event_verified!==false||
      row.commercial_rights_verified!==false||
      row.all_news_exhaustive!==false||
      row.paid_delivery_eligible!==false)
       throw Error("LIVE_195X3_CELL_SCOPE_INVALID");
   const key=row.country_iso3+":"+row.category;
   if(occupied.has(key))throw Error("LIVE_195X3_DUPLICATE_CELL");
   occupied.add(key);countries.add(row.country_iso3);
   const positive=row.observed_derived_records_72h>0;
   if(row.status!==(positive?"DERIVED_OFFICIAL_COUNTRY_MENTION_OBSERVED_UNVERIFIED":
       "NO_MATCHING_COUNTRY_MENTION_IN_BOUNDED_JOURNAL"))
     throw Error("LIVE_195X3_FALSE_COUNTRY_COVERAGE_STATUS");
   if(!positive) {
     empty++;
     if(row.latest_original_published_at!==null)
       throw Error("LIVE_195X3_FAKE_ORIGINAL_CLOCK");
   }else{
     const at=Date.parse(row.latest_original_published_at??"");
     if(!Number.isFinite(at)||at>now.getTime()||
        now.getTime()-at>RETENTION_MS)
       throw Error("LIVE_195X3_ORIGINAL_CLOCK_INVALID");
     latest=Math.max(latest,at);
   }
   totals[row.category]+=row.observed_derived_records_72h;
   classified+=row.classified_topic_releases_72h;
   unclassified+=row.unclassified_candidates_72h;
   totalObserved+=row.observed_derived_records_72h;
 }
 if(countries.size!==195||occupied.size!==585||
   DOMAINS.some(d=>totals[d]>doc.observed_derived_records_by_category[d])||
   Object.values(doc.observed_derived_records_by_category).reduce((a,b)=>a+b,0)!==
     doc.source_neutral_derived_records_in_journal ||
   doc.unassigned_or_regional_derived_records_72h!==
     doc.source_neutral_derived_records_in_journal-totalObserved)
   throw Error("LIVE_195X3_COUNTRY_MATRIX_INCOMPLETE");
 return {
   schema:"geomacro.production-observed-195x3-coverage-readback.v1",
   checked_at:now.toISOString(),source_generated_at:doc.generated_at,
   live_response_valid:true,country_routes:195,category_routes:3,
   returned_cells:585,observed_country_category_cells:585-empty,
   cells_without_matching_derivation:empty,
   actual_72h_derived_news_journal_records:doc.source_neutral_derived_records_in_journal,
   assigned_country_news_mentions_72h:totalObserved,
   unassigned_or_regional_news_72h:doc.unassigned_or_regional_derived_records_72h,
   latest_original_published_at:Number.isFinite(latest)?new Date(latest).toISOString():null,
   classified_country_mentions_72h:classified,
   unclassified_country_mentions_72h:unclassified,
   observed_country_mentions_by_category:totals,
   observed_journal_records_by_category:doc.observed_derived_records_by_category,
   original_source_presence_585_cells_verified:false,
   same_event_verification:false,signed_hot_products_verified:false,
   category_release_time_guarantee:false,
   source_licensing_for_paid_output_verified:false,
   no_observation_does_not_mean_no_news:true,
   raw_articles_logged:false,d1_writes:0,b2_requests:0,
   supabase_requests:0,payments:0
 };
}
async function boundedJson(response){
 if(!response.ok||!response.body)throw Error("LIVE_195X3_WEBSITE_HTTP_UNAVAILABLE");
 if(Number(response.headers.get("content-length")??0)>MAX_BYTES)
   throw Error("LIVE_195X3_RESPONSE_OVERSIZE");
 const reader=response.body.getReader(),blocks=[];let total=0;
 try{for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   total+=value.byteLength;
   if(total>MAX_BYTES)throw Error("LIVE_195X3_RESPONSE_OVERSIZE");
   blocks.push(value);
 }}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(total);let i=0;
 for(const p of blocks){bytes.set(p,i);i+=p.byteLength;}
 try{return JSON.parse(new TextDecoder("utf8",{fatal:true}).decode(bytes));}
 catch{throw Error("LIVE_195X3_RESPONSE_NOT_JSON");}
}
export async function verifyProductionObserved195x3({fetchImpl=fetch,now=new Date()}={}){
 const response=await fetchImpl(ENDPOINT,{method:"GET",redirect:"error",
   cache:"no-store",headers:{Accept:"application/json"},
   signal:AbortSignal.timeout(20_000)});
 return inspectObservedCountryGrid(await boundedJson(response),now);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    process.env.GITHUB_REF!=="refs/heads/main"||
    !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
   throw Error("LIVE_195X3_PROTECTED_MAIN_REQUIRED");
 const receipt=await verifyProductionObserved195x3();
 mkdirSync("artifacts/derived-news",{recursive:true,mode:0o700});
 writeFileSync("artifacts/derived-news/actual-195x3-coverage.json",
   JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify({
   schema:receipt.schema,live_response_valid:receipt.live_response_valid,
   country_routes:receipt.country_routes,returned_cells:receipt.returned_cells,
   observed_country_category_cells:receipt.observed_country_category_cells,
   actual_72h_derived_news_journal_records:receipt.actual_72h_derived_news_journal_records,
   latest_original_published_at:receipt.latest_original_published_at,
   category_mentions:receipt.observed_country_mentions_by_category,
   exhaustive_live_global_news_verified:false,
   signed_hot_verified:false,payments:0
 }));
}
