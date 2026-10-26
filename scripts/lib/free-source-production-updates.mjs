// Existing free-source reader, with bounded source-update fingerprints and
// native clocks. This does not score, sign, grant rights or publish articles.
import {GLOBAL_OFFICIAL_RELEASE_FEEDS,ieaMineralsIndexCandidates,verifiedGlobalRdfFeed} from './global-official-release-feeds.mjs';
import {createHash} from 'node:crypto';
import {MARAD_OFFICIAL_RSS_URL,summarizeMaradCorridorContext} from './marad-official-corridor-context.mjs';
import {FREE_NO_KEY_TRANSPORT_SPECS,probeNoKeySource} from './free-no-key-source-probe.mjs';
import {SOURCE_LINEUP_BY_ID,SOURCE_LINEUP} from './operator-commercial-free-source-lineup.mjs';
import {officialItemNativePublicationMs} from './official-native-item-publication-date.mjs';
import {GDELT_PUBLIC_BATCH_MANIFEST,parseGdeltBatchManifest} from './gdelt-free-batch-manifest.mjs';

const DOMAINS=['geopolitics','macro','rare_earth'];
const sha=x=>createHash('sha256').update(x).digest('hex');
const MAX_HASHES=96;
const SCHEMA='geomacro.free-source-production-update-checkpoint.v1';
// This checkpoint namespace is intentionally separate from the 2026-10
// legacy free_source_production_updates rows, whose stored schema/hash
// failed actual protected D1 readback. Do not DELETE, overwrite or promote
// the legacy metadata. v2 starts a fresh, explicitly non-event baseline.
export const PRODUCTION_FREE_SOURCE_D1_PIPELINE="free_source_production_updates_v2";
const BASELINE=new Set(['bls','world_bank_wdi','treasury_fiscaldata','usgs_mcs']);
export const USGS_MCS_OFFICIAL_LANDING_URL =
  'https://www.usgs.gov/centers/national-minerals-information-center/mineral-commodity-summaries';
// Official Fed same-origin monetary feed; never another independent issuer.
export const FEDERAL_RESERVE_MONETARY_OFFICIAL_FALLBACK_URL =
  'https://www.federalreserve.gov/feeds/press_monetary.xml';

