// Country-level readback accounting. Neither a live article title nor a
// recent research probe proves commercial independent same-event review.
import {inspectObservedCountryGrid} from "../ops/verify-production-observed-195x3.mjs";
const CAT=["geopolitics","macro","rare_earth"],ISO=/^[A-Z]{3}$/u;
const fail=code=>{throw Error("COUNTRY_195_PUBLICATION_RECONCILIATION_"+code);};
export function reconcileCountry195Publication({rolling,website,now=new Date()}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))fail("CLOCK_INVALID");
 // Require the SAME fixed 585-cell canonical keys, no hidden aggregate
 // spreadsheet/metadata substitution.
 if(rolling?.schema!=="geomacro.country-195-live-original-proof-rollup.v1"||
    rolling.total_expected_cells!==585||!Array.isArray(rolling.cells)||
    rolling.cells.length!==585||rolling.b2_requests!==0||
    rolling.supabase_requests!==0||rolling.payments!==0)
   fail("COUNTRY_PROOF_ROLLUP_MISSING");
 const checked=Date.parse(rolling.as_of??"");
 if(!Number.isFinite(checked)||checked>now.getTime()+60_000||
    now.getTime()-checked>20*60_000)fail("COUNTRY_PROOF_ROLLUP_STALE");
 const publicReceipt=inspectObservedCountryGrid(website,now);
 if(publicReceipt.live_response_valid!==true)fail("WEBSITE_COUNTRY_API_UNVERIFIED");
 const source=new Map();
 for(const cell of rolling.cells){
  const key=cell?.iso3+":"+cell?.category;
  if(!ISO.test(cell?.iso3??"")||!CAT.includes(cell.category)||
     source.has(key)||typeof cell.current_original_proof_verified!=="boolean"||
     !["UNPROBED","PROOF_OLDER_THAN_24H","SOURCE_TRANSPORT_UNVERIFIED",
       "COUNTRY_RELEVANCE_UNVERIFIED","ORIGINAL_PAGE_UNVERIFIED",
       "CURRENT_ORIGINAL_PROOF_VERIFIED"].includes(cell.status)||
     cell.current_original_proof_verified!==
       (cell.status==="CURRENT_ORIGINAL_PROOF_VERIFIED"))
     fail("SOURCE_PROOF_CELL_INVALID");
  source.set(key,cell);
 }
 const totals=Object.fromEntries(CAT.map(c=>[c,{
  country_cells:195,source_probe_verified_last_24h:0,
  derived_journal_country_cells_last_72h:0,
  matched_source_probe_and_derived_journal_cells:0,
  source_proof_without_country_journal_mention:0,
  journal_mention_without_24h_probe_proof:0,
  unprobed_or_stale_source_probe_cells:0,
  neither_current_original_probe_nor_journal_mention:0
 }]));
 const websiteKeys=new Set();
 let observed=0,matched=0,unprobed=0;
 for(const cell of website.cells){
  const key=cell.country_iso3+":"+cell.category,proof=source.get(key);
  if(!proof||websiteKeys.has(key))fail("WEBSITE_COUNTRY_CELL_MISMATCH");
  websiteKeys.add(key);
  const published=cell.observed_derived_records_72h>0;
  const verified=proof.current_original_proof_verified;
  const c=totals[cell.category];
  if(published){c.derived_journal_country_cells_last_72h++;observed++;}
  if(verified)c.source_probe_verified_last_24h++;
  if(verified&&published){
   c.matched_source_probe_and_derived_journal_cells++;matched++;
  }else if(verified)c.source_proof_without_country_journal_mention++;
  else if(published)c.journal_mention_without_24h_probe_proof++;
  else c.neither_current_original_probe_nor_journal_mention++;
  if(proof.status==="UNPROBED"||proof.status==="PROOF_OLDER_THAN_24H"){
   c.unprobed_or_stale_source_probe_cells++;unprobed++;
  }
 }
 if(source.size!==585||websiteKeys.size!==585||
   Object.values(totals).some(c=>
     c.matched_source_probe_and_derived_journal_cells+
       c.source_proof_without_country_journal_mention+
       c.journal_mention_without_24h_probe_proof+
       c.neither_current_original_probe_nor_journal_mention!==195))
    fail("INCOMPLETE_COUNTRY_DOMAIN_CENSUS");
 return Object.freeze({
  schema:"geomacro.country-195x3-source-to-website-reconciliation.v1",
  checked_at:now.toISOString(),
  canonical_country_count:195,category_count:3,examined_cells:585,
  verified_source_probe_cells_last_24h:Object.values(totals)
   .reduce((n,c)=>n+c.source_probe_verified_last_24h,0),
  website_country_mentioned_cells_last_72h:observed,
  source_and_journal_overlap_cells:matched,
  unprobed_or_stale_source_cells:unprobed,
  domain_totals:totals,
  journal_record_total_72h:publicReceipt.actual_72h_derived_news_journal_records,
  source_probe_evidence_and_website_journal_have_different_time_windows:true,
  a_journal_mention_is_not_a_country_verified_original:true,
  a_source_probe_is_not_a_website_publication_guarantee:true,
  unobserved_does_not_mean_no_world_event:true,
  latest_website_original_at:publicReceipt.latest_original_published_at,
  country_195x3_current_signed_commercial_coverage_verified:false,
  actual_original_fact_rights_certificates_verified:false,
  no_new_source_requests:true,no_new_country_polling:true,
  b2_requests:0,d1_writes:0,supabase_reads:0,
  payments:0,paid_delivery_authorized:false
 });
}
