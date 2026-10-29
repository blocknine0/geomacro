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
 assert.equal(PRODUCTION_FREE_UPDATE_SOURCES.length,36);
 assert.equal(new Set(PRODUCTION_FREE_UPDATE_SOURCES.map(s=>s.id)).size,36);
 assert.ok(PRODUCTION_FREE_UPDATE_SOURCES.some(s=>s.category==='rare_earth'&&s.id==='us_doe'));
 for(const s of PRODUCTION_FREE_UPDATE_SOURCES){assert.equal(new URL(s.url).protocol,'https:');assert.ok([30,1440].includes(s.poll_minutes));}
});
test('first actual collection establishes a baseline, persists only hashes and verifies all D1 readback',async()=>{
 const state=memoryState();const r=await collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:network(),now:at});
 assert.equal(r.attempted,36);assert.equal(r.unavailable,0);assert.equal(r.d1_exact_metadata_readback_verified,true);
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
test('WDI 200 malformed source recovers after 6 hours, not hourly, while preserving D1 last good reference',async()=>{
 const state=memoryState();
 const first=await collectProductionFreeSourceUpdates({stateClient:state,now:at,fetchImpl:network('one')});
 assert.equal(first.wdi_reference.status,'SOURCE_READ_WITHIN_36H');
 assert.equal(first.wdi_reference.annual_reference_is_not_current_news,true);
 assert.equal(first.wdi_reference.last_successful_source_read_within_36h,true);
 const good=structuredClone(state.rows.get('macro').payload.snapshot.sources.world_bank_wdi);
 const badNetwork=async(url,options)=>{
   const spec=byUrl.get(url);
   if(spec.id==='world_bank_wdi')return new Response(JSON.stringify([
      {page:1,pages:1,total:0,sourceid:'2'},[]
   ]),{status:200});
   return network('two')(url,options);
 };
 const badAt=new Date(at.getTime()+24*3600000);
 const bad=await collectProductionFreeSourceUpdates({stateClient:state,now:badAt,fetchImpl:badNetwork});
 assert.equal(bad.wdi_reference.status,'SOURCE_RECOVERY_BACKOFF');
 assert.equal(bad.wdi_reference.last_success_at,good.last_success_at);
 assert.equal(bad.wdi_reference.last_http_status,200);
 assert.ok(bad.retained_degraded_source_readers.some(x=>x.id==='world_bank_wdi'));
 let bankAttempts=0;
 const countNetwork=async(url,options)=>{
   if(byUrl.get(url).id==='world_bank_wdi')bankAttempts++;
   return network('two')(url,options);
 };
 await collectProductionFreeSourceUpdates({stateClient:state,now:new Date(badAt.getTime()+60*60000),fetchImpl:countNetwork});
 assert.equal(bankAttempts,0,'annual malformed response must not retry each hour');
 const healed=await collectProductionFreeSourceUpdates({stateClient:state,now:new Date(badAt.getTime()+360*60000),fetchImpl:countNetwork});
 assert.equal(bankAttempts,1);
 assert.equal(healed.wdi_reference.status,'SOURCE_READ_WITHIN_36H');
 assert.equal(healed.wdi_reference.d1_verified_source_checkpoint_only,true);
 assert.equal(healed.wdi_reference.customer_delivery_not_inferred,true);
});
test('D1-only WDI continuity is explicit about a never-read, old, or degraded source',()=>{
 const now=new Date('2026-10-27T12:00:00.000Z');
 assert.equal(assessWdiReferenceContinuity(null,now).status,'AWAITING_FIRST_POLL');
 const recent='2026-10-27T10:00:00.000Z';
 const old='2026-10-24T09:00:00.000Z';
 const good={state:'TRANSPORT_READABLE',last_attempt_at:recent,last_success_at:recent,http_status:200};
 assert.equal(assessWdiReferenceContinuity(good,now).status,'SOURCE_READ_WITHIN_36H');
 assert.equal(assessWdiReferenceContinuity({...good,last_success_at:old},now).status,'LAST_SOURCE_READ_STALE');
 assert.equal(assessWdiReferenceContinuity({...good,state:'FORMAT_OR_SIZE_UNVERIFIED'},now).status,'SOURCE_RECOVERY_BACKOFF');
 assert.equal(assessWdiReferenceContinuity({...good,last_success_at:null},now).status,'NO_SUCCESSFUL_REFERENCE_READ');
 assert.ok(!JSON.stringify(assessWdiReferenceContinuity(good,now)).includes('https://'));
});
test('feed updated, future and date-only clocks never become precise originating publications',()=>{
 const s=PRODUCTION_FREE_UPDATE_SOURCES.find(s=>s.id==='noaa_nhc');
 for(const body of [rss('future','Fri, 16 Oct 2026 08:00:00 GMT'),rss('day','2026-10-16')]){
   const r=summarizeFreeSourceUpdates(s,body,at);assert.equal(r.native_publications_within_30m,0);assert.equal(r.latest_native_publication_at,null);
 }
 const atom=PRODUCTION_FREE_UPDATE_SOURCES.find(s=>s.format==='atom');
 const r=summarizeFreeSourceUpdates(atom,'<feed><entry><id>x</id><updated>2026-10-16T07:05:00Z</updated></entry></feed>',at);
 assert.equal(r.native_publications_within_30m,0);assert.equal(r.latest_native_publication_at,null);
 assert.equal(summarizeFreeSourceUpdates(s,rss()+rss(),at).native_publications_within_30m,1);
});
test('one denied source preserves old successful fingerprints and other categories keep collecting',async()=>{
 const state=memoryState();await collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:network(),now:at});
 const old=structuredClone(state.rows.get('rare_earth').payload.snapshot.sources.us_doe);
 const r=await collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:network('two','us_doe'),now:new Date(at.getTime()+1800000)});
 assert.equal(r.unavailable,1);const next=state.rows.get('rare_earth').payload.snapshot.sources.us_doe;
 assert.equal(next.last_success_at,old.last_success_at);assert.deepEqual(next.fingerprints,old.fingerprints);
 assert.equal(next.state,'DENIED_OR_RATE_LIMIT');
 assert.ok(r.per_category.geopolitics.readable>0);
});
test('unrecognized private content in prior state and corrupt readback fail closed',async()=>{
 const state=memoryState();await collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:network(),now:at});
 const p=state.rows.get('macro').payload;p.snapshot.sources.bls.raw='private payload';
 p.snapshot_sha256=createHash('sha256').update(JSON.stringify(p.snapshot)).digest('hex');
 await assert.rejects(()=>collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:network(),now:at}),/PREVIOUS_STATE_INVALID/);
 const corrupt=memoryState();const persist=corrupt.persist.bind(corrupt);
 corrupt.persist=async(k,p)=>{await persist(k,p);corrupt.rows.get(k).payload.snapshot.checked_at='2026-01-01T00:00:00Z';};
 await assert.rejects(()=>collectProductionFreeSourceUpdates({stateClient:corrupt,fetchImpl:network(),now:at}),/PREVIOUS_STATE_INVALID|READBACK_MISMATCH/);
});
test('first success after denial stays a baseline and degraded state survives not-due polling',async()=>{
 const state=memoryState();
 const first=await collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:network('one','us_doe'),now:at});
 assert.equal(first.retained_degraded_readers,1);
 const next=await collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:network('two'),now:new Date(at.getTime()+1800000)});
 assert.equal(next.unavailable,0);assert.equal(next.retained_degraded_readers,1);
 const old=structuredClone(state.rows.get('rare_earth').payload.snapshot.sources.us_doe);
 assert.equal(old.last_success_at,null);
 const recovered=await collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:network('two'),now:new Date(at.getTime()+360*60000)});
 assert.equal(recovered.retained_degraded_readers,0);
 // Both other fast minerals feeds already saw "two"; DOE's first success is not a new update.
 assert.equal(recovered.per_category.rare_earth.newly_detected_update_fingerprints,0);
});
test('degraded historical source receipt remains explicit and contains no raw publisher content',async()=>{
 const state=memoryState();
 await collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:network('one','usgs_mcs'),now:at});
 const result=await collectProductionFreeSourceUpdates({stateClient:state,
  fetchImpl:network('two'),now:new Date(at.getTime()+60_000)});
 assert.deepEqual(result.retained_degraded_source_readers.map(x=>x.id),['usgs_mcs']);
 assert.equal(result.retained_degraded_source_readers[0].state,'DENIED_OR_RATE_LIMIT');
 assert.equal(result.current_verified_intelligence,false);
 assert.equal(result.commercial_eligible,false);
 assert.ok(!JSON.stringify(result).includes('https://'));
});
test('unavailable D1 checkpoint stops all upstream reads',async()=>{
 let calls=0;
 await assert.rejects(()=>collectProductionFreeSourceUpdates({stateClient:{async loadRows(){throw Error('state unavailable');}},fetchImpl:async()=>{calls++;},now:at}),/state unavailable/);
 assert.equal(calls,0);
});
test('production schedule isolates refs and exposes only checkpoint credentials and aggregate artifact',async()=>{
 const {readFileSync}=await import('node:fs');
 const workflow=readFileSync(new URL('../../.github/workflows/free-commercial-source-lineup.yml',import.meta.url),'utf8');
 assert.ok(workflow.includes('cron: "17,47 * * * *"'));
 assert.ok(workflow.includes('geomacro-free-commercial-lineup-${{ github.ref }}'));
 assert.ok(workflow.includes('cancel-in-progress: false'));
 assert.ok(workflow.includes('environment: production'));
 assert.ok(workflow.includes('--production-updates'));
 assert.ok(workflow.includes('path: |'));
 assert.ok(workflow.includes('artifacts/free-source-updates/receipt.json'));
 assert.ok(workflow.includes('artifacts/free-source-updates/deployed-main-readback.json'));
 assert.ok(workflow.includes('Check actual published main build for WDI source changes'));
 assert.ok(workflow.includes('github.event_name == \'push\' || github.event_name == \'workflow_dispatch\''));
 const writerSection=workflow.split('  read-only-production-mesh:')[1]?.split('  zoho-subscribed-maritime-candidates:')[0];
 assert.ok(writerSection);
 assert.deepEqual([...writerSection.matchAll(/secrets\.([A-Z0-9_]+)/gu)].map(m=>m[1]).sort(),['CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN']);
 const mailboxSection=workflow.split('  zoho-subscribed-maritime-candidates:')[1];
 assert.ok(mailboxSection);
 assert.ok(mailboxSection.includes('github.event_name != \'pull_request\''));
 assert.ok(mailboxSection.includes('environment: production'));
 assert.ok(mailboxSection.includes('scripts/ops/observe-zoho-maritime-subscriptions.mjs'));
 assert.ok(workflow.includes("github.event_name != 'pull_request'"));
});
test('CISA bounded window selects latest catalogue additions rather than the first historical rows',()=>{
 const s=PRODUCTION_FREE_UPDATE_SOURCES.find(x=>x.id==='cisa_kev');
 const rows=Array.from({length:60},(_,i)=>({cveID:'historical-'+i,dateAdded:'2025-01-01'}));
 rows.push({cveID:'latest',dateAdded:'2026-10-16'});
 const a=summarizeFreeSourceUpdates(s,JSON.stringify({vulnerabilities:rows}),at);
 rows.at(-1).cveID='latest-correction';
 const b=summarizeFreeSourceUpdates(s,JSON.stringify({vulnerabilities:rows}),at);
 assert.equal(a.sampled_records,40);assert.notDeepEqual(a.fingerprints,b.fingerprints);
 assert.equal(b.latest_native_publication_at,null);
});
test('UN follows only one exact official read-only distribution, never arbitrary or expired redirects',async()=>{
 const {probeNoKeySource}=await import('../lib/free-no-key-source-probe.mjs');
 const s=PRODUCTION_FREE_UPDATE_SOURCES.find(x=>x.id==='un_security_council_sanctions');
 const target=new URL('https://unsolprodfiles.blob.core.windows.net/publiclegacyxmlfiles/EN/consolidatedLegacyByPRN.xml');
 for(const [k,v] of Object.entries({sv:'2024-05-04',st:new Date(Date.now()-60000).toISOString(),se:new Date(Date.now()+3600000).toISOString(),sr:'b',sp:'r',sig:'public-test-fixture-signature0000'}))target.searchParams.set(k,v);
 // A syntactically valid public fixture, not a publisher-issued credential.
 target.searchParams.set('sig','a'.repeat(43)+'=');
 let calls=0;
 const fetchImpl=async(url,options)=>{
   calls++;
   if(url===s.url){assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{location:target.href}});}
   assert.equal(url,target.href);assert.equal(options.redirect,'error');
   return new Response(validBody(s));
 };
 const result=await probeNoKeySource(s,fetchImpl);
 assert.equal(result.state,'TRANSPORT_READABLE');assert.equal(calls,2);
 assert.ok(!JSON.stringify(result).includes('sig='));
 for(const mutate of [u=>u.hostname='untrusted.example',u=>u.pathname='/other.xml',u=>u.searchParams.set('sp','rw'),u=>u.searchParams.set('se',new Date(Date.now()-60000).toISOString()),u=>u.username='user',u=>u.searchParams.append('sig','another')]){
   const bad=new URL(target);mutate(bad);let attempts=0;
   const r=await probeNoKeySource(s,async()=>{attempts++;return new Response(null,{status:302,headers:{location:bad.href}});});
   assert.equal(attempts,1);assert.notEqual(r.state,'TRANSPORT_READABLE');
 }
 let hops=0;
 const repeated=await probeNoKeySource(s,async()=>{hops++;return new Response(null,{status:302,headers:{location:target.href}});});
 assert.equal(hops,2);assert.equal(repeated.state,'HTTP_UNAVAILABLE');
});
test('a pinned reader repair revision retries only that source without bypassing other polling intervals',async()=>{
 const state=memoryState();await collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:network(),now:at});
 const p=state.rows.get('geopolitics').payload;
 const old=p.snapshot.sources.un_security_council_sanctions;
 old.reader_revision=1;old.state='NETWORK_UNAVAILABLE';old.last_success_at=null;old.fingerprints=[];
 p.snapshot_sha256=createHash('sha256').update(JSON.stringify(p.snapshot)).digest('hex');
 let calls=0;
 const r=await collectProductionFreeSourceUpdates({stateClient:state,now:new Date(at.getTime()+60000),fetchImpl:async(url,options)=>{calls++;assert.equal(byUrl.get(url).id,'un_security_council_sanctions');return network()(url,options);}});
 assert.equal(calls,1);assert.equal(r.attempted,1);assert.equal(r.retained_degraded_readers,0);
 assert.equal(r.per_category.geopolitics.newly_detected_update_fingerprints,0);
});
test('cron startup jitter cannot suppress the next half-hour slot or reset denial backoff',async()=>{
 const state=memoryState();const first=new Date('2026-10-16T07:17:01.000Z');
 await collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:network('one','us_doe'),now:first});
 const next=await collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:network('two'),now:new Date('2026-10-16T07:47:00.000Z')});
 // The elapsed duration is 29m59s; all healthy fast readers must still poll.
 assert.equal(next.attempted,PRODUCTION_FREE_UPDATE_SOURCES.filter(s=>s.poll_minutes===30).length-1);
 assert.equal(next.retained_degraded_readers,1);
 assert.deepEqual(next.retained_degraded_source_readers.map(x=>({
   id:x.id,category:x.category,state:x.state
 })),[{id:'us_doe',category:'rare_earth',state:'DENIED_OR_RATE_LIMIT'}]);
 const calendar=await collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:network('two'),now:new Date('2026-10-17T00:17:00.000Z')});
 assert.equal(calendar.attempted,36);
});
test('USGS MCS repair revision rechecks same-publisher fallback before annual interval without event promotion',async()=>{
 const state=memoryState();
 await collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:network(),now:at});
 const p=state.rows.get('rare_earth').payload;
 p.snapshot.sources.usgs_mcs.reader_revision=1;
 p.snapshot.sources.usgs_mcs.state='NETWORK_UNAVAILABLE';
 p.snapshot_sha256=createHash('sha256').update(JSON.stringify(p.snapshot)).digest('hex');
 const spec=PRODUCTION_FREE_UPDATE_SOURCES.find(x=>x.id==='usgs_mcs');
 assert.equal(spec.reader_revision,2);
 const official='https://www.usgs.gov/centers/national-minerals-information-center/mineral-commodity-summaries';
 const calls=[];
 const result=await collectProductionFreeSourceUpdates({stateClient:state,
  now:new Date(at.getTime()+60000),
  fetchImpl:async(url)=>{
   calls.push(url);
   if(url===spec.url)throw Error('temporary primary network problem');
   assert.equal(url,official);
   return new Response('<!doctype html><html><h1>National Minerals Information Center</h1><h2>Mineral Commodity Summaries 2026</h2></html>');
  }});
 assert.deepEqual(calls,[spec.url,official]);
 assert.equal(result.attempted,1);
 assert.equal(result.retained_degraded_readers,0);
 assert.equal(result.current_verified_intelligence,false);
 assert.equal(result.commercial_eligible,false);
 assert.equal(state.rows.get('rare_earth').payload.snapshot.sources.usgs_mcs.reader_revision,2);
});
test('a reader revision never shortens an existing publisher-denial backoff',async()=>{
 const state=memoryState();await collectProductionFreeSourceUpdates({stateClient:state,fetchImpl:network('one','un_security_council_sanctions'),now:at});
 const p=state.rows.get('geopolitics').payload;
 p.snapshot.sources.un_security_council_sanctions.reader_revision=1;
 p.snapshot_sha256=createHash('sha256').update(JSON.stringify(p.snapshot)).digest('hex');
 let calls=0;
 const r=await collectProductionFreeSourceUpdates({stateClient:state,now:new Date(at.getTime()+60000),fetchImpl:async()=>{calls++;throw Error('denial must not be retried');}});
 assert.equal(calls,0);assert.equal(r.attempted,0);assert.equal(r.retained_degraded_readers,1);
});

test('MARAD and IEA 403 receive a persistent 24h quota backoff, not a six-hour retry storm',async()=>{
 const state=memoryState();
 let maradCalls=0,ieaCalls=0;
 const traffic=async(url,opts)=>{
   const s=byUrl.get(url);assert.ok(s);
   if(s.id==='marad_advisories'){maradCalls++;return new Response('denied',{status:403});}
   if(s.id==='iea_minerals_global'){ieaCalls++;return new Response('denied',{status:403});}
   return network()(url,opts);
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
