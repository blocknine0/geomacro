/**
 * Static Finds archive readback without D1, B2, R2, partner auth or payments.
 * Published immutable rows and the entire 72h coverage fingerprint must match.
 * Clock-only differences are expected on a no-op scheduled deployment;
 * fail closed on stale/future clocks, mismatched IDs or changed rights flags.
 */
const CLOCK_MAX_AGE_MS=6*60*60_000;
const FUTURE_TOLERANCE_MS=60_000;
const fail=code=>{throw Error("PERMANENT_ARCHIVE_STATIC_READBACK_"+code)};
const withoutClock=doc=>{
 const {checked_at,...data}=doc;
 return JSON.stringify(data);
};
function clock(doc,now){
 const t=Date.parse(doc?.checked_at??"");
 if(!Number.isFinite(t)||t>now+FUTURE_TOLERANCE_MS||now-t>CLOCK_MAX_AGE_MS)
  fail("STALE_OR_FUTURE_CLOCK");
 return t;
}
export function verifyPublicStaticArchiveReadback({
 expectedIndex,expectedLatest,expectedCoverage,
 liveIndex,liveLatest,liveCoverage,now=Date.now()
}){
 if(!Number.isFinite(now))fail("INVALID_CLOCK");
 if(!expectedIndex||!expectedLatest||!expectedCoverage||
    !liveIndex||!liveLatest||!liveCoverage)fail("MISSING_DOCUMENT");
 if(JSON.stringify(liveIndex)!==JSON.stringify(expectedIndex))
  fail("INDEX_PAYLOAD_MISMATCH");
 if(liveLatest.ok!==true||liveLatest.schema!=="geomacro.website-derived-news-feed.v1"||
    liveLatest.delivery_scope!=="free_website_only"||
    liveLatest.chargeable!==false||liveLatest.scored!==false||
    liveLatest.supabase_dependency!==false||liveLatest.retention_hours!==72)
  fail("LATEST_CONTRACT_INVALID");
 if(liveCoverage.schema!=="geomacro.free-derived-archive-eligibility.v1"||
    liveCoverage.retention_hours!==72||liveCoverage.free_website_only!==true||
    liveCoverage.unverified_promoted!==false||
    liveCoverage.signed_or_scored!==false||
    liveCoverage.paid_customer_eligible!==false||
    liveCoverage.live_payment_authorized!==false||
    liveCoverage.d1_reads!==0||
    !/^[a-f0-9]{64}$/.test(liveCoverage.eligible_ids_sha256??""))
  fail("COVERAGE_CONTRACT_INVALID");
 clock(expectedLatest,now);clock(expectedCoverage,now);
 const latestAt=clock(liveLatest,now),coverageAt=clock(liveCoverage,now);
 if(Math.abs(latestAt-coverageAt)>30_000)
  fail("STATIC_SNAPSHOT_CLOCK_SPLIT");
 // Compare ALL fields, including native IDs, clocks, credits and full 72h
 // eligible coverage hash. Only the build's observation clock may differ.
 if(withoutClock(liveLatest)!==withoutClock(expectedLatest))
  fail("LATEST_EXACT_PAYLOAD_MISMATCH");
 if(withoutClock(liveCoverage)!==withoutClock(expectedCoverage))
  fail("COVERAGE_EXACT_PAYLOAD_MISMATCH");
 if(!Number.isSafeInteger(liveIndex.total_signals)||liveIndex.total_signals<0||
    !Array.isArray(liveLatest.signals)||liveLatest.signals.length>250)
  fail("BOUNDED_ARCHIVE_INVALID");
 return Object.freeze({
  schema:"geomacro.permanent-public-finds-static-readback.v1",
  public_index_readback_verified:true,
  public_latest_readback_verified:true,
  public_72h_coverage_exact_readback_verified:true,
  full_72h_eligible_ids_hash_verified:true,
  deliberate_noop_clock_difference_accepted:latestAt!==
    Date.parse(expectedLatest.checked_at),
  archive_signals:liveIndex.total_signals,
  latest_signals:liveLatest.signals.length,
  full_72h_original_eligible:liveCoverage.original_release_eligible_total,
  all_current_free_displayable:liveCoverage.free_displayable_findings_total,
  outside_250_preview:liveCoverage.free_displayable_outside_latest_preview,
  max_verified_snapshot_age_seconds:Math.ceil((now-Math.min(latestAt,coverageAt))/1000),
  d1_reads:0,d1_writes:0,b2_requests:0,predge_gets:0,payments:0,
 });
}
