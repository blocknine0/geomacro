Warning: truncated output (original token count: 7123)
Total output lines: 411

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PRODUCTION_FREE_UPDATE_SOURCES,PRODUCTION_FREE_SOURCE_D1_PIPELINE,collectProductionFreeSourceUpdates,summarizeFreeSourceUpdates,probeProductionFreeUpdateSource,FEDERAL_RESERVE_MONETARY_OFFICIAL_FALLBACK_URL,assessWdiReferenceContinuity} from '../lib/free-source-production-updates.mjs';
const at=new Date('2026-10-16T07:10:00.000Z');
const rss=(id='one',date='Fri, 16 Oct 2026 07:00:00 GMT')=>'<rss><channel><item><guid>'+id+'</guid><title>Private source publication</title><pubDate>'+date+'</pubDate></item></channel></rss>';
const byUrl=new Map(PRODUCTION_FREE_UPDATE_SOURCES.map(s=>[s.url,s]));
function validBody(s,version='one'){
 if(s.id==='gdelt_events')return ['export.CSV','mentions.CSV','gkg.csv'].map((kind,i)=>
   (80000+i*2000)+' '+(version==='one'?'a':'b').repeat(32)+
   ' http://data.gdeltproject.org/gdeltv2/20261016070000.'+kind+'.zip').join('\n');
 if(s.id.startsWith('govuk_global_'))return JSON.stringify({total:1,results:[{title:'Zambia copper minerals economy '+version,link:'/government/news/zambia-copper-policy'}]});
 if(s.rdf)return '<rdf:RDF xmlns:dc="http://purl.org/dc/elements/1.1/"><item><link>https://www.bis.org/press/p261016.htm</link><title>Zambia banking monetary policy '+version+'</title><dc:date>2026-10-16T07:00:00Z</dc:date></item></rdf:RDF>';
 if(s.format==='rss')return rss(version);
 if(s.format==='atom')return '<feed><entry><id>'+version+'</id><title>Private text</title><published>2026-10-16T07:00:00Z</published></entry></feed>';
 if(s.id==='usgs_earthquakes')return JSON.stringify({type:'FeatureCollection',features:[{id:version,properties:{time:1,updated:2}}]});
 if(s.id==='cisa_kev')return JSON.stringify({catalogVersion:'2026',vulnerabilities:[{cveID:version,dateAdded:'2026-10-16'}]});
 if(s.id==='bls')return JSON.stringify({status:'REQUEST_SUCCEEDED',Results:{series:[{data:[{year:'2026',period:'M09',value:version}]}]}});
 if(s.id==='world_bank_wdi')return JSON.stringify([
   {page:1,pages:60,total:60,sourceid:'2'},
   [{indicator:{id:'NY.GDP.MKTP.CD'},country:{id:'US'},
     countryiso3code:'USA',date:'2025',value:version==='one'?100:101}]
 ]);
 if(s.id==='treasury_fiscaldata')return JSON.stringify({data:[{record_date:'2026-09-30',value:version}]});
 if(['federal_register','us_bis_export_controls'].includes(s.id))return JSON.stringify({count:1,results:[{document_number:version,publication_date:'2026-10-16'}]});
 if(s.id==='uk_fcdo_advisories')return JSON.stringify({total:1,results:[{link:'/foreign-travel-advice/example',public_timestamp:'2026-10-16T07:00:00Z',title:version}]});
 if(s.id==='ny_fed')return JSON.stringify({refRates:[{effectiveDate:'2026-10-15',percentRate:version}]});
 if(s.id==='wikimedia_pageviews')return JSON.stringify({items:[{timestamp:'2026101500',views:version}]});
 if(s.id==='un_security_council_sanctions')return '<CONSOLIDATED_LIST><INDIVIDUAL><DATAID>'+version+'</DATAID></INDIVIDUAL></CONSOLIDATED_LIST>';
 if(s.id==='ecb_fx')return '<gesmes:Envelope><Cube currency="USD" rate="1.1"/></gesmes:Envelope>';
 return '<!doctype html><html>Private baseline context</html>';
}
function memoryState(){
 const rows=new Map();let loads=0;
 return {rows,get loads(){return loads;},async loadRows(){loads++;return new Map(structuredClone([...rows]));},
   async persist(k,p){rows.set(k,{payload:structuredClone(p)});}};
}
function network(version='one',deny=null){return async(url,options)=>{
 const s=byUrl.get(url);assert.ok(s);assert.equal(options.redirect,s.id==='un_security_council_sanctions'?'manual':'error');
 return s.id===deny?new Response('private upstream denial',{status:403}):new Response(validBody(s,version));
};}
test('all configured production sources are unique and baseline clocks remain distinct from intraday publication',()=>{
 assert.equal(PRODUCTION_FREE_UPDATE_SOURCES.length,47);
 assert.equal(new Set(PRODUCTION_FREE_UPDATE_SOURCES.map(s=>s.id)).size,47);
 assert.ok(PRODUCTION_FREE_UPDATE_SOURCES.some(s=>s.category==='rare_earth'&&s.id==='us_doe'));
 for(const s of PRODUCTION_FREE_UPDATE_SOURCES){assert.equal(new URL(s.url).protocol,'https:');assert.ok([30,1440].includes(s.poll_minutes));}
});
test('first actual collection establishes a baseline, persists only hashes and verifies all D1 readback',async()=>{
 const state=memoryState();const r=await collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:network(),now:at});
 assert.equal(r.attempted,47);assert.equal(r.unavailable,0);assert.equal(r.d1_exact_metadata_readback_verified,true);
 assert.ok(Object.values(r.per_category).every(x=>x.newly_detected_update_fingerprints===0));
 assert.equal(state.rows.size,3);assert.equal(state.loads,2);
 const stored=JSON.stringify([...state.rows]);
 assert.ok(!stored.includes('Private source publication'));assert.ok(!stored.includes('https://'));
 assert.equal(r.payments+r.supabase_requests+r.b2_requests,0);
});
test('the same slot performs no upstream request and the next slot reads only fast sources',async()=>{
 const state=memoryState();await collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:network(),now:at});
 let calls=0;
 const r=await collectProductionFreeSourceUpdates({stateClient:state,now:new Date(at.getTime()+60000),fetchImpl:async()=>{calls++;throw Error('must not fetch');}});
 assert.equal(calls,0);assert.equal(r.attempted,0);
 const next=await collectProductionFreeSourceUpdates({stateClient:state,now:new Date(at.getTime()+1800000),fetchImpl:network('two')});
 assert.equal(next.attempted,PRODUCTION_FREE_UPDATE_SOURCES.filter(s=>!s.baseline).length);
 assert.ok(Object.values(next.per_category).some(c=>c.newly_detected_update_fingerprints>0));
 const same=await collectProductionFreeSourceUpdates({stateClient:state,now:new Date(at.getTime()+3600000),fetchImpl:network('two')});
 assert.ok(Object.values(same.per_category).every(c=>c.newly_detected_update_fingerprints===0));
});
test('WDI 200 malformed s…4123 tokens truncated…network()(url,opts);
 };
 await collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:traffic,now:at});
 assert.equal(maradCalls,1);
 assert.equal(ieaCalls,1);
 const sixHours=await collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:traffic,
   now:new Date(at.getTime()+360*60000)});
 assert.equal(maradCalls,1);
 assert.equal(ieaCalls,1);
 assert.ok(sixHours.retained_degraded_readers>=2);
 await collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:traffic,
   now:new Date(at.getTime()+1440*60000)});
 assert.equal(maradCalls,2);
 assert.equal(ieaCalls,2);
});


