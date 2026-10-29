#!/usr/bin/env node
/**
 * Offline, no-funds acceptance of Website eligible source-native IDs against
 * canonical D1 and the existing attributed PREDGE projection. No live HTTP,
 * payment, quota, publisher polling, secret, or PREDGE code/workflow changes.
 *
 * Input is an authorized evidence capture, not evidence that production is
 * live. A separate non-skipped protected-live-check is mandatory.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildDerivedNewsStructural} from '../../src/lib/derived-news-structural-bridge.ts';
import {isPermanentArchiveSignal} from './publish-permanent-derived-news-archive.mjs';
import {verifyDerivedStory} from '../../workers/control-plane/src/website-derived-intelligence.mjs';
import {verifyWebsiteNewsCatchupReadback} from '../lib/website-news-canonical-reconciliation.mjs';
import {predgeJournalParity} from './predge-research-journal-parity.mjs';

const CATEGORIES=['geopolitics','macro','rare_earth'];
const LOOKBACK=72*60*60_000;
const MAX_CLOCK_SKEW=90_000;
const fail=code=>{throw Error('WEBSITE_PREDGE_PARITY_'+code)};
const count=()=>({geopolitics:0,macro:0,rare_earth:0});
const nativeClock=s=>s.date_precision==='day'
  ?Date.parse(s.published_at+'T00:00:00.000Z'):Date.parse(s.published_at);

/**
 * This function never calls a network endpoint and deliberately never returns
 * record IDs or upstream text. "PASS" is a SNAPSHOT proof only, not a live
 * authentication or source-archive completeness assertion.
 */
export function verifyEligiblePartnerParity({archive,canonical,research,publicFeed,now}){
 if(!Number.isFinite(now)||!Array.isArray(archive)||!Array.isArray(canonical)||
    !research||!publicFeed||archive.length>600||canonical.length>600)
   fail('INPUT_INVALID');
 const at=Date.parse(research.generated_at);
 const pt=Date.parse(publicFeed.generated_at);
 if(!Number.isFinite(at)||!Number.isFinite(pt)||Math.abs(at-now)>MAX_CLOCK_SKEW||
    Math.abs(pt-at)>MAX_CLOCK_SKEW)fail('CAPTURE_CLOCK_UNVERIFIED');
 if(research.ok!==true||publicFeed.ok!==true||
    research.partner_delivery_schema!=='geomacro.predge.research-news-delivery.v1'||
    research.projection!=='attributed_research'||
    research.authentication!=='DEDICATED_BEARER_ONLY'||
    research.attribution_must_be_preserved!==true||
    research.attribution_is_not_a_grant_of_source_rights!==true||
    research.retention_hours!==72||research.original_release_delay_minutes!==0||
    research.raw_upstream_delivered!==false||
    research.execution_authorized!==false||
    research.partner_resale_or_commercial_redistribution_authorized!==false||
    research.chargeable!==false)fail('AUTH_RIGHTS_CONTRACT_INVALID');

 // Do not trust caller-supplied "eligible_ids". Derive eligibility from the
 // same archive and original-publication policy used by production writers.
 const eligible=[];
 const known=new Set();
 for(const s of archive){
  if(!s||typeof s.id!=='string'||known.has(s.id))fail('ARCHIVE_IDS_INVALID');
  known.add(s.id);
  if(isPermanentArchiveSignal(s,now,{allowHistorical:false})&&verifyDerivedStory(s,now))
    eligible.push(s);
 }
 const admissible=s=>known.has(s.id)&&isPermanentArchiveSignal(s,now,{allowHistorical:false})&&
   verifyDerivedStory(s,now);
 const readback=verifyWebsiteNewsCatchupReadback(archive,canonical,now,admissible);
 // Reconstruct both public and attributed projections from the SAME D1
 // snapshot, preserving intentional source-neutral vs attributed differences.
 if(!predgeJournalParity(research,publicFeed,canonical))
   fail('EXACT_CANONICAL_PROJECTION_MISMATCH');
 const projectedIds=new Set();
 for(const item of research.items){
  if(!item||typeof item.id!=='string'||projectedIds.has(item.id))fail('PARTNER_ID_INVALID');
  projectedIds.add(item.id);
 }
 const stats={
  eligible:count(),attributed_delivery:count(),attribution_withheld:count(),
  expired_or_newer_at_partner_clock:count(),
 };
 for(const s of eligible){
  stats.eligible[s.category]++;
  const published=nativeClock(s);
  if(!Number.isFinite(published))fail('SOURCE_NATIVE_CLOCK_INVALID');
  // A record that entered or expired in the <=90s capture gap cannot be
  // represented as a PREDGE loss. Preserve that difference explicitly.
  if(published>at||published<at-LOOKBACK){
   stats.expired_or_newer_at_partner_clock[s.category]++;
   continue;
  }
  const candidate=buildDerivedNewsStructural([s],at,'attributed_research');
  if(candidate.length===0){
   // Unknown or restricted attribution labels remain public-only. No
   // authorization is inferred and no rights are silently promoted.
   if(!Array.isArray(s.sources_credited)||s.sources_credited.length===0)
    fail('UNEXPECTED_PROJECTION_EXCLUSION');
   stats.attribution_withheld[s.category]++;
   if(projectedIds.has(s.id))fail('WITHHELD_ID_DELIVERED');
   continue;
  }
  if(candidate.length!==1||candidate[0].id!==s.id||
     !projectedIds.has(s.id))fail('ELIGIBLE_PARTNER_ID_MISSING');
  stats.attributed_delivery[s.category]++;
 }
 // This is a bounded captured-cohort proof, not proof every permanent
 // archive shard was provided or that protected-live-check was executed.
 return Object.freeze({
  schema:'geomacro.website-predge-eligible-parity.v2',
  verification:'OFFLINE_CAPTURED_COHORT',
  archive_input_rows:archive.length,
  eligible_website_ids:readback.matched_eligible_ids,
  canonical_exact_source_native_readback:true,
  matched_canonical_ids:readback.matched_eligible_ids,
  missing_canonical_ids:readback.missing_eligible_ids,
  counts_by_category:stats,
  attributed_partner_projection_exact_match:true,
  public_source_neutral_projection_exact_match:true,
  deliberate_attribution_differences_preserved:true,
  protected_live_authenticated_readback_verified:false,
  complete_static_archive_coverage_verified:false,
  production_acceptance:'REQUIRES_NON_SKIPPED_PROTECTED_LIVE_AND_ARCHIVE_RECEIPTS',
  payment_requests:0,network_requests:0,
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(!process.argv[2])fail('CAPTURE_FILE_REQUIRED');
  const input=JSON.parse(readFileSync(process.argv[2],'utf8'));
  console.log(JSON.stringify(verifyEligiblePartnerParity(input)));
 }catch(e){
  const message=String(e?.message??'');
  console.error('::error::'+(/^WEBSITE_PREDGE_PARITY_[A-Z0-9_]+$/u.test(message)
    ?message:'WEBSITE_PREDGE_PARITY_CAPTURE_UNVERIFIED'));
  process.exitCode=1;
 }
}
