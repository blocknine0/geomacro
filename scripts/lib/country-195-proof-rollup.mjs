// 585-cell provenance rollup. A scheduled probe is not global news coverage,
// and an older observation cannot prove a country has a current live source.
const CAT=["geopolitics","macro","rare_earth"];
const fail=()=>{throw Error("COUNTRY_195_ROLLUP_RECEIPT_UNTRUSTED")};
export function parseCanonical195Codes(source){
 const m=/const COUNTRY_ROWS=`([\s\S]*?)`/u.exec(source);
 if(!m)fail();
 const rows=m[1].trim().split(/\r?\n/u).map(s=>s.split("|")[0]);
 if(rows.length!==195||new Set(rows).size!==195||
    !rows.includes("VAT")||!rows.includes("PSE")||
    rows.some(s=>!/^[A-Z]{3}$/u.test(s)))fail();
 return rows;
}
export function rollupCountry195Proofs(reports,knownCodes,{now=new Date()}={}){
 if(!Array.isArray(reports)||reports.length>195||
    !Array.isArray(knownCodes)||knownCodes.length!==195||
    new Set(knownCodes).size!==195||
    !(now instanceof Date)||!Number.isFinite(now.getTime()))fail();
 const checked=new Map(),seenRun=new Set();
 let acceptedRuns=0;
 for(const report of reports){
  const started=Date.parse(report?.probe_started_at??"");
  const finished=Date.parse(report?.probe_finished_at??"");
  const from=report?.batch_start,count=report?.batch_count;
  if(report?.schema!=="geomacro.195-country-safe-readonly-batch.v2"||
     !Number.isSafeInteger(from)||from<0||
     !Number.isSafeInteger(count)||count<1||count>3||from+count>195||
     report.category_count!==3||report.observed_cells!==count*3||
     report.countries_actually_tested!==count||
     report.requests_per_country_cap!==12||
     report.original_pages_per_country_cap!==4||
     report.total_country_baseline!==195||report.total_category_cells!==585||
     report.source_urls_logged!==false||report.source_titles_logged!==false||
     report.raw_data_persisted!==false||report.supabase_requests!==0||
     report.b2_requests!==0||report.real_money_payments!==0||
     report.commercial_rights_verified!==0||report.signed_delivery_verified!==0||
     !Array.isArray(report.cells)||report.cells.length!==count*3||
     !Number.isFinite(started)||!Number.isFinite(finished)||
     started>finished||finished>now.getTime()+60_000||
     started<Date.parse("2026-10-22T00:00:00Z")||
     finished<now.getTime()-90*86400_000)fail();
  const unique=new Set();
  for(const c of report.cells){
   const i=knownCodes.indexOf(c?.iso3),key=c?.iso3+":"+c?.category;
   if(i<from||i>=from+count||!CAT.includes(c?.category)||
      unique.has(key)||c.ROUTING_VERIFIED!==true||
      ![true,false,null].includes(c.LIVE_SOURCE_REACHABLE)||
      ![true,false,null].includes(c.COUNTRY_RELEVANCE_VERIFIED)||
      ![true,false,null].includes(c.ORIGINAL_EVIDENCE_VERIFIED)||
      ![true,false,null].includes(c.INDEPENDENT_FALLBACK_VERIFIED)||
      ![true,false,null].includes(c.SIGNED_DELIVERY_VERIFIED)||
      c.SIGNED_DELIVERY_VERIFIED===true||
      c.RIGHTS_QUALIFIED===true||
      c.ORIGINAL_PAGE_VERIFIED!==c.ORIGINAL_EVIDENCE_VERIFIED||
      c.ORIGINAL_EVIDENCE_VERIFIED===true&&c.LIVE_SOURCE_REACHABLE!==true||
      c.ORIGINAL_EVIDENCE_VERIFIED===true&&c.COUNTRY_RELEVANCE_VERIFIED!==true||
      c.INDEPENDENT_FALLBACK_VERIFIED===true&&c.ORIGINAL_EVIDENCE_VERIFIED!==true)
      fail();
   unique.add(key);
   const prev=checked.get(key);
   if(!prev||prev.at<finished)checked.set(key,{at:finished,cell:c});
  }
  if(unique.size!==count*3)fail();
  const batchKey=from+":"+finished;
  if(seenRun.has(batchKey))fail();
  seenRun.add(batchKey);acceptedRuns++;
 }
 const categories=Object.fromEntries(CAT.map(cat=>{
  const c=[...checked.values()].filter(v=>v.cell.category===cat);
  return [cat,{
   cells_actually_probed:c.length,
   live_transport_observed:c.filter(v=>v.cell.LIVE_SOURCE_REACHABLE===true).length,
   country_relevant_original_observed:c.filter(v=>v.cell.COUNTRY_RELEVANCE_VERIFIED===true).length,
   first_party_original_page_verified:c.filter(v=>v.cell.ORIGINAL_EVIDENCE_VERIFIED===true).length,
   independent_fallback_verified:c.filter(v=>v.cell.INDEPENDENT_FALLBACK_VERIFIED===true).length,
   freshly_probed_within_24h:c.filter(v=>now.getTime()-v.at<86400_000).length,
   unprobed_country_cells:195-c.length,
  }];
 }));
 const countriesProbed=new Set([...checked.keys()].map(k=>k.split(":")[0])).size;
 const cells=knownCodes.flatMap(iso3=>CAT.map(category=>{
  const observed=checked.get(iso3+":"+category);
  const recent=!!observed&&now.getTime()-observed.at<86400_000;
  const original=observed?.cell.ORIGINAL_EVIDENCE_VERIFIED===true&&
   observed?.cell.COUNTRY_RELEVANCE_VERIFIED===true&&
   observed?.cell.LIVE_SOURCE_REACHABLE===true;
  const status=!observed?"UNPROBED":!recent?"PROOF_OLDER_THAN_24H":
   observed.cell.LIVE_SOURCE_REACHABLE!==true?"SOURCE_TRANSPORT_UNVERIFIED":
   observed.cell.COUNTRY_RELEVANCE_VERIFIED!==true?"COUNTRY_RELEVANCE_UNVERIFIED":
   !original?"ORIGINAL_PAGE_UNVERIFIED":"CURRENT_ORIGINAL_PROOF_VERIFIED";
  return {iso3,category,status,last_probe_at:observed?new Date(observed.at).toISOString():null,
   current_original_proof_verified:recent&&original};
 }));
 const currentVerified=cells.filter(c=>c.current_original_proof_verified).length;
 return {
  schema:"geomacro.country-195-live-original-proof-rollup.v1",
  as_of:now.toISOString(),distinct_probed_countries:countriesProbed,
  cells_probed:checked.size,total_expected_cells:585,unprobed_cells:585-checked.size,
  original_page_verified_rolling_cells:Object.values(categories)
    .reduce((n,v)=>n+v.first_party_original_page_verified,0),
  current_original_verified_cells:currentVerified,
  complete_195x3_current_live_original_coverage_verified:currentVerified===585,
  cells,repair_queue:cells.filter(c=>!c.current_original_proof_verified),
  repair_queue_is_not_automatic_unbounded_source_polling:true,
  proof_window_days:90,nominal_calendar_sweep_days:null,
  active_continent_two_hour_sweep_max_hours:108,
  continent_195_route_configuration_is_not_actual_source_proofs:true,
  proof_reports_accepted:acceptedRuns,category_coverage:categories,
  publisher_reachable_does_not_mean_current_news:true,
  unsigned_and_rights_unverified_by_this_audit:true,
  b2_requests:0,supabase_requests:0,payments:0,
 };
}
