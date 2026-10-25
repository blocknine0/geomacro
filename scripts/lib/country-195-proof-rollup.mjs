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
   const pageAt=typeof c?.original_page_publication_utc==="string"
     ?Date.parse(c.original_page_publication_utc):null;
   const counts=[
    ["original_publisher_families_reached",12],
    ["original_country_relevant_candidates",16],
    ["original_pages_verified",4],
    ["independent_verified_publisher_families",4],
    ["restricted_publisher_attempts",12],
    ["rate_limited_publisher_attempts",12],
   ];
   const validCounts=counts.every(([name,max])=>
    Number.isSafeInteger(c?.[name])&&c[name]>=0&&c[name]<=max);
   if(i<from||i>=from+count||!CAT.includes(c?.category)||
      unique.has(key)||c.ROUTING_VERIFIED!==true||
      ![true,false,null].includes(c.SOURCE_ADAPTER_REGISTERED)||
      ![true,false,null].includes(c.LIVE_SOURCE_REACHABLE)||
      ![true,false,null].includes(c.COUNTRY_RELEVANCE_VERIFIED)||
      ![true,false,null].includes(c.ORIGINAL_EVIDENCE_VERIFIED)||
      ![true,false,null].includes(c.INDEPENDENT_FALLBACK_VERIFIED)||
      ![true,false,null].includes(c.SIGNED_DELIVERY_VERIFIED)||
      ![true,false,null].includes(c.NO_QUALIFYING_EVIDENCE_FOUND)||
      c.SIGNED_DELIVERY_VERIFIED===true||
      c.RIGHTS_QUALIFIED===true||
      !validCounts||
      !["PARTIAL_SOURCE_COVERAGE","NO_QUALIFYING_CURRENT_EVIDENCE","SOURCE_BLOCKED","UNTESTED"].includes(c.verdict)||
      !(c.BLOCKED===null||typeof c.BLOCKED==="string"&&/^[A-Z0-9_]{3,100}$/u.test(c.BLOCKED))||
      c.ORIGINAL_PAGE_VERIFIED!==c.ORIGINAL_EVIDENCE_VERIFIED||
      (c.original_pages_verified>0)!==(c.ORIGINAL_EVIDENCE_VERIFIED===true)||
      c.COUNTRY_RELEVANCE_VERIFIED===true&&c.original_country_relevant_candidates<1||
      c.COUNTRY_RELEVANCE_VERIFIED===false&&c.original_country_relevant_candidates!==0||
      c.ORIGINAL_EVIDENCE_VERIFIED===true&&
       (c.LIVE_SOURCE_REACHABLE!==true||c.COUNTRY_RELEVANCE_VERIFIED!==true||
        c.SOURCE_ADAPTER_REGISTERED!==true||pageAt===null||!Number.isFinite(pageAt)||
        pageAt>finished||finished-pageAt>86400_000||c.original_pages_verified<1)||
      c.ORIGINAL_EVIDENCE_VERIFIED!==true&&c.original_page_publication_utc!==null||
      c.INDEPENDENT_FALLBACK_VERIFIED===true&&
       (c.ORIGINAL_EVIDENCE_VERIFIED!==true||c.independent_verified_publisher_families<2||
        c.original_pages_verified<2))
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
   registered_source_adapter_cells:c.filter(v=>v.cell.SOURCE_ADAPTER_REGISTERED===true).length,
   live_transport_observed:c.filter(v=>v.cell.LIVE_SOURCE_REACHABLE===true).length,
   country_relevant_original_cells:c.filter(v=>v.cell.COUNTRY_RELEVANCE_VERIFIED===true).length,
   country_relevant_original_candidates:c.reduce((n,v)=>n+v.cell.original_country_relevant_candidates,0),
   first_party_original_page_verified:c.filter(v=>v.cell.ORIGINAL_EVIDENCE_VERIFIED===true).length,
   first_party_original_pages_verified:c.reduce((n,v)=>n+v.cell.original_pages_verified,0),
   original_page_stale_now:c.filter(v=>{
    const at=Date.parse(v.cell.original_page_publication_utc??"");
    return v.cell.ORIGINAL_EVIDENCE_VERIFIED===true&&Number.isFinite(at)&&
      now.getTime()-at>86400_000;
   }).length,
   restricted_publisher_attempts:c.reduce((n,v)=>n+v.cell.restricted_publisher_attempts,0),
   rate_limited_publisher_attempts:c.reduce((n,v)=>n+v.cell.rate_limited_publisher_attempts,0),
   independent_fallback_verified:c.filter(v=>v.cell.INDEPENDENT_FALLBACK_VERIFIED===true).length,
   freshly_probed_within_24h:c.filter(v=>now.getTime()-v.at<86400_000).length,
   unprobed_country_cells:195-c.length,
  }];
 }));
 const countriesProbed=new Set([...checked.keys()].map(k=>k.split(":")[0])).size;
 const cells=knownCodes.flatMap(iso3=>CAT.map(category=>{
  const observed=checked.get(iso3+":"+category);
  const recent=!!observed&&now.getTime()-observed.at<86400_000;
  const cell=observed?.cell;
  const original=cell?.ORIGINAL_EVIDENCE_VERIFIED===true&&
   cell?.COUNTRY_RELEVANCE_VERIFIED===true&&
   cell?.LIVE_SOURCE_REACHABLE===true;
  const pageAt=typeof cell?.original_page_publication_utc==="string"
    ?Date.parse(cell.original_page_publication_utc):NaN;
  const pageCurrent=original&&Number.isFinite(pageAt)&&pageAt<=now.getTime()&&
    now.getTime()-pageAt<=86400_000;
  const current=recent&&original&&pageCurrent;
  const status=!observed?"UNPROBED":!recent?"PROOF_OLDER_THAN_24H":
   cell.LIVE_SOURCE_REACHABLE!==true?"SOURCE_TRANSPORT_UNVERIFIED":
   cell.COUNTRY_RELEVANCE_VERIFIED!==true?"COUNTRY_RELEVANCE_UNVERIFIED":
   !original?"ORIGINAL_PAGE_UNVERIFIED":
   !pageCurrent?"ORIGINAL_PAGE_STALE":"CURRENT_ORIGINAL_PROOF_VERIFIED";
  return {
   iso3,category,status,last_probe_at:observed?new Date(observed.at).toISOString():null,
   source_adapter_registered:cell?.SOURCE_ADAPTER_REGISTERED??null,
   live_source_reachable:cell?.LIVE_SOURCE_REACHABLE??null,
   country_relevance_verified:cell?.COUNTRY_RELEVANCE_VERIFIED??null,
   country_relevant_original_candidates:cell?cell.original_country_relevant_candidates:null,
   original_page_verified:cell?.ORIGINAL_EVIDENCE_VERIFIED??null,
   original_pages_verified:cell?cell.original_pages_verified:null,
   latest_original_publication_at:cell?.original_page_publication_utc??null,
   original_publisher_families_reached:cell?cell.original_publisher_families_reached:null,
   independent_verified_publisher_families:cell?cell.independent_verified_publisher_families:null,
   restricted_publisher_attempts:cell?cell.restricted_publisher_attempts:null,
   rate_limited_publisher_attempts:cell?cell.rate_limited_publisher_attempts:null,
   no_qualifying_evidence_found:cell?.NO_QUALIFYING_EVIDENCE_FOUND??null,
   blocked_reason:cell?.BLOCKED??null,
   verdict:cell?.verdict??null,
   current_original_proof_verified:current,
  };
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
  active_continent_two_hour_sweep_max_hours:2,
  continent_195_route_configuration_is_not_actual_source_proofs:true,
  proof_reports_accepted:acceptedRuns,category_coverage:categories,
  publisher_reachable_does_not_mean_current_news:true,
  unsigned_and_rights_unverified_by_this_audit:true,
  b2_requests:0,supabase_requests:0,payments:0,
 };
}
