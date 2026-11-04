import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildDirect20mSourceHealthProof} from '../lib/direct20m-source-health-proof.mjs';
const at=Date.parse('2026-11-04T08:00:00Z');
const url='https://example.gov/news.atom';
const registry=[{id:'official_example',url,categories:['macro','rare_earth']}];
const source_ref=category=>createHash('sha256').update(['official_example',url,category].join('\n')).digest('hex');
test('one real transport check per category and only verified D1 acknowledgement counted',()=>{
 const row={sourceUrl:url,category:'macro',publishedAt:'2026-11-04T07:40:00Z',articleUrl:'https://example.gov/article/secret',title:'SECRET HEADLINE',d1Acknowledged:true};
 const p=buildDirect20mSourceHealthProof({registry,checks:[{source_ref:source_ref('macro'),state:'OBSERVED'},{source_ref:source_ref('rare_earth'),state:'DENIED'}],observedCandidates:[row],retainedCandidates:[row],d1ReadbackVerified:true,now:at});
 assert.equal(p.source_endpoints_configured,1);
 assert.equal(p.category_checks_with_runtime_state,2);
 assert.equal(p.sources[0].d1_originals_acknowledged_in_retained_queue,1);
 assert.equal(p.sources[1].transport_parser_state,'DENIED');
 assert.equal(p.sources[1].d1_originals_acknowledged_in_retained_queue,0);
 assert.ok(!JSON.stringify(p).includes('SECRET'));
 assert.ok(!JSON.stringify(p).includes(url));
});
test('without independent D1 readback no row may claim ACK',()=>{
 const row={sourceUrl:url,category:'macro',publishedAt:'2026-11-04T07:00:00Z',d1Acknowledged:true};
 const p=buildDirect20mSourceHealthProof({registry,checks:[],observedCandidates:[row],retainedCandidates:[row],d1ReadbackVerified:false,now:at});
 assert.equal(p.sources[0].d1_originals_acknowledged_in_retained_queue,null);
 assert.equal(p.sources[0].transport_parser_state,'NOT_CHECKED');
 assert.equal(p.b2_original_archive_readback_verified,false);
});
test('future, stale and extra content cannot become native dates',()=>{
 const p=buildDirect20mSourceHealthProof({registry,checks:[],observedCandidates:[{sourceUrl:url,category:'macro',publishedAt:'2026-11-04T09:00:00Z'},{sourceUrl:url,category:'macro',publishedAt:'2026-10-25T08:00:00Z'}],retainedCandidates:[],now:at});
 assert.equal(p.sources[0].candidates_observed_this_sweep,0);
 assert.equal(p.sources[0].original_last_published_at_in_72h_queue,null);
});

test('quota-held and default private collection both use the identical fail-closed source-ID proof',()=>{
 const xs=Array.from({length:506},(_,i)=>({id:'private_'+i,url:'https://news'+i+'.example.gov/feed',categories:['macro','rare_earth']}));
 const checks=xs.flatMap(x=>x.categories.map(category=>({source_ref:createHash('sha256').update([x.id,x.url,category].join('\n')).digest('hex'),state:'OBSERVED'})));
 const proof=buildDirect20mSourceHealthProof({registry:xs,checks,observedCandidates:null,retainedCandidates:null,now:at});
 assert.equal(proof.source_endpoints_configured,506);
 assert.equal(proof.category_checks_with_runtime_state,1012);
 assert.ok(proof.sources.every(z=>z.d1_originals_acknowledged_in_retained_queue===null));
 assert.equal(proof.b2_original_archive_readback_verified,false);
});
test('quota-held source proof reports true parser states but never invents native counts or D1 ACKs',()=>{
 const proof=buildDirect20mSourceHealthProof({registry,checks:[{source_ref:source_ref('macro'),state:'DENIED'}],observedCandidates:null,retainedCandidates:null,now:at});
 assert.equal(proof.sources[0].transport_parser_state,'DENIED');
 assert.equal(proof.sources[0].candidates_observed_this_sweep,null);
 assert.equal(proof.sources[0].candidates_in_retained_72h_queue,null);
 assert.equal(proof.sources[0].d1_originals_acknowledged_in_retained_queue,null);
 assert.equal(proof.current_sweep_native_candidate_attribution_measured,false);
});
