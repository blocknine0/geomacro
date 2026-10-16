// Existing free-source reader, with bounded source-update fingerprints and
// native clocks. This does not score, sign, grant rights or publish articles.
import {createHash} from 'node:crypto';
import {FREE_NO_KEY_TRANSPORT_SPECS,probeNoKeySource} from './free-no-key-source-probe.mjs';
import {SOURCE_LINEUP_BY_ID,SOURCE_LINEUP} from './operator-commercial-free-source-lineup.mjs';
import {officialItemNativePublicationMs} from './official-native-item-publication-date.mjs';

const DOMAINS=['geopolitics','macro','rare_earth'];
const sha=x=>createHash('sha256').update(x).digest('hex');
const MAX_HASHES=96;
const SCHEMA='geomacro.free-source-production-update-checkpoint.v1';
const BASELINE=new Set(['bls','world_bank_wdi','treasury_fiscaldata','usgs_mcs']);
const EXTRA=[
 {id:'federal_reserve',category:'macro',url:'https://www.federalreserve.gov/feeds/press_all.xml',format:'rss',maxBytes:384000},
 {id:'noaa_nhc',category:'geopolitics',url:'https://www.nhc.noaa.gov/index-at.xml',format:'rss',maxBytes:256000},
 {id:'uk_fcdo_advisories',category:'geopolitics',url:'https://www.gov.uk/api/search.json?filter_format=travel_advice&order=-public_timestamp&count=5',format:'json',maxBytes:128000},
 {id:'un_security_council_sanctions',reader_revision:2,category:'geopolitics',url:'https://scsanctions.un.org/resources/xml/en/consolidated.xml',format:'xml',maxBytes:4*1024*1024,baseline:true},
 {id:'ons',category:'macro',url:'https://www.ons.gov.uk/releasecalendar?rss&highlight=true&limit=10&page=1&release-type=type-published&sort=date-newest',format:'rss',maxBytes:256000},
 {id:'ny_fed',category:'macro',url:'https://markets.newyorkfed.org/api/rates/secured/sofr/last/5.json',format:'json',maxBytes:128000,baseline:true},
 {id:'ecb_fx',category:'macro',url:'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',format:'xml',maxBytes:128000,baseline:true},
 {id:'us_doe',category:'rare_earth',url:'https://www.energy.gov/rss/energygov/2193718',format:'rss',maxBytes:384000},
 {id:'us_bis_export_controls',category:'geopolitics',url:'https://www.federalregister.gov/api/v1/documents.json?conditions%5Bagencies%5D%5B%5D=industry-and-security-bureau&per_page=5&order=newest',format:'json',maxBytes:128000},
 {id:'wikimedia_pageviews',category:'geopolitics',url:(()=>{const day=new Date(Date.now()-86400000).toISOString().slice(0,10).replaceAll('-','')+'00';return 'https://wikimedia.org/api/rest_v1/metrics/pageviews/aggregate/all-projects/all-access/user/daily/'+day+'/'+day;})(),format:'json',maxBytes:128000,baseline:true},
];
export const PRODUCTION_FREE_UPDATE_SOURCES=Object.freeze([
 ...FREE_NO_KEY_TRANSPORT_SPECS.map(s=>({...s,baseline:BASELINE.has(s.id)})),
 ...EXTRA.map(s=>({...s,production_update_reader:true})),
].map(s=>{
 const source=SOURCE_LINEUP_BY_ID.get(s.id),u=new URL(s.url);
 if(!source||source.access!=='NO_KEY'||source.category!==s.category||u.protocol!=='https:'||u.username||u.password||u.hash||u.port)
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
 let sampled=0,kind='REFERENCE_DATASET_CHANGE';
 function record(identity,clock=null){
   if(sampled>=40)return;
   const hash=sha(String(identity));if(seen.has(hash))return;seen.add(hash);
   fingerprints.push(hash);sampled++;
   if(clock)nativeTimes.push(clock);
 }
 if(['rss','atom'].includes(spec.format)){
   kind='PUBLISHER_FEED_CHANGE';
   // A feed's updated clock, fetch time and date-only fields are not original
   // publication. Future or invalid explicit publication is never accepted.
   const atom=spec.format==='atom';
   const entries=[...payload.matchAll(atom?/<(?:atom:)?entry(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?entry>/giu:/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)].slice(0,40);
   for(const [,item] of entries){
     const published=xmlField(item,atom?'published':'pubDate');
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
 }else kind='CONTEXT_ONLY_NO_UPDATE_RECORDS';
 const unique=[...new Set(fingerprints)];
 return {kind,sampled_records:sampled,fingerprints:unique,
   latest_native_publication_at:nativeTimes.sort().at(-1)??null,
   native_publications_within_30m:nativeTimes.filter(t=>now.getTime()-Date.parse(t)<=1800000).length,
   native_publications_within_6h:nativeTimes.filter(t=>now.getTime()-Date.parse(t)<=21600000).length,
   // Native feed clocks remain source observations, not verified risk claims.
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
      !(s.kind===null||['REFERENCE_DATASET_CHANGE','PUBLISHER_FEED_CHANGE','HAZARD_OBSERVATION_CHANGE','SECURITY_CATALOGUE_CHANGE','REGULATORY_DOCUMENT_CHANGE','ADVISORY_DOCUMENT_CHANGE','DATASET_SNAPSHOT_CHANGE','CONTEXT_ONLY_NO_UPDATE_RECORDS'].includes(s.kind))||
      !['TRANSPORT_READABLE','NETWORK_UNAVAILABLE','DENIED_OR_RATE_LIMIT','HTTP_UNAVAILABLE','FORMAT_OR_SIZE_UNVERIFIED'].includes(s.state)||
      ['last_attempt_at','last_success_at','latest_native_publication_at'].some(k=>
        s[k]!==null&&(typeof s[k]!=='string'||!Number.isFinite(Date.parse(s[k]))||new Date(s[k]).toISOString()!==s[k])))throw Error('FREE_SOURCE_UPDATE_PREVIOUS_STATE_INVALID');
 }
 return p.snapshot;
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
     old.state==='DENIED_OR_RATE_LIMIT'?Math.max(360,spec.poll_minutes):Math.min(60,spec.poll_minutes);
   // Scheduled jobs start with jitter. Deduplicate healthy reads by UTC
   // polling slot, not an elapsed cutoff that can skip every other cron run.
   // Publisher denials retain a full elapsed backoff, regardless of slots.
   const notDue=old?.state==='TRANSPORT_READABLE'
     ?Math.floor(now.getTime()/(interval*60000))===Math.floor(last/(interval*60000))
     :now.getTime()-last<interval*60000;
   if((old?.reader_revision??1)===(spec.reader_revision??1)&&Number.isFinite(last)&&last<=now.getTime()&&notDue){
     outcomes.push({category:spec.category,state:'NOT_DUE',new_updates:0});continue;
   }
   let observed=null;
   const result=await probeNoKeySource(spec,fetchImpl,{onPayload:body=>{observed=summarizeFreeSourceUpdates(spec,body,now);}});
   if(onObservation)onObservation({id:spec.id,category:spec.category,state:result.state,http_status:result.http_status});
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
     native_publications_within_6h:healthy?observed.native_publications_within_6h:0});
 }}
 await Promise.all(Array.from({length:4},()=>worker()));
 const expected=new Map();
 for(const category of DOMAINS){
   const snapshot={category,checked_at:now.toISOString(),sources:snapshots[category].sources};
   if(Buffer.byteLength(JSON.stringify(snapshot))>64*1024)throw Error('FREE_SOURCE_UPDATE_CHECKPOINT_TOO_LARGE');
   const hash=sha(JSON.stringify(snapshot));expected.set(category,hash);
   await stateClient.persist(category,{schema:SCHEMA,snapshot,snapshot_sha256:hash},
     {cursor:{status:Object.values(snapshot.sources).some(s=>s.state!=='TRANSPORT_READABLE')?'degraded':'observed'},last_attempt_at:now.toISOString()});
 }
 const after=await stateClient.loadRows();
 for(const category of DOMAINS){
   const restored=previousSnapshot(after.get(category),category);
   if(sha(JSON.stringify(restored))!==expected.get(category))throw Error('FREE_SOURCE_UPDATE_READBACK_MISMATCH');
 }
 return {schema:'geomacro.production-free-source-updates.v1',checked_at:now.toISOString(),
   families_catalogued:SOURCE_LINEUP.length,
   families_outside_this_reader:SOURCE_LINEUP.length-PRODUCTION_FREE_UPDATE_SOURCES.length,
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
     first_observation_baselines:rows.filter(r=>r.first_observation_baseline).length,
   }]})),
   first_observation_is_new_update:false,baseline_poll_minutes:1440,fast_poll_target_minutes:30,
   schedule_guaranteed:false,all_catalogued_sources_live:false,
   raw_payload_persisted:false,raw_headlines_or_urls_exposed:false,
   current_verified_intelligence:false,commercial_eligible:false,
   d1_writes:3,d1_exact_metadata_readback_verified:true,b2_requests:0,supabase_requests:0,payments:0};
}
