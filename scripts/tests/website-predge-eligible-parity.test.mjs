import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyEligiblePartnerParity} from '../ops/verify-website-predge-eligible-parity.mjs';
import {buildDerivedNewsStructural} from '../../src/lib/derived-news-structural-bridge.ts';
import {isPermanentArchiveSignal} from '../ops/publish-permanent-derived-news-archive.mjs';
import {verifyDerivedStory} from '../../workers/control-plane/src/website-derived-intelligence.mjs';

const NOW=Date.parse('2026-10-29T10:00:00.000Z');
const categories=['geopolitics','macro','rare_earth'];
const clocks=['2026-10-29T09:10:00.000Z','2026-10-29T09:20:00.000Z','2026-10-29T09:30:00.000Z'];
const credits=['United Nations','Federal Reserve Board','Natural Resources Canada'];
const row=(category,i,credit=credits[i],published_at=clocks[i])=>({
 id:category+'-'+String(i+1).padStart(8,'0'),category,
 title:'Geomacro finds an official policy development relevant to '+category,
 what_changed:'A dated official policy announcement was released for independent contextual research.',
 why_it_matters:'The original policy announcement may affect risk context but no economic impact has been verified.',
 topic:['foreign policy','monetary policy','critical-minerals policy'][i],
 development_type:'policy update',geography:null,published_at,date_precision:'exact',
 observed_release_count:1,sources_credited:credit?[credit]:[],
 status:'official_release_observed_unscored',same_event_corrob_verified:false,severity:null,
});
function fixture({signals=categories.map((c,i)=>row(c,i)),now=NOW,partnerAt=NOW}={}){
 const researchItems=buildDerivedNewsStructural(signals,partnerAt,'attributed_research');
 const publicItems=buildDerivedNewsStructural(signals,partnerAt);
 const counts=items=>Object.fromEntries(categories.map(c=>[c,items.filter(i=>i.category===c).length]));
 const generated_at=new Date(partnerAt).toISOString();
 return {
  archive:signals,canonical:signals,now,
  research:{ok:true,generated_at,projection:'attributed_research',
   partner_delivery_schema:'geomacro.predge.research-news-delivery.v1',
   authentication:'DEDICATED_BEARER_ONLY',attribution_must_be_preserved:true,
   attribution_is_not_a_grant_of_source_rights:true,
   retention_hours:72,original_release_delay_minutes:0,
   raw_upstream_delivered:false,execution_authorized:false,
   partner_resale_or_commercial_redistribution_authorized:false,chargeable:false,
   items:researchItems,counts:counts(researchItems)},
  publicFeed:{ok:true,generated_at,items:publicItems,counts:counts(publicItems)},
 };
}
test('three category eligible IDs are traced via exact canonical and attributed projection',()=>{
 const f=fixture();
 for(const s of f.archive){
  assert.equal(isPermanentArchiveSignal(s,NOW,{allowHistorical:false}),true);
  assert.equal(verifyDerivedStory(s,NOW),true);
 }
 const result=verifyEligiblePartnerParity(f);
 assert.equal(result.eligible_website_ids,3);
 assert.equal(result.missing_canonical_ids,0);
 assert.deepEqual(result.counts_by_category.attributed_delivery,
   {geopolitics:1,macro:1,rare_earth:1});
 assert.deepEqual(result.counts_by_category.attribution_withheld,
   {geopolitics:0,macro:0,rare_earth:0});
 assert.equal(result.protected_live_authenticated_readback_verified,false);
 assert.equal(result.complete_static_archive_coverage_verified,false);
 assert.equal(result.network_requests,0);
 assert.equal(result.payment_requests,0);
});
test('unknown attribution stays withheld, not silently converted to an eligible delivery',()=>{
 const signals=categories.map((c,i)=>row(c,i));
 signals[2]=row('rare_earth',2,'Unreviewed External Mining Publisher');
 const result=verifyEligiblePartnerParity(fixture({signals}));
 assert.equal(result.counts_by_category.attribution_withheld.rare_earth,1);
 assert.equal(result.counts_by_category.attributed_delivery.rare_earth,0);
});
test('missing, altered native clocks and dropped attribution fail closed',()=>{
 const f=fixture();
 assert.throws(()=>verifyEligiblePartnerParity({...f,canonical:f.canonical.slice(1)}),
   /READBACK_INCOMPLETE/);
 assert.throws(()=>verifyEligiblePartnerParity({...f,
  canonical:[{...f.canonical[0],published_at:'2026-10-29T09:10:01.000Z'},...f.canonical.slice(1)]}),
  /PAYLOAD_OR_NATIVE_CLOCK_DIVERGENT/);
 const g=fixture();g.research.items=g.research.items.map(({sources_credited,...rest})=>rest);
 assert.throws(()=>verifyEligiblePartnerParity(g),/EXACT_CANONICAL_PROJECTION_MISMATCH/);
});
test('false research contract, altered research IDs and category counts fail closed',()=>{
 const f=fixture();f.research.authentication='NOT_AUTHENTICATED';
 assert.throws(()=>verifyEligiblePartnerParity(f),/AUTH_RIGHTS_CONTRACT_INVALID/);
 const g=fixture();g.research.items=g.research.items.slice(1);
 assert.throws(()=>verifyEligiblePartnerParity(g),/EXACT_CANONICAL_PROJECTION_MISMATCH/);
 const h=fixture();h.research.counts.macro=2;
 assert.throws(()=>verifyEligiblePartnerParity(h),/EXACT_CANONICAL_PROJECTION_MISMATCH/);
});
test('clock skew and invented freshness cannot certify stale captured inputs',()=>{
 const f=fixture({partnerAt:NOW-10*60_000});
 assert.throws(()=>verifyEligiblePartnerParity(f),/CAPTURE_CLOCK_UNVERIFIED/);
});
test('an item crossing the exact 72h cutoff during bounded capture is reported distinctly',()=>{
 const at=NOW+20_000;
 const s=row('macro',1,'Federal Reserve Board',
  new Date(NOW-72*60*60_000+10_000).toISOString());
 const result=verifyEligiblePartnerParity(fixture({signals:[s],partnerAt:at}));
 assert.equal(result.counts_by_category.eligible.macro,1);
 assert.equal(result.counts_by_category.expired_or_newer_at_partner_clock.macro,1);
 assert.equal(result.counts_by_category.attributed_delivery.macro,0);
});
test('duplicate archive IDs and duplicate partner IDs cannot pass',()=>{
 const f=fixture();f.archive.push(f.archive[0]);
 assert.throws(()=>verifyEligiblePartnerParity(f),/ARCHIVE_IDS_INVALID/);
 const g=fixture();g.research.items=[g.research.items[0],g.research.items[0]];
 assert.throws(()=>verifyEligiblePartnerParity(g),/EXACT_CANONICAL_PROJECTION_MISMATCH/);
});

test('day-only originals crossing the 36h eligibility gate are clock differences, not rights blocks',()=>{
 const now=Date.parse('2026-10-29T12:00:10.000Z');
 const partnerAt=Date.parse('2026-10-29T11:59:50.000Z');
 const s={...row('macro',1,'Federal Reserve Board'),'published_at':'2026-10-28',
  date_precision:'day'};
 assert.equal(isPermanentArchiveSignal(s,now,{allowHistorical:false}),true);
 const result=verifyEligiblePartnerParity(fixture({signals:[s],now,partnerAt}));
 assert.equal(result.counts_by_category.expired_or_newer_at_partner_clock.macro,1);
 assert.equal(result.counts_by_category.attribution_withheld.macro,0);
});
