import {createHash} from "node:crypto";
import {selectGovernedRootWindow,MAX_ROOTS_PER_WINDOW}
  from "../ops/probe-source-discovery-roots.mjs";

/**
 * #2170 read-only all-root acceptance, from earlier PRIVATE GitHub Actions
 * receipts. ZERO new publisher GETs, no source/provider identities in output.
 *
 * A root URL being HTTP-reachable is a connectivity observation, never an
 * original RSS/article feed, active ingestion, legal right or chargeable GRO.
 */
const SCHEMA="geomacro.discovery-root-rotating-http-health.v1";
const MAX_WINDOW_AGE_MS=48*60*60*1000;
const MAX_FUTURE_MS=5*60*1000;
const DOMAINS=["GEOPOLITICS","MACRO","CRITICAL_MINERALS"];
const REACH="ROOT_HTTP_REACHABLE";
const STATUSES=new Set([REACH,"ROOT_REDIRECT_UNVERIFIED",
  "ROOT_ACCESS_DENIED","ROOT_RATE_LIMITED","ROOT_REMOVED",
  "ROOT_HTTP_UNAVAILABLE","ROOT_TRANSPORT_UNAVAILABLE",
  "ROOT_INVALID_OR_UNSAFE_URL"]);
const fail=()=>{throw Error("ROOT_ROTATION_CENSUS_RECEIPT_INVALID");};
const sha=s=>createHash("sha256").update(s).digest("hex");
const safeNonnegative=n=>Number.isSafeInteger(n)&&n>=0;

export function auditGovernedRootRotation({
  catalog,receipts=[],now=new Date(),
}={}){
  if(!Array.isArray(catalog?.roots)||catalog.roots.length<1||
     catalog.roots.length>1500||!Array.isArray(receipts)||
     receipts.length>90||!(now instanceof Date)||
     !Number.isFinite(now.getTime()))fail();
  // Reuse EXACT production 90m slot policy and official registry.
  const baseline=selectGovernedRootWindow(catalog,now);
  const K=baseline.windowCount;
  const buckets=new Map();
  for(const receipt of receipts){
    const observed=Date.parse(receipt?.observed_at??"");
    if(receipt?.schema!==SCHEMA||
       !Number.isFinite(observed)||
       observed>now.getTime()+MAX_FUTURE_MS||
       now.getTime()-observed>MAX_WINDOW_AGE_MS||
       receipt.source_catalog_count!==catalog.roots.length||
       receipt.window_count!==K||
       !safeNonnegative(receipt.window_index)||
       receipt.window_index>=K||
       !Array.isArray(receipt.rows)||
       receipt.rows.length>MAX_ROOTS_PER_WINDOW||
       receipt.checked_roots!==receipt.rows.length||
       receipt.http_root_observation_only!==true||
       receipt.original_articles_ingested!==0||
       receipt.registered_roots_auto_activated_as_news_feeds!==0||
       receipt.all_sources_working_claim!==false||
       receipt.commercial_eligible!==false||
       receipt.b2_requests!==0||receipt.d1_writes!==0||
       receipt.supabase_writes!==0||receipt.payment_performed!==false)
      fail();
    const expected=selectGovernedRootWindow(catalog,new Date(observed));
    if(expected.index!==receipt.window_index||
       expected.roots.length!==receipt.rows.length)fail();
    const actual=new Map();
    for(const row of receipt.rows){
      if(!row||!DOMAINS.includes(row.category)||
         typeof row.source_ref!=="string"||
         !/^[a-f0-9]{24}$/.test(row.source_ref)||
         !STATUSES.has(row.status)||actual.has(row.source_ref)||
         row.discovery_only!==true||
         row.original_feed_activated!==false ||
         (row.http_status!==null&&
          (!Number.isSafeInteger(row.http_status)||
           row.http_status<100||row.http_status>599))||
         (row.status===REACH &&
           !(row.http_status>=200&&row.http_status<300)))
        fail();
      actual.set(row.source_ref,row);
    }
    const expectedRefs=expected.roots.map(x=>({
      key:sha(x.category+":"+x.source_id).slice(0,24),
      category:x.category,
    }));
    for(const x of expectedRefs){
      if(actual.get(x.key)?.category!==x.category)fail();
    }
    if(receipt.http_reachable!==receipt.rows.filter(x=>x.status===REACH).length ||
       !receipt.per_domain || typeof receipt.per_domain!=="object")fail();
    for(const d of DOMAINS){
      const rows=receipt.rows.filter(x=>x.category===d);
      if(receipt.per_domain[d]?.checked!==rows.length||
         receipt.per_domain[d]?.http_reachable!==
           rows.filter(x=>x.status===REACH).length)fail();
    }
    // Keep latest validated observation of each slot; re-runs are not
    // double-counted and a replay cannot invent a 15th/16th slot.
    const old=buckets.get(expected.index);
    if(!old||old.observed_at<observed)
      buckets.set(expected.index,{observed_at:observed,rows:receipt.rows});
  }
  const all=[...buckets.entries()].sort((a,b)=>a[0]-b[0])
    .flatMap(([,v])=>v.rows);
  const seen=new Set(all.map(x=>x.source_ref));
  if(seen.size!==all.length)fail();
  const totals=Object.fromEntries(DOMAINS.map(category=>{
    const rows=all.filter(x=>x.category===category);
    return [category,{
      checked_roots:rows.length,
      http_reachable_roots:rows.filter(x=>x.status===REACH).length,
      blocked_or_degraded_roots:rows.filter(x=>x.status!==REACH).length,
      actual_original_feeds_activated_by_census:0,
      commercial_source_rights_verified_by_census:false,
    }];
  }));
  const checked=all.length;
  const complete=buckets.size===K && checked===catalog.roots.length;
  return Object.freeze({
    schema:"geomacro.private-governed-root-rotation-census.v1",
    observed_at:now.toISOString(),
    status:complete?"FULL_HTTP_ROOT_CENSUS_OBSERVED":
      "PARTIAL_HTTP_ROOT_CENSUS_PENDING_WINDOWS",
    total_registered_roots:catalog.roots.length,
    window_count:K,observed_windows:buckets.size,
    missing_window_count:K-buckets.size,
    root_checks_verified:checked,
    root_checks_missing:catalog.roots.length-checked,
    http_reachable_roots:all.filter(x=>x.status===REACH).length,
    per_domain:totals,
    receipt_integrity_verified:true,
    full_rotation_observed:complete,
    source_feed_activated_by_census:false,
    all_registered_sources_working:false,
    all_195_countries_current_verified:false,
    original_articles_ingested:0,
    gro_signed:0,payment_authorized:false,
    b2_requests:0,d1_writes:0,supabase_writes:0,
    no_new_publisher_requests:true,
    private_source_status_set_sha256:sha(all
      .map(x=>x.category+":"+x.source_ref+":"+x.status+":"+String(x.http_status))
      .sort().join("\n")),
  });
}