const EXTRA=[
 // Public GDELT dataset release pointer, 15-minute batching, no ZIP requests.
 // GDELT index metadata may discover leads for the canonical 195-country
 // original issuer workflow; it is NEVER an original article publication time.
 {id:'gdelt_events',reader_revision:1,category:'geopolitics',
  url:GDELT_PUBLIC_BATCH_MANIFEST,format:'manifest',maxBytes:4096},
 {id:'federal_reserve',reader_revision:2,category:'macro',url:'https://www.federalreserve.gov/feeds/press_all.xml',format:'rss',maxBytes:384000},
 {id:'noaa_nhc',category:'geopolitics',url:'https://www.nhc.noaa.gov/index-at.xml',format:'rss',maxBytes:256000},
 // Reuse the catalogued MARAD family, no new independent publisher or cron.
 {id:'marad_advisories',reader_revision:1,category:'geopolitics',url:MARAD_OFFICIAL_RSS_URL,
  format:'rss',maxBytes:256000},
 {id:'uk_fcdo_advisories',category:'geopolitics',url:'https://www.gov.uk/api/search.json?filter_format=travel_advice&order=-public_timestamp&count=5',format:'json',maxBytes:128000},
 {id:'un_security_council_sanctions',reader_revision:2,category:'geopolitics',url:'https://scsanctions.un.org/resources/xml/en/consolidated.xml',format:'xml',maxBytes:4*1024*1024,baseline:true},
 {id:'ons',category:'macro',url:'https://www.ons.gov.uk/releasecalendar?rss&highlight=true&limit=10&page=1&release-type=type-published&sort=date-newest',format:'rss',maxBytes:256000},
 {id:'ny_fed',category:'macro',url:'https://markets.newyorkfed.org/api/rates/secured/sofr/last/5.json',format:'json',maxBytes:128000,baseline:true},
 {id:'ecb_fx',category:'macro',url:'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',format:'xml',maxBytes:128000,baseline:true},
 {id:'us_doe',category:'rare_earth',url:'https://www.energy.gov/rss/energygov/2193718',format:'rss',maxBytes:384000},
 {id:'us_bis_export_controls',category:'geopolitics',url:'https://www.federalregister.gov/api/v1/documents.json?conditions%5Bagencies%5D%5B%5D=industry-and-security-bureau&per_page=5&order=newest',format:'json',maxBytes:128000},
 // Official Analytics API supports all-agents, not generic user traffic here.
 // Read a complete UTC day two days old to avoid publication lag/404 at the edge.
 {id:'wikimedia_pageviews',reader_revision:2,category:'geopolitics',url:(()=>{const day=new Date(Date.now()-2*86400000).toISOString().slice(0,10).replaceAll('-','')+'00';return 'https://wikimedia.org/api/rest_v1/metrics/pageviews/aggregate/all-projects/all-access/all-agents/daily/'+day+'/'+day;})(),format:'json',maxBytes:128000,baseline:true},
];
export const PRODUCTION_FREE_UPDATE_SOURCES=Object.freeze([
 ...FREE_NO_KEY_TRANSPORT_SPECS.map(s=>({...s,baseline:BASELINE.has(s.id),
   // Re-probe the repaired USGS MCS URL after transport failures without
   // shortening provider 401/403/429 denial backoff.
   reader_revision:s.id==='usgs_mcs'?2:s.reader_revision})),
 ...EXTRA.map(s=>({...s,production_update_reader:true})),
 // The DOE feed was already inventoried under the established us_doe id.
 // One upstream URL deserves ONE cache/poll budget and ONE D1 fingerprint.
 // Keep the global pinned publisher registry available to on-demand originals
 // without fetching the same DOE feed twice in the free update collector.
 ...GLOBAL_OFFICIAL_RELEASE_FEEDS.filter(s=>
   !EXTRA.some(existing=>existing.url===s.url&&existing.category===s.category)),
].map(s=>{
 const source=SOURCE_LINEUP_BY_ID.get(s.id),u=new URL(s.url);
 const global=GLOBAL_OFFICIAL_RELEASE_FEEDS.some(x=>x.id===s.id&&x.category===s.category&&x.url===s.url);
 if((!global&&(!source||source.access!=='NO_KEY'||source.category!==s.category))||u.protocol!=='https:'||u.username||u.password||u.hash||u.port)
   throw Error('FREE_SOURCE_UPDATE_REGISTRY_INVALID');
 return Object.freeze({...s,poll_minutes:s.baseline?1440:30});
}));
function xmlField(item,name){
 const raw=item.match(new RegExp('<(?:[a-zA-Z]+:)?'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z]+:)?'+name+'>','iu'))?.[1]??'';
 return raw.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/u,'$1').replace(/&amp;/giu,'&').trim();
}
function nativeClock(value,now){
 const ms=officialItemNativePublicationMs(value);
 return Number.isFinite(ms)&&ms<=now.getTime()?new Date(ms).toISOString():null;
}
export function summarizeFreeSourceUpdates(spec,payload,now){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('FREE_SOURCE_UPDATE_CLOCK_INVALID');
 const fingerprints=[],nativeTimes=[],seen=new Set();
 const maradCorridor=spec.id==='marad_advisories'?
   summarizeMaradCorridorContext(payload,now):null;
 let sampled=0,kind='REFERENCE_DATASET_CHANGE';
 function record(identity,clock=null){
   if(sampled>=40)return;
   const hash=sha(String(identity));if(seen.has(hash))return;seen.add(hash);
   fingerprints.push(hash);sampled++;
   if(clock)nativeTimes.push(clock);
 }
 if(spec.format==='manifest'&&spec.id==='gdelt_events'&&
    spec.url===GDELT_PUBLIC_BATCH_MANIFEST){
   const batch=parseGdeltBatchManifest(payload,{now});
   if(!batch)throw Error('GDELT_FREE_RELEASE_INDEX_INVALID');
   kind='GDELT_FREE_DATASET_BATCH_DISCOVERY_ONLY';
   record(batch.internal_batch_identity);
   // Even a 15-minute GDELT index says NOTHING about a publisher's precise
   // native publication clock. Native articles still need independent review.
 }else if(['rss','atom'].includes(spec.format)){
   kind='PUBLISHER_FEED_CHANGE';
   // A feed's updated clock, fetch time and date-only fields are not original
   // publication. Future or invalid explicit publication is never accepted.
   const atom=spec.format==='atom';
   const rdf=verifiedGlobalRdfFeed(spec.id,spec.url,payload);
   const entries=[...payload.matchAll(atom?/<(?:atom:)?entry(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?entry>/giu:/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)].slice(0,40);
   for(const [,item] of entries){
     const published=xmlField(item,rdf?'date':atom?'published':'pubDate');
     if(spec.topic&&!spec.topic.test(xmlField(item,'title')))continue;
     const clock=published?nativeClock(published,now):null;
     if(published&&!clock)continue;
     const id=xmlField(item,'guid')||xmlField(item,'id')||xmlField(item,'link')||
       item.match(/<link\b[^>]*href=["']([^"']+)["']/iu)?.[1];
     if(!id)continue;
     record(id+'\n'+(clock??'PUBLICATION_UNVERIFIED')+'\n'+xmlField(item,'title'),clock);
   }
 }else if(spec.format==='json'){
   const x=JSON.parse(payload);
   let rows=[];
   if(spec.id==='usgs_earthquakes'){
     kind='HAZARD_OBSERVATION_CHANGE';
     rows=x.features.map(f=>({id:f.id,time:f.properties?.time,updated:f.properties?.updated}));
   }else if(spec.id==='cisa_kev'){kind='SECURITY_CATALOGUE_CHANGE';rows=[...x.vulnerabilities].sort((a,b)=>String(b.dateAdded??'').localeCompare(String(a.dateAdded??'')));}
   else if(['federal_register','us_bis_export_controls'].includes(spec.id)){kind='REGULATORY_DOCUMENT_CHANGE';rows=x.results;}
   else if(spec.id.startsWith('govuk_global_')){kind='PUBLISHER_INDEX_CHANGE';rows=x.results;}
   else if(spec.id==='uk_fcdo_advisories'){kind='ADVISORY_DOCUMENT_CHANGE';rows=x.results;}
   else if(spec.id==='ny_fed')rows=x.refRates;
   else if(spec.id==='wikimedia_pageviews')rows=x.items;
   else if(spec.id==='bls')rows=x.Results.series.flatMap(s=>s.data??[]);
   else if(spec.id==='world_bank_wdi')rows=x[1];
   else if(spec.id==='treasury_fiscaldata')rows=x.data;
   for(const row of rows.slice(0,40))record(JSON.stringify(row));
 }else if(spec.format==='xml'){
   // Only a dataset byte-version observation. No per-entity new designation,
   // intraday publication time or risk event is inferred from a full list.
   kind='DATASET_SNAPSHOT_CHANGE';record(payload);
 }else if(spec.id==='iea_minerals_global'){
   kind='PUBLISHER_INDEX_CHANGE';
   for(const row of ieaMineralsIndexCandidates(payload))record(row.articleUrl+'\n'+row.title);
 }else kind='CONTEXT_ONLY_NO_UPDATE_RECORDS';
 const unique=[...new Set(fingerprints)];
 return {kind,sampled_records:sampled,fingerprints:unique,
   latest_native_publication_at:nativeTimes.sort().at(-1)??null,
   native_publications_within_30m:nativeTimes.filter(t=>now.getTime()-Date.parse(t)<=1800000).length,
   native_publications_within_6h:nativeTimes.filter(t=>now.getTime()-Date.parse(t)<=21600000).length,
   // Native feed clocks remain source observations, not verified risk claims.
   corridor_advisory_candidate_count:maradCorridor?.advisory_items_with_corridor_terms??0,
   candidate_corridor_ids:maradCorridor?.candidate_corridor_ids??[],
   corridor_current_disruption_verified:false,
   independently_verified_event:false,topic_relevance_classified:false};
}
function previousSnapshot(row,category){
 if(!row)return {category,sources:{}};
 const p=row.payload;
 if(p?.schema!==SCHEMA||p.snapshot?.category!==category||
    p.snapshot_sha256!==sha(JSON.stringify(p.snapshot))||
    !p.snapshot.sources||Array.isArray(p.snapshot.sources)||
    Object.keys(p.snapshot).some(k=>!['category','checked_at','sources'].includes(k)))throw Error('FREE_SOURCE_UPDATE_PREVIOUS_STATE_INVALID');
 for(const [id,s] of Object.entries(p.snapshot.sources)){
   if(!PRODUCTION_FREE_UPDATE_SOURCES.some(x=>x.id===id&&x.category===category)||
      !Array.isArray(s.fingerprints)||s.fingerprints.length>MAX_HASHES||
      s.fingerprints.some(x=>!/^[a-f0-9]{64}$/u.test(x))||
      !(s.reader_revision===undefined||(Number.isInteger(s.reader_revision)&&s.reader_revision>=1&&s.reader_revision<=100))||
      Object.keys(s).some(k=>!['reader_revision','fingerprints','last_attempt_at','last_success_at','state','kind','latest_native_publication_at','http_status'].includes(k))||
      !(s.http_status===null||(Number.isInteger(s.http_status)&&s.http_status>=100&&s.http_status<=599))||
      !(s.kind===null||['GDELT_FREE_DATASET_BATCH_DISCOVERY_ONLY','REFERENCE_DATASET_CHANGE','PUBLISHER_FEED_CHANGE','HAZARD_OBSERVATION_CHANGE','SECURITY_CATALOGUE_CHANGE','REGULATORY_DOCUMENT_CHANGE','ADVISORY_DOCUMENT_CHANGE','DATASET_SNAPSHOT_CHANGE','CONTEXT_ONLY_NO_UPDATE_RECORDS','PUBLISHER_INDEX_CHANGE'].includes(s.kind))||
      !['TRANSPORT_READABLE','NETWORK_UNAVAILABLE','DENIED_OR_RATE_LIMIT','HTTP_UNAVAILABLE','FORMAT_OR_SIZE_UNVERIFIED'].includes(s.state)||
      ['last_attempt_at','last_success_at','latest_native_publication_at'].some(k=>
        s[k]!==null&&(typeof s[k]!=='string'||!Number.isFinite(Date.parse(s[k]))||new Date(s[k]).toISOString()!==s[k])))throw Error('FREE_SOURCE_UPDATE_PREVIOUS_STATE_INVALID');
 }
 return p.snapshot;
}
// The annual MCS publication landing endpoint sometimes times out while the
// first-party USGS centre page remains accessible. This is a SAME-PUBLISHER,
// exact-URL transport fallback, never another independent original event.
export async function probeProductionFreeUpdateSource(spec,fetchImpl=fetch,now=new Date()){
 if(!PRODUCTION_FREE_UPDATE_SOURCES.includes(spec))throw Error('FREE_SOURCE_UPDATE_SPEC_UNREGISTERED');
 let observed=null,official_fallback_used=false;
 let result=await probeNoKeySource(spec,fetchImpl,{
   onPayload:body=>{observed=summarizeFreeSourceUpdates(spec,body,now);},
 });
 if(spec.id==='usgs_mcs'&&spec.category==='rare_earth'&&
    spec.url==='https://pubs.usgs.gov/publication/mcs2026'&&
    spec.format==='html'&&result.state==='NETWORK_UNAVAILABLE'){
   let fallbackObservation=null;
   const fallback=await probeNoKeySource(
     {...spec,url:USGS_MCS_OFFICIAL_LANDING_URL},fetchImpl,{
       onPayload:body=>{
         if(!/Mineral Commodity Summaries 2026/iu.test(body)||
            !/National Minerals Information Center/iu.test(body))
           throw Error('USGS_MCS_OFFICIAL_LANDING_CONTENT_UNVERIFIED');
         fallbackObservation=summarizeFreeSourceUpdates(spec,body,now);
       },
     });
   if(fallback.state==='TRANSPORT_READABLE'&&
      fallbackObservation?.kind==='CONTEXT_ONLY_NO_UPDATE_RECORDS'){
     result=fallback;
     observed=fallbackObservation;
     official_fallback_used=true;
   }
 }
 // Production detected HTTP 404 on Federal Reserve's public press_all feed.
 // Only retry one PINNED monetary RSS feed at the exact same first-party host
 // when the primary has a transport failure, 404 or 5xx. Never use the
 // alternate after 401/403/429 or malformed successful responses. This is
 // one publisher's transport continuity, not an independent original, a
 // native-page clock attestation, a financial event or commercial rights.
 if(spec.id==='federal_reserve' && spec.category==='macro' &&
    spec.url==='https://www.federalreserve.gov/feeds/press_all.xml' &&
    spec.format==='rss' && (
      result.state==='NETWORK_UNAVAILABLE' ||
      (result.state==='HTTP_UNAVAILABLE' &&
       (result.http_status===404 || (result.http_status>=500 && result.http_status<=599)))
    )){
   let alternativeObserved=null;
   const fallback=await probeNoKeySource(
     {...spec,url:FEDERAL_RESERVE_MONETARY_OFFICIAL_FALLBACK_URL},
     fetchImpl,{
      onPayload:body=>{
       alternativeObserved=summarizeFreeSourceUpdates(spec,body,now);
      }
     });
   if(fallback.state==='TRANSPORT_READABLE' &&
      alternativeObserved?.kind==='PUBLISHER_FEED_CHANGE'){
     result=fallback;
     observed=alternativeObserved;
     official_fallback_used=true;
   }
 }
 return {result,observed,official_fallback_used};
}
/**
 * Verified D1-only operational readback. This proves freshness of the latest
 * successful *source transport*, never that an annual economic observation
 * was newly published or a current news event was verified.
 * Emits only source identity, timestamps and closed status enums.
 */
export function assessWdiReferenceContinuity(row,now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
   throw Error('WDI_SOURCE_CHECK_CLOCK_INVALID');
 const lastSuccess=Date.parse(row?.last_success_at??'');
 const lastAttempt=Date.parse(row?.last_attempt_at??'');
 const hasSuccess=Number.isFinite(lastSuccess)&&lastSuccess<=now.getTime();
 const status=!row?'AWAITING_FIRST_POLL':
   row.state!=='TRANSPORT_READABLE'?'SOURCE_RECOVERY_BACKOFF':
   !hasSuccess?'NO_SUCCESSFUL_REFERENCE_READ':
   now.getTime()-lastSuccess>36*3600000?'LAST_SOURCE_READ_STALE':
   'SOURCE_READ_WITHIN_36H';
 return Object.freeze({
   source_id:'world_bank_wdi',category:'macro',
   status,last_attempt_at:Number.isFinite(lastAttempt)&&lastAttempt<=now.getTime()
     ?row.last_attempt_at:null,
   last_success_at:hasSuccess?row.last_success_at:null,
   last_http_status:row?.http_status??null,
   last_successful_source_read_within_36h:hasSuccess&&
     now.getTime()-lastSuccess<=36*3600000,
   d1_verified_source_checkpoint_only:true,
   annual_reference_is_not_current_news:true,
   data_release_time_not_inferred:true,
   customer_delivery_not_inferred:true,
 });
}

export async function collectProductionFreeSourceUpdates({stateClient,fetchImpl=fetch,now=new Date(),onObservation=null}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('FREE_SOURCE_UPDATE_CLOCK_INVALID');
 const before=await stateClient.loadRows();
 if(before.size>3||[...before.keys()].some(k=>!DOMAINS.includes(k)))throw Error('FREE_SOURCE_UPDATE_PREVIOUS_STATE_INVALID');
 const snapshots=Object.fromEntries(DOMAINS.map(c=>[c,previousSnapshot(before.get(c),c)]));
 const outcomes=[];let cursor=0;
 async function worker(){for(;;){
   const i=cursor++;if(i>=PRODUCTION_FREE_UPDATE_SOURCES.length)return;
   const spec=PRODUCTION_FREE_UPDATE_SOURCES[i],old=snapshots[spec.category].sources[spec.id];
   const last=Date.parse(old?.last_attempt_at??'');
   const interval=!old||old.state==='TRANSPORT_READABLE'?spec.poll_minutes:
     old.state==='DENIED_OR_RATE_LIMIT'?(
       ['marad_advisories','iea_minerals_global'].includes(spec.id)
         ?1440:Math.max(360,spec.poll_minutes)
     // Annual baselines cannot justify 24 repeated attempts/day after a
     // malformed/failed 200. A 6-hour retry recovers automatically with a
     // bounded maximum of four attempts/day; 401/403/429 retain daily backoff.
     ):spec.baseline?360:Math.min(60,spec.poll_minutes);
   // Scheduled jobs start with jitter. Deduplicate healthy reads by UTC
   // polling slot, not an elapsed cutoff that can skip every other cron run.
   // Publisher denials retain a full elapsed backoff, regardless of slots.
   const notDue=old?.state==='TRANSPORT_READABLE'
     ?Math.floor(now.getTime()/(interval*60000))===Math.floor(last/(interval*60000))
     :now.getTime()-last<interval*60000;
   if((old?.state==='DENIED_OR_RATE_LIMIT'||(old?.reader_revision??1)===(spec.reader_revision??1))&&Number.isFinite(last)&&last<=now.getTime()&&notDue){
     outcomes.push({category:spec.category,state:'NOT_DUE',new_updates:0});continue;
   }
   const {result,observed,official_fallback_used}=
     await probeProductionFreeUpdateSource(spec,fetchImpl,now);
   if(onObservation)onObservation({id:spec.id,category:spec.category,state:result.state,
     http_status:result.http_status,official_same_publisher_fallback_used:official_fallback_used});
   const healthy=result.state==='TRANSPORT_READABLE'&&observed!==null;
   const known=new Set(old?.fingerprints??[]);
   const fresh=healthy&&old?.last_success_at?observed.fingerprints.filter(x=>!known.has(x)).length:0;
   snapshots[spec.category].sources[spec.id]={
     reader_revision:spec.reader_revision??1,
     fingerprints:healthy?[...new Set([...(old?.fingerprints??[]),...observed.fingerprints])].slice(-MAX_HASHES):old?.fingerprints??[],
     last_attempt_at:now.toISOString(),last_success_at:healthy?now.toISOString():old?.last_success_at??null,
     state:result.state,kind:observed?.kind??old?.kind??null,
     http_status:result.http_status,
     latest_native_publication_at:healthy?observed.latest_native_publication_at:old?.latest_native_publication_at??null,
   };
   outcomes.push({category:spec.category,state:result.state,new_updates:fresh,
     first_observation_baseline:healthy&&!old?.last_success_at,kind:observed?.kind??null,
     native_publications_within_30m:healthy?observed.native_publications_within_30m:0,
     native_publications_within_6h:healthy?observed.native_publications_within_6h:0,
     corridor_advisory_candidate_count:healthy?observed.corridor_advisory_candidate_count:0,
     candidate_corridor_ids:healthy?observed.candidate_corridor_ids:[]});
 }}
 await Promise.all(Array.from({length:4},()=>worker()));
 const expected=new Map();
 for(const category of DOMAINS){
   const snapshot={category,checked_at:now.toISOString(),sources:snapshots[category].sources};
   if(Buffer.byteLength(JSON.stringify(snapshot))>96*1024)throw Error('FREE_SOURCE_UPDATE_CHECKPOINT_TOO_LARGE');
   const hash=sha(JSON.stringify(snapshot));expected.set(category,hash);
   await stateClient.persist(category,{schema:SCHEMA,snapshot,snapshot_sha256:hash},
     {cursor:{status:Object.values(snapshot.sources).some(s=>s.state!=='TRANSPORT_READABLE')?'degraded':'observed'},last_attempt_at:now.toISOString()});
 }
 const after=await stateClient.loadRows();
 for(const category of DOMAINS){
   const restored=previousSnapshot(after.get(category),category);
   if(sha(JSON.stringify(restored))!==expected.get(category))throw Error('FREE_SOURCE_UPDATE_READBACK_MISMATCH');
 }
 // Only allowlisted public source IDs plus coarse state leave this diagnostic.
 // The previously unattempted degraded reader must remain visible, instead of
 // forcing annual baselines or explicit 401/403/429 backoff to be bypassed.
 const retainedDegraded=DOMAINS.flatMap(category=>
   Object.entries(snapshots[category].sources).filter(([id,s])=>
     PRODUCTION_FREE_UPDATE_SOURCES.some(p=>p.id===id&&p.category===category)&&
     s.state!=='TRANSPORT_READABLE').map(([id,s])=>({
       id,category,state:s.state,last_attempt_at:s.last_attempt_at,
     }))).sort((a,b)=>a.category.localeCompare(b.category)||a.id.localeCompare(b.id));
 const wdiReference=assessWdiReferenceContinuity(snapshots.macro.sources.world_bank_wdi,now);
 return {schema:'geomacro.production-free-source-updates.v1',checked_at:now.toISOString(),
   wdi_reference:wdiReference,
   retained_degraded_source_readers:retainedDegraded,
   families_catalogued:SOURCE_LINEUP.length,
   families_outside_this_reader:SOURCE_LINEUP.filter(s=>!PRODUCTION_FREE_UPDATE_SOURCES.some(r=>r.id===s.id)).length,
   additional_global_release_readers:GLOBAL_OFFICIAL_RELEASE_FEEDS.length,
   configured_readers:PRODUCTION_FREE_UPDATE_SOURCES.length,
   attempted:outcomes.filter(x=>x.state!=='NOT_DUE').length,
   unavailable:outcomes.filter(x=>!['TRANSPORT_READABLE','NOT_DUE'].includes(x.state)).length,
   retained_degraded_readers:DOMAINS.reduce((n,c)=>n+Object.values(snapshots[c].sources).filter(s=>s.state!=='TRANSPORT_READABLE').length,0),
   per_category:Object.fromEntries(DOMAINS.map(c=>{const rows=outcomes.filter(r=>r.category===c);return [c,{
     configured:PRODUCTION_FREE_UPDATE_SOURCES.filter(s=>s.category===c).length,
     attempted:rows.filter(r=>r.state!=='NOT_DUE').length,
     readable:rows.filter(r=>r.state==='TRANSPORT_READABLE').length,
     newly_detected_update_fingerprints:rows.reduce((n,r)=>n+r.new_updates,0),
     native_publications_within_30m:rows.reduce((n,r)=>n+(r.native_publications_within_30m??0),0),
     corridor_advisory_candidate_count:rows.reduce((n,r)=>n+(r.corridor_advisory_candidate_count??0),0),
     // Canonical route IDs only, not article titles, source URLs or live incident assertions.
     candidate_corridor_ids:[...new Set(rows.flatMap(r=>r.candidate_corridor_ids??[]))].sort(),
     first_observation_baselines:rows.filter(r=>r.first_observation_baseline).length,
   }]})),
   first_observation_is_new_update:false,baseline_poll_minutes:1440,fast_poll_target_minutes:30,
   schedule_guaranteed:false,all_catalogued_sources_live:false,
   raw_payload_persisted:false,raw_headlines_or_urls_exposed:false,
   current_verified_intelligence:false,commercial_eligible:false,
   d1_writes:3,d1_exact_metadata_readback_verified:true,b2_requests:0,supabase_requests:0,payments:0};
}
