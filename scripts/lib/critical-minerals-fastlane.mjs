/** Global critical-minerals publisher mesh. Publisher region is not event location. */
import {createHash} from 'node:crypto';
import {boundedMacroGet,macroPreciousTopic} from './macro-fx-metals.mjs';
import {MINERAL_RELEASE_TOPIC} from './global-official-release-feeds.mjs';
import {unverifiedWebsiteSignalFromOsint} from './private-osint-website-bridge.mjs';
import {actorActionNewsObservation} from '../../src/lib/release-news-observation.ts';
import {sectorFeed as feed,MINERALS_MESH} from "./critical-minerals-registry.mjs";
export {MINERALS_MESH,MINERALS_SOURCE_IDS} from "./critical-minerals-registry.mjs";
const globalAlternative=feed('mining_technology','https://www.mining-technology.com/news/feed/','global');
const googleMinerals=feed('google_minerals','https://news.google.com/rss/search?q='+encodeURIComponent('(\"critical minerals\" OR \"rare earth\" OR lithium OR cobalt OR nickel OR graphite OR copper OR gallium OR germanium) (export OR supply OR mine OR policy OR sanctions) when:1d')+'&hl=en-US&gl=US&ceid=US:en','global');
const financialAlternative=feed('fxstreet_news','https://www.fxstreet.com/rss/news','global');
const googleMacro=feed('google_macro_metals','https://news.google.com/rss/search?q='+encodeURIComponent('(forex OR \"central bank\" OR gold OR silver) (rates OR demand OR supply OR intervention OR reserves) when:1d')+'&hl=en-US&gl=US&ceid=US:en','global');
const mineralNative=/(?:\b(?:litio|cobalto|cobre|n[ií]quel|grafito|tierras raras|minerales cr[ií]ticos|minera[cç][aã]o|min[eé]raux critiques|seltene erden)\b|关键矿产|稀土|锂|钴|희토류|리튬|редкозем)/iu;
const clean=s=>String(s??'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/\s+/g,' ').trim();
const tag=(s,t)=>new RegExp('<(?:[a-z]+:)?'+t+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-z]+:)?'+t+'>','i').exec(s)?.[1]??'';
export function parseSectorFeed(xml,spec,now){
 if(typeof xml!=='string'||xml.length>384*1024||/<!DOCTYPE|<!ENTITY/i.test(xml)||!/<(?:rss|feed)(?:\s|>)/i.test(xml))throw Error('SECTOR_FEED_INVALID');
 const result=[],seen=new Set();
 for(const [,chunk]of [...xml.matchAll(/<(?:[a-z]+:)?(?:item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-z]+:)?(?:item|entry)>/gi)].slice(0,75)){
  const title=clean(tag(chunk,'title'));if(title.length<25||title.length>250||/[<>]/.test(title))continue;
  const precious=macroPreciousTopic(title);
  const mineral=MINERAL_RELEASE_TOPIC.test(title)||mineralNative.test(title);
  const macro=precious||/\b(?:forex|currency|monetary policy|interest rate|central bank|foreign exchange)\b/i.test(title)||/\b(?:EUR|USD|GBP|JPY|CHF|INR|AUD|CAD|NZD)[/-](?:EUR|USD|GBP|JPY|CHF|INR|AUD|CAD|NZD)\b/.test(title);
  // Gold/silver-only reports never fall into critical minerals via "mining".
  const substantiveMineral=mineral&&(!precious||/\b(?:critical minerals?|rare[- ]earth|lithium|cobalt|copper|nickel|graphite|gallium|germanium)\b/i.test(title));
  if(!substantiveMineral&&!macro)continue;
  let url;try{url=new URL(clean(tag(chunk,'link'))||/<link\b[^>]*href=["']([^"']+)["']/i.exec(chunk)?.[1]);}catch{continue;}
  const host=new URL(spec.url).hostname;
  // Google URLs identify discovery only. Publisher feeds must own their links.
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||url.hostname!==host||url.pathname.length<8||seen.has(url.href))continue;
  const clock=clean(tag(chunk,'pubDate')||tag(chunk,'published'));
  const at=/(?:Z|GMT|UTC|[+-]\d\d:?\d\d)$/i.test(clock)?Date.parse(clock):NaN;
  if(!Number.isFinite(at)||at>now||now-at>72*3600000)continue;
  seen.add(url.href);
  for(const category of [...(substantiveMineral?['rare_earth']:[]),...(macro?['macro']:[])]){
   const row={category,title,article_url:url.href,source_url:spec.url,published_at:new Date(at).toISOString(),news_id:'news-'+createHash('sha256').update(category+'|'+url.href).digest('hex')};
   const signal=unverifiedWebsiteSignalFromOsint(row,now,actorActionNewsObservation);
   if(signal){if(category==='macro'&&precious)signal.topic=precious.name;result.push(signal);}
  }
 }
 return result;
}
export async function collectCriticalMineralsFastlane({now=Date.now(),fetchImpl=fetch,reusedCandidates=[],state={},macroNeedsFallback=false}={}){
 const cache=new Map(),checks=[],signals=[],cursors={...(state.mineral_cursors??{})};let requests=0;
 const read=spec=>{
  if(cache.has(spec.url))return cache.get(spec.url);
  const promise=(async()=>{
   const old=cursors[spec.id];
   if(old?.retry_after>now){checks.push({id:spec.id,state:'COOLDOWN',candidates:0});return {healthy:false,recent:false};}
   try{
    requests++;const data=await boundedMacroGet(spec.url,{fetchImpl,etag:old?.etag});
    if(data.notModified){checks.push({id:spec.id,state:'NOT_MODIFIED',candidates:0});return {healthy:true,recent:false};}
    const rows=parseSectorFeed(data.text,spec,now);signals.push(...rows);
    cursors[spec.id]={etag:data.etag,retry_after:0,checked_at:now};checks.push({id:spec.id,state:'OK',candidates:rows.length});
    return {healthy:true,recent:rows.some(s=>now-Date.parse(s.published_at)<=60*60000)};
   }catch(e){const denied=/ACCESS_DENIED|RATE_LIMITED/.test(e?.message);cursors[spec.id]={etag:null,retry_after:now+(denied?15:5)*60000,checked_at:now};checks.push({id:spec.id,state:denied?'ACCESS_DENIED':'UNAVAILABLE',candidates:0});return {healthy:false,recent:false};}
  })();cache.set(spec.url,promise);return promise;
 };
 const regions=await Promise.all(MINERALS_MESH.map(async group=>{
  const reused=reusedCandidates.filter(c=>group.shared.includes(c.sourceId));
  const primary=group.primary?await read(group.primary):{healthy:reused.length>0,recent:reused.some(c=>now-Date.parse(c.publishedAt)<=60*60000)};
  const fallback=!primary.healthy||!primary.recent?await read(group.fallback):null;
  return {region:group.region,primary_healthy:primary.healthy,recent_primary_release:primary.recent,fallback_attempted:fallback!==null,fallback_healthy:fallback?.healthy??false,publisher_region_is_event_country:false};
 }));
 // One worldwide substitute and one batched query, never 195 per-country searches.
 const worldwide=regions.some(r=>!r.primary_healthy&&!r.fallback_healthy)?await read(globalAlternative):null;
 for(const region of regions)region.global_substitute_healthy=Boolean(worldwide?.healthy);

 if(regions.some(r=>!r.recent_primary_release))await read(googleMinerals);
 if(macroNeedsFallback){await read(financialAlternative);await read(googleMacro);}
 if(requests>13)throw Error('MINERAL_FASTLANE_REQUEST_CAP_EXCEEDED');
 const unique=[...new Map(signals.map(s=>[s.id,s])).values()].sort((a,b)=>b.published_at.localeCompare(a.published_at));
 return {signals:['macro','rare_earth'].flatMap(category=>unique.filter(s=>s.category===category).slice(0,40)),cursors,checks,
  receipt:{schema:'geomacro.global-critical-minerals-fastlane.v1',category:'rare_earth',regional_groups:regions,source_checks:checks,upstream_requests:requests,shared_primary_candidates:reusedCandidates.filter(c=>c.category==='rare_earth').length,per_country_searches:0,google_is_original_verification:false,all_country_events_guaranteed:false,raw_content_persisted:false}};
}
