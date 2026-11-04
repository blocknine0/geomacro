#!/usr/bin/env bun
/** Noncommercial first-party read-only Macro/Minerals transport verification.
 * Runs only in trusted same-repository PR CI, no D1/B2, raw data or secrets.
 */
import {collectMacroFastlane} from '../lib/macro-fastlane-collector.mjs';
import {collectCriticalMineralsFastlane} from '../lib/critical-minerals-fastlane.mjs';
if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='blocknine0/geomacro'||
   process.env.GITHUB_EVENT_NAME!=='pull_request')throw Error('READONLY_NEWS_PROBE_TRUST_REQUIRED');
const now=Date.now();
const macro=await collectMacroFastlane({now,sourceIds:[
 'bls_cpi','bls_employment','bls_ppi','cftc_news','cme_news','lbma_news'
],prices:false,calendars:false,state:{cursors:{}}});
const minerals=await collectCriticalMineralsFastlane({now,macroNeedsFallback:false});
const safeChecks=checks=>checks.map(({id,state,candidates})=>({source_id:id,state,candidates}));
console.log(JSON.stringify({schema:'geomacro.macro-minerals-origin-probe.v1',
 checked_at:new Date(now).toISOString(),macros:safeChecks(macro.polledChecks),
 minerals:safeChecks(minerals.checks),minerals_regional:minerals.receipt.regional_groups,
 total_macro_original_candidates:macro.candidates.length,
 total_mineral_unverified_signals:minerals.signals.length,
 requests:macro.receipt.upstream_requests+minerals.receipt.upstream_requests,
 d1_writes:0,b2_writes:0,original_article_urls_exposed:false,
 original_article_bodies_exposed:false,
 transport_verified_as_publication:false,rights_verified:false}));
