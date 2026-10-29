#!/usr/bin/env bun
/**
 * Offline, no-funds acceptance for Website eligible IDs -> canonical D1 ->
 * existing PREDGE attributed projection. Does not call partner endpoints,
 * consume quota, change PREDGE code, or expose private records.
 * Input: JSON file with {archive,canonical,research,publicFeed,now}.
 * These must be captured by existing authorized protected-live evidence;
 * synthetic fixtures never count as production proof.
 */
import {readFileSync} from 'node:fs';
import {buildDerivedNewsStructural} from '../../src/lib/derived-news-structural-bridge.ts';
import {verifyWebsiteNewsCatchupReadback} from '../lib/website-news-canonical-reconciliation.mjs';
import {predgeJournalParity} from './predge-research-journal-parity.mjs';

export function verifyEligiblePartnerParity({archive,canonical,research,publicFeed,now,admissible}){
 if(!Number.isFinite(now)||!Array.isArray(archive)||!Array.isArray(canonical)||
    !research||!publicFeed||typeof admissible!=='function')
   throw Error('WEBSITE_PREDGE_PARITY_INPUT_INVALID');
 const readback=verifyWebsiteNewsCatchupReadback(archive,canonical,now,admissible);
 if(research.projection!=='attributed_research'||
    research.authentication!=='DEDICATED_BEARER_ONLY'||
    research.attribution_must_be_preserved!==true||
    research.retention_hours!==72||
    research.raw_upstream_delivered!==false)
   throw Error('WEBSITE_PREDGE_PARITY_AUTH_OR_RIGHTS_INVALID');
 if(!predgeJournalParity(research,publicFeed,canonical))
   throw Error('WEBSITE_PREDGE_PARITY_PROJECTION_MISMATCH');
 const expected=buildDerivedNewsStructural(canonical,Date.parse(research.generated_at),'attributed_research');
 const categories=['geopolitics','macro','rare_earth'];
 if(!categories.every(c=>research.counts?.[c]===expected.filter(i=>i.category===c).length))
   throw Error('WEBSITE_PREDGE_PARITY_CATEGORY_MISMATCH');
 return Object.freeze({
  schema:'geomacro.website-predge-eligible-parity.v1',
  canonical_eligible_ids_verified:readback.matched_eligible_ids,
  missing_eligible_ids:readback.missing_eligible_ids,
  canonical_counts:readback.counts_by_category,
  attributed_projection_exact_match:true,
  attributed_projection_counts:Object.fromEntries(categories.map(c=>[c,research.counts[c]])),
  original_source_clocks_verified:true,
  protected_live_authenticated_readback_verified:false,
  production_acceptance:'REQUIRES_PROTECTED_LIVE_RECEIPT',
  payments:0
 });
}
if(process.argv[1]?.endsWith('verify-website-predge-eligible-parity.mjs')){
 try{
  if(!process.argv[2])throw Error('WEBSITE_PREDGE_PARITY_FIXTURE_REQUIRED');
  const input=JSON.parse(readFileSync(process.argv[2],'utf8'));
  // Caller must provide a strictly vetted eligible-ID list. Do not treat
  // this offline tool as a substitute for production archive eligibility.
  const eligibleIds=new Set(input.eligible_ids);
  if(!Array.isArray(input.eligible_ids)||eligibleIds.size!==input.eligible_ids.length)
   throw Error('WEBSITE_PREDGE_PARITY_ELIGIBILITY_INVALID');
  const result=verifyEligiblePartnerParity({...input,admissible:s=>eligibleIds.has(s.id)});
  console.log(JSON.stringify(result));
 }catch(e){
  console.error('::error::'+String(e.message||'WEBSITE_PREDGE_PARITY_UNVERIFIED'));
  process.exitCode=1;
 }
}