test('non-destructive v2 D1 checkpoint leaves the known bad legacy namespace untouched',async()=>{
 assert.equal(PRODUCTION_FREE_SOURCE_D1_PIPELINE,'free_source_production_updates_v2');
 const {readFileSync}=await import('node:fs');
 const runner=readFileSync(new URL('../ops/probe-commercial-free-source-lineup.mjs',import.meta.url),'utf8');
 assert.match(runner,/pipeline:PRODUCTION_FREE_SOURCE_D1_PIPELINE/);
 assert.doesNotMatch(runner,/pipeline:\s*['"]free_source_production_updates['"]/);
 // An existing untrusted/legacy schema is never silently treated as a
 // current original or migrated into v2. The initial v2 observation is a
 // REFERENCE BASELINE, not newly published news or rights authorization.
 const state=memoryState();
 const r=await collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:network(),now:at});
 assert.equal(r.first_observation_is_new_update,false);
 assert.equal(r.d1_exact_metadata_readback_verified,true);
 assert.equal(r.current_verified_intelligence,false);
 assert.equal(r.commercial_eligible,false);
 assert.equal(r.payments,0);
 assert.equal(state.rows.size,3);
 const d1=readFileSync(new URL('../lib/d1-control-plane-state.mjs',import.meta.url),'utf8');
 assert.match(d1,/WHERE pipeline = \?/);
 assert.match(d1,/ON CONFLICT\(pipeline,scope\)/);
 assert.doesNotMatch(runner,/(?:DELETE\s+FROM\s+pipeline_checkpoint|DROP\s+TABLE|UPDATE\s+pipeline_checkpoint)/i);
});


