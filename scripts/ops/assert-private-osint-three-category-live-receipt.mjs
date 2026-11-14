#!/usr/bin/env node
/**
 * Acceptance of the ACTUAL already-polled private OSINT source cohort.
 * Reads only the source-health JSON written by the protected source runner.
 * This proves source-category HTTP/parser checks, NOT universal availability,
 * independent event verification, publisher permission or a commercial GRO.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const categories=['geopolitics','macro','rare_earth'];
const healthy=new Set(['OBSERVED','EMPTY_OR_OUTSIDE_WINDOW']);
const need=(ok,code)=>{if(!ok)throw Error('PRIVATE_OSINT_THREE_CATEGORY_'+code)};
const nonNeg=n=>Number.isSafeInteger(n)&&n>=0;
export function verifyThreeCategoryPrivateOsintReceipt(proof){
 need(proof?.schema==='geomacro.direct20m.sourcewise-health.v1',
  'SCHEMA_INVALID');
 need(Array.isArray(proof.sources)&&proof.sources.length>=3&&proof.sources.length<=1536,
  'SOURCE_ROWS_INVALID');
 need(proof.source_endpoints_configured>=1&&proof.source_endpoints_configured<=512,
  'SOURCE_COUNT_INVALID');
 need(proof.source_category_checks_expected===proof.sources.length,
  'EXPECTED_CHECK_COUNT_MISMATCH');
 need(proof.category_checks_with_runtime_state===proof.sources.filter(row=>
  row.transport_parser_state!=='NOT_CHECKED').length,
  'OBSERVED_CHECK_COUNT_MISMATCH');
 need(proof.original_article_urls_included===false&&
  proof.raw_article_content_included===false,
  'PRIVATE_CONTENT_IN_ARTIFACT');
 const h=proof.live_category_health;
 need(h?.schema==='geomacro.private-osint-three-category-health.v1'&&
  h.configured_source_endpoints===proof.source_endpoints_configured&&
  h.scope==='ALREADY_POLLED_REGISTERED_SOURCE_FEEDS_ONLY',
  'LIVE_SUMMARY_MISSING');
 need(h.all_configured_source_category_checks_observed===true&&
  h.source_category_checks_observed===proof.sources.length&&
  h.source_category_checks_expected===proof.sources.length,
  'UNOBSERVED_SOURCE_CATEGORY_CHECKS');
 need(h.country_195_routes_are_discovery_not_verified_event_coverage===true&&
  h.telegram_unapproved_candidates_counted_as_live_sources===false&&
  h.root_only_references_counted_as_live_sources===false&&
  h.commercial_rights_verified===false&&h.paid_eligible===false&&
  h.signed_risk_gate_authorized===false&&h.payments===0,
  'POLICY_BOUNDARY_MISMATCH');
 need(Object.keys(h.by_category??{}).sort().join(',')===
  [...categories].sort().join(','),'CATEGORY_SET_INVALID');
 let n=0,healthyTotal=0;const summary={};
 for(const category of categories){
  const rows=proof.sources.filter(row=>row.category===category);
  const info=h.by_category[category];
  need(rows.length>0&&info&&
   rows.every(row=>typeof row.source_id==='string'&&
     typeof row.transport_parser_state==='string'&&
     !('url' in row)&&!('article_url' in row)),
   'SOURCE_UNVERIFIED_'+category);
  const count=rows.filter(row=>row.transport_parser_state!=='NOT_CHECKED').length;
  const actualHealthy=rows.filter(row=>healthy.has(row.transport_parser_state)).length;
  need(info.configured_source_category_checks===rows.length&&
   info.actual_source_category_checks===count&&count===rows.length&&
   info.transport_or_parsed_feed_healthy_checks===actualHealthy&&
   info.unavailable_or_denied_checks===rows.length-actualHealthy,
   'CATEGORY_COUNTER_MISMATCH_'+category);
  const counts=Object.fromEntries([...new Set(rows.map(row=>row.transport_parser_state))]
   .sort().map(state=>[state,rows.filter(row=>row.transport_parser_state===state).length]));
  need(JSON.stringify(counts)===JSON.stringify(info.source_state_counts),
   'SOURCE_STATE_MISMATCH_'+category);
  need((info.native_original_candidates_this_sweep===null||
   nonNeg(info.native_original_candidates_this_sweep))&&
   (info.d1_acked_originals_in_72h_queue===null||
    nonNeg(info.d1_acked_originals_in_72h_queue)),
   'NATIVE_OR_ACK_COUNT_INVALID_'+category);
  // Source health can be degraded without failing actual D1 intake, but
  // the specific category must be marked degraded in the live receipt.
  need(info.live_status===(actualHealthy===0?'NO_HEALTHY_FEED':
   info.native_original_candidates_this_sweep===null?
   'HEALTHY_TRANSPORT_NATIVE_NEWS_UNMEASURED':
   info.native_original_candidates_this_sweep>0?
   'HEALTHY_FEED_WITH_NATIVE_CANDIDATES':'HEALTHY_FEED_NO_NEW_NATIVE_CANDIDATES'),
   'FALSE_LIVE_STATUS_'+category);
  n+=rows.length;healthyTotal+=actualHealthy;
  summary[category]={
   configured:rows.length,checked:count,healthy:actualHealthy,
   degraded:rows.length-actualHealthy,status:info.live_status,
   native_candidates:info.native_original_candidates_this_sweep,
   d1_acked_in_retained_queue:info.d1_acked_originals_in_72h_queue,
  };
 }
 need(h.source_category_checks_healthy===healthyTotal&&
  h.all_three_categories_have_live_feed_transport===
   categories.every(category=>summary[category].healthy>0)&&
  h.all_registered_source_transports_healthy===(healthyTotal===n&&
   categories.every(category=>summary[category].healthy>0))&&
  h.all_registered_sources_live===(healthyTotal===n&&
   categories.every(category=>summary[category].healthy>0)&&
   proof.current_sweep_native_candidate_attribution_measured===true&&
   proof.sources.every(row=>Number.isSafeInteger(row.candidates_observed_this_sweep)&&
    row.candidates_observed_this_sweep>0))&&
  h.all_three_categories_observed_native_candidates_this_tick===
   (proof.current_sweep_native_candidate_attribution_measured===true&&
    categories.every(category=>summary[category].native_candidates>0)),
  'FALSE_ALL_LIVE_STATUS');
 return {
  schema:'geomacro.private-osint-live-source-acceptance.v1',
  checked_at:h.checked_at,source_endpoints:proof.source_endpoints_configured,
  checks_verified:n,healthy_checks:healthyTotal,
  all_three_categories_have_live_feed_transport:h.all_three_categories_have_live_feed_transport,
  all_registered_sources_live:h.all_registered_sources_live,
  by_category:summary,
  d1_readback_verified:proof.d1_selected_batch_readback_verified,
  original_source_content_released:false,
  rights_verified:false,paid_eligible:false,payments:0,
 };
}
export function main(argv=process.argv.slice(2)){
 // The protected GitHub job opens its OWN fixed runner artifact with a
 // literal shell redirection. This JS accepts no user-controlled file path.
 // Explicit stdin is the entire trust boundary and is verified below.
 need(argv.length===0,'ARGS_INVALID');
 const proof=JSON.parse(readFileSync(0,'utf8'));
 const report=verifyThreeCategoryPrivateOsintReceipt(proof);
 for(const [category,record] of Object.entries(report.by_category))
  if(record.healthy===0)
   console.log('::warning::PRIVATE_OSINT_CATEGORY_NO_HEALTHY_SOURCE_'+category.toUpperCase());
 if(!report.all_registered_sources_live)
  console.log('::warning::PRIVATE_OSINT_NOT_ALL_SOURCE_ENDPOINTS_HEALTHY; no synthetic activation');
 console.log(JSON.stringify(report));
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main();
