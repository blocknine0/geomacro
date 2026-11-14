import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildDirect20mSourceHealthProof} from '../lib/direct20m-source-health-proof.mjs';
import {verifyThreeCategoryPrivateOsintReceipt} from '../ops/assert-private-osint-three-category-live-receipt.mjs';
const now=Date.parse('2026-11-14T10:00:00.000Z');
const categories=['geopolitics','macro','rare_earth'];
const registry=categories.map(category=>({
 id:'private_demo_'+category,
 url:'https://'+category.replace('_','-')+'.example.gov/feed.atom',
 categories:[category],commercial_eligible:false,
}));
const check=(source,state)=>({
 source_ref:createHash('sha256').update([source.id,source.url,source.categories[0]].join('\n')).digest('hex'),
 state,
});
const item=(source,ack=true)=>({
 sourceUrl:source.url,category:source.categories[0],
 publishedAt:'2026-11-14T09:52:00.000Z',
 articleUrl:'https://'+source.id+'.example.gov/secret/article',
 title:'PRIVATE ORIGINAL HEADLINE',
 d1Acknowledged:ack,
});
test('all 3 genuinely checked private categories deliver a source-only live proof',()=>{
 const checks=registry.map(s=>check(s,'OBSERVED'));
 const observed=registry.map(s=>item(s));
 const proof=buildDirect20mSourceHealthProof({
  registry,checks,observedCandidates:observed,retainedCandidates:observed,
  d1ReadbackVerified:true,b2ReadbackVerified:false,now,
 });
 const accepted=verifyThreeCategoryPrivateOsintReceipt(proof);
 assert.equal(accepted.checks_verified,3);
 assert.equal(accepted.healthy_checks,3);
 assert.equal(accepted.all_three_categories_have_live_feed_transport,true);
 assert.equal(accepted.all_registered_sources_live,true);
 assert.equal(accepted.by_category.rare_earth.native_candidates,1);
 assert.equal(accepted.by_category.rare_earth.d1_acked_in_retained_queue,1);
 assert.equal(accepted.rights_verified,false);
 assert.equal(accepted.paid_eligible,false);
 assert.equal(accepted.payments,0);
 assert.equal(proof.b2_original_archive_readback_verified,false);
 assert.equal(proof.live_category_health.telegram_unapproved_candidates_counted_as_live_sources,false);
 assert.equal(proof.live_category_health.root_only_references_counted_as_live_sources,false);
 assert.ok(!JSON.stringify(proof).includes('PRIVATE ORIGINAL HEADLINE'));
 assert.ok(!JSON.stringify(proof).includes('/secret/article'));
 assert.ok(!JSON.stringify(proof).includes('example.gov'));
});
test('a denied mineral source remains degraded, while other source categories stay live',()=>{
 const checks=registry.map((s,i)=>check(s,i===2?'DENIED':'OBSERVED'));
 const proof=buildDirect20mSourceHealthProof({registry,checks,
  observedCandidates:[item(registry[0])],retainedCandidates:[],now,
  d1ReadbackVerified:false,
 });
 const accepted=verifyThreeCategoryPrivateOsintReceipt(proof);
 assert.equal(accepted.all_three_categories_have_live_feed_transport,false);
 assert.equal(accepted.all_registered_sources_live,false);
 assert.equal(accepted.by_category.rare_earth.healthy,0);
 assert.equal(accepted.by_category.rare_earth.status,'NO_HEALTHY_FEED');
 assert.equal(accepted.by_category.macro.native_candidates,0);
 assert.equal(accepted.by_category.macro.d1_acked_in_retained_queue,null);
 assert.equal(accepted.by_category.geopolitics.status,'HEALTHY_FEED_WITH_NATIVE_CANDIDATES');
});
test('an HTTP 200 RSS feed with no recent item counts as healthy transport, NOT news',()=>{
 const proof=buildDirect20mSourceHealthProof({registry,
  checks:registry.map(s=>check(s,'EMPTY_OR_OUTSIDE_WINDOW')),
  observedCandidates:[],retainedCandidates:[],now,
 });
 const accepted=verifyThreeCategoryPrivateOsintReceipt(proof);
 assert.equal(accepted.all_registered_sources_live,true);
 assert.equal(accepted.by_category.rare_earth.native_candidates,0);
 assert.equal(accepted.by_category.rare_earth.status,'HEALTHY_FEED_NO_NEW_NATIVE_CANDIDATES');
});
test('missing one real source check never passes without its actual provider state',()=>{
 const proof=buildDirect20mSourceHealthProof({registry,
  checks:registry.slice(0,2).map(s=>check(s,'OBSERVED')),
  observedCandidates:[],retainedCandidates:[],now,
 });
 assert.equal(proof.live_category_health.all_configured_source_category_checks_observed,false);
 assert.throws(()=>verifyThreeCategoryPrivateOsintReceipt(proof),
  /PRIVATE_OSINT_THREE_CATEGORY_UNOBSERVED_SOURCE_CATEGORY_CHECKS/);
});
test('forged positive all-source receipt, raw URL leakage and unauthorized policy fail closed',()=>{
 const source=buildDirect20mSourceHealthProof({registry,
  checks:registry.map((s,i)=>check(s,i===1?'DENIED':'OBSERVED')),
  observedCandidates:[],retainedCandidates:[],now,
 });
 const falseAll=structuredClone(source);
 falseAll.live_category_health.all_registered_sources_live=true;
 assert.throws(()=>verifyThreeCategoryPrivateOsintReceipt(falseAll),/FALSE_ALL_LIVE_STATUS/);
 const badPolicy=structuredClone(source);
 badPolicy.live_category_health.paid_eligible=true;
 assert.throws(()=>verifyThreeCategoryPrivateOsintReceipt(badPolicy),/POLICY_BOUNDARY_MISMATCH/);
 const raw=structuredClone(source);
 raw.sources[0].url=registry[0].url;
 assert.throws(()=>verifyThreeCategoryPrivateOsintReceipt(raw),/SOURCE_UNVERIFIED/);
 const noSummary=structuredClone(source);
 delete noSummary.live_category_health;
 assert.throws(()=>verifyThreeCategoryPrivateOsintReceipt(noSummary),/LIVE_SUMMARY_MISSING/);
});
test('the same collector proof is accepted without D1 when quota-HELD encrypted intake is honest',()=>{
 const proof=buildDirect20mSourceHealthProof({registry,
  checks:registry.map(s=>check(s,'OBSERVED')),
  observedCandidates:null,retainedCandidates:null,now,
 });
 const accepted=verifyThreeCategoryPrivateOsintReceipt(proof);
 assert.equal(accepted.by_category.macro.native_candidates,null);
 assert.equal(accepted.by_category.macro.status,'HEALTHY_TRANSPORT_NATIVE_NEWS_UNMEASURED');
 assert.equal(accepted.d1_readback_verified,false);
});