test('real Fed press-all HTTP 404 recovers only from its fixed same-publisher monetary RSS, not a second issuer',async()=>{
 const spec=PRODUCTION_FREE_UPDATE_SOURCES.find(s=>s.id==='federal_reserve');
 assert.equal(spec.reader_revision,2);
 const calls=[];
 const result=await probeProductionFreeUpdateSource(spec,async(url,options)=>{
  calls.push(url);
  assert.equal(options.redirect,'error');
  assert.equal(options.method,'GET');
  if(url===spec.url)return new Response('unavailable',{status:404});
  assert.equal(url,FEDERAL_RESERVE_MONETARY_OFFICIAL_FALLBACK_URL);
  return new Response(rss('monetary-native', 'Fri, 16 Oct 2026 07:00:00 GMT'),
   {status:200,headers:{'Content-Type':'application/rss+xml'}});
 },at);
 assert.deepEqual(calls,[spec.url,FEDERAL_RESERVE_MONETARY_OFFICIAL_FALLBACK_URL]);
 assert.equal(result.result.state,'TRANSPORT_READABLE');
 assert.equal(result.official_fallback_used,true);
 assert.equal(result.observed.kind,'PUBLISHER_FEED_CHANGE');
 assert.equal(result.observed.native_publications_within_30m,1);
 assert.equal(result.observed.independently_verified_event,false);
 assert.equal(result.observed.topic_relevance_classified,false);
});
test('Federal Reserve denial, rate limit, bad content and normal 200 never trigger unauthorized fallback',async()=>{
 const spec=PRODUCTION_FREE_UPDATE_SOURCES.find(s=>s.id==='federal_reserve');
 for(const status of [401,403,429,200]){
  const calls=[];
  const x=await probeProductionFreeUpdateSource(spec,async(url)=>{
   calls.push(url);assert.equal(url,spec.url);
   return status===200?new Response('not a feed',{status}):
     new Response('denied',{status});
  },at);
  assert.deepEqual(calls,[spec.url]);
  assert.equal(x.official_fallback_used,false);
  assert.notEqual(x.result.state,'TRANSPORT_READABLE');
 }
});
test('Federal Reserve alternate still fails closed on 403 and cannot manufacture macro events',async()=>{
 const spec=PRODUCTION_FREE_UPDATE_SOURCES.find(s=>s.id==='federal_reserve');
 const calls=[];
 const x=await probeProductionFreeUpdateSource(spec,async(url)=>{
  calls.push(url);
  return new Response('not available',{status:url===spec.url?404:403});
 },at);
 assert.deepEqual(calls,[spec.url,FEDERAL_RESERVE_MONETARY_OFFICIAL_FALLBACK_URL]);
 assert.equal(x.official_fallback_used,false);
 assert.equal(x.observed,null);
 assert.equal(x.result.state,'HTTP_UNAVAILABLE');
});
test('official macro Fed reader revision recovers the existing 404 on next scheduled run without bypassing other sources',async()=>{
 const state=memoryState();
 await collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:network(),now:at});
 const p=state.rows.get('macro').payload;
 p.snapshot.sources.federal_reserve.reader_revision=1;
 p.snapshot.sources.federal_reserve.state='HTTP_UNAVAILABLE';
 p.snapshot.sources.federal_reserve.http_status=404;
 p.snapshot.sources.federal_reserve.last_success_at=null;
 p.snapshot_sha256=createHash('sha256').update(JSON.stringify(p.snapshot)).digest('hex');
 const spec=PRODUCTION_FREE_UPDATE_SOURCES.find(x=>x.id==='federal_reserve');
 const calls=[];
 const now=new Date(at.getTime()+60_000);
 const outcome=await collectProductionFreeSourceUpdates({
  stateClient:state,now,fetchImpl:async(url,opts)=>{
    calls.push(url);
    if(url===spec.url)return new Response('no original',{status:404});
    assert.equal(url,FEDERAL_RESERVE_MONETARY_OFFICIAL_FALLBACK_URL);
    return new Response(rss('fed-verified-pubdate','Fri, 16 Oct 2026 07:00:00 GMT'));
  },
 });
 assert.deepEqual(calls,[spec.url,FEDERAL_RESERVE_MONETARY_OFFICIAL_FALLBACK_URL]);
 assert.equal(outcome.attempted,1);
 assert.equal(outcome.per_category.macro.readable>0,true);
 assert.equal(outcome.per_category.macro.newly_detected_update_fingerprints,0);
 assert.equal(outcome.current_verified_intelligence,false);
 assert.equal(outcome.commercial_eligible,false);
 assert.equal(state.rows.get('macro').payload.snapshot.sources.federal_reserve.reader_revision,2);
});
