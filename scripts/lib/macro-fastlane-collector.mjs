import {MACRO_NEWS_SOURCES,planMacroSources,pinnedMacroArticle,boundedMacroGet,normalizeMetalQuote,macroPreciousTopic} from './macro-fx-metals.mjs';
import {MACRO_CALENDARS,parseMacroCalendar} from './macro-release-calendar.mjs';
import {verifiedPublisherPageDate} from './official-original-article-date.mjs';
const clean=s=>String(s??'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/\s+/g,' ').trim();
const tag=(s,name)=>new RegExp('<(?:atom:)?'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:atom:)?'+name+'>','i').exec(s)?.[1]??'';
const relevant=t=>macroPreciousTopic(t)||/\b(?:monetary|interest rates?|policy rates?|federal funds|FOMC|repo|inflation|consumer price|producer price|employment|payroll|foreign exchange|currency|exchange rate|financial stability|liquidity|balance of payments|reserve assets?|gold reserves?|manufacturing|industrial demand|solar demand|positioning|commitments of traders)\b/i.test(t);
export function parseMacroFeed(xml,spec,now){
 if(typeof xml!=='string'||xml.length>384*1024||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('FEED_SHAPE_INVALID');
 if(spec.media==='atom'?!/<(?:atom:)?feed(?:\s|>)/i.test(xml):!/<rss(?:\s|>)/i.test(xml))throw Error('FEED_SHAPE_INVALID');
 const pattern=spec.media==='atom'?/<(?:atom:)?entry(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?entry>/gi:/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
 const rows=[],seen=new Set();
 for(const [,item]of [...xml.matchAll(pattern)].slice(0,75)){
  const title=clean(tag(item,'title'));if(title.length<12||title.length>300||!relevant(title))continue;
  const rawLink=spec.media==='atom'?/<(?:atom:)?link\b[^>]*href=["']([^"']+)["']/i.exec(item)?.[1]:clean(tag(item,'link'));
  const articleUrl=pinnedMacroArticle(rawLink,spec);if(!articleUrl||seen.has(articleUrl))continue;
  const clock=clean(spec.id==='snb_monetary'?tag(item,'dc:date'):tag(item,spec.media==='atom'?'published':'pubDate'));
  const at=/(?:Z|[+-]\d\d:?\d\d|GMT|UTC)$/i.test(clock)?Date.parse(clock):NaN;
  if(!Number.isFinite(at)||at>now||now-at>72*3600000)continue;
  seen.add(articleUrl);rows.push({title,description:clean(tag(item,spec.media==='atom'?'summary':'description')).slice(0,1000),articleUrl,publishedAt:new Date(at).toISOString(),sourceId:spec.id,category:'macro',credit:spec.credit});
 }
 return rows;
}
export function macroIndexLeads(html,spec){
 if(typeof html!=='string'||html.length>384*1024||/<!ENTITY/i.test(html))return [];
 const leads=[],seen=new Set();
 for(const [,link,title]of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  const articleUrl=pinnedMacroArticle(link,spec),name=clean(title);
  if(!articleUrl||seen.has(articleUrl)||name.length<12||name.length>300||!relevant(name))continue;
  seen.add(articleUrl);leads.push({articleUrl,title:name});if(leads.length===2)break;
 }
 return leads;
}
export async function collectMacroFastlane({now=Date.now(),fetchImpl=fetch,state={},reusedCandidates=[],reusedIds=[],sourceIds=null,release=false,prices=true,calendars=true}={}){
 const sources=sourceIds?MACRO_NEWS_SOURCES.filter(s=>sourceIds.includes(s.id)):planMacroSources(now,{release,reusedIds});
 if(sources.length>9)throw Error('MACRO_SOURCE_BUDGET_EXCEEDED');
 const candidates=[...reusedCandidates.filter(x=>x.category==='macro')],checks=[],cursors={...state.cursors};let requests=0;
 const get=async(url,options={})=>{requests++;return boundedMacroGet(url,{fetchImpl,...options});};
 // Serialize the three BLS feeds: the issuer throttles parallel reads.
 const read=async spec=>{
  const old=state.cursors?.[spec.id];
  // Persisted cooldowns prevent repeated 403/429 costs. Critical release
  // windows can retry denied transport once per five minutes, never each second.
  if(old?.retry_after>now){checks.push({id:spec.id,state:'COOLDOWN',candidates:0});return;}
  try{
   const data=await get(spec.url,{accept:spec.media==='html'?'text/html':'application/atom+xml,application/rss+xml,application/xml,text/xml',etag:old?.etag});
   if(data.notModified){checks.push({id:spec.id,state:'NOT_MODIFIED',candidates:0});return;}
   let rows=[];
   if(spec.media==='html'){
    for(const lead of macroIndexLeads(data.text,spec)){
     try{
      const page=await get(lead.articleUrl,{accept:'text/html'});
      const h1=clean(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(page.text)?.[1]);
      const date=verifiedPublisherPageDate(page.text,new Date(now),null,{maxAgeMs:72*3600000});
      if(date&&h1===lead.title)rows.push({...lead,publishedAt:date,sourceId:spec.id,category:'macro',credit:spec.credit});
     }catch{/* a failed original never becomes a verified article */}
    }
   }else rows=parseMacroFeed(data.text,spec,now);
   candidates.push(...rows);cursors[spec.id]={etag:data.etag,retry_after:0,checked_at:now};
   checks.push({id:spec.id,state:'OK',candidates:rows.length});
  }catch(e){
   const reason=/^(?:ACCESS_DENIED|RATE_LIMITED|HTTP_\d+|OVERSIZE|REDIRECT|FEED_SHAPE_INVALID)$/.test(e?.message)?e.message:'UNAVAILABLE';
   cursors[spec.id]={etag:null,retry_after:now+(/ACCESS_DENIED|RATE_LIMITED/.test(reason)?15:5)*60000,checked_at:now};
   checks.push({id:spec.id,state:reason,candidates:0});
  }
 };
 await Promise.all(sources.filter(s=>!s.id.startsWith('bls_')).map(read));
 for(const source of sources.filter(s=>s.id.startsWith('bls_')))await read(source);
 const quotes=[],priceChecks=[];
 if(prices)await Promise.all(['XAU','XAG'].map(async symbol=>{
  try{const data=await get('https://api.gold-api.com/price/'+symbol,{accept:'application/json'});const quote=normalizeMetalQuote(JSON.parse(data.text),symbol,now);if(quote)quotes.push(quote);priceChecks.push({instrument:symbol+'/USD',state:quote?'CURRENT_INDICATION':'STALE_OR_INVALID'});}catch{priceChecks.push({instrument:symbol+'/USD',state:'UNAVAILABLE'});}
 }));
 let events=Array.isArray(state.events)?state.events:[];const calendarChecks=[];
 if(calendars&&(!Number.isFinite(state.calendar_checked_at)||now-state.calendar_checked_at>=6*3600000)){
  const merged=[];
  await Promise.all(MACRO_CALENDARS.map(async spec=>{
   try{const result=await get(spec.url,{accept:spec.id==='bls'?'text/calendar':'text/html'});const rows=parseMacroCalendar(spec.id,result.text,now);if(!rows.length)throw Error('EMPTY');merged.push(...rows);calendarChecks.push({id:spec.id,state:'OK',events:rows.length});}
   catch{merged.push(...events.filter(e=>e.source===spec.id));calendarChecks.push({id:spec.id,state:'UNAVAILABLE',events:0});}
  }));
  events=merged.filter(e=>Date.parse(e.at)>=now-3600000).sort((a,b)=>a.at.localeCompare(b.at)).slice(0,128);
 }
 const history=[...(state.quotes??[]),...quotes].filter(q=>Date.parse(q.observed_at)>=now-90*60000&&Date.parse(q.observed_at)<=now);
 const uniqueQuotes=[...new Map(history.map(q=>[q.instrument+'|'+q.observed_at,q])).values()].slice(-40);
 const sourceChecks=[...new Map([...(state.source_checks??[]),...checks].map(c=>[c.id,c])).values()];
 return {candidates,state:{mineral_cursors:state.mineral_cursors??{},mineral_checks:state.mineral_checks??[],...(state.mineral_regions?.length?{mineral_regions:state.mineral_regions}:{}),schema:'geomacro.macro-fastlane-state.v1',checked_at:new Date(now).toISOString(),cursors,events,quotes:uniqueQuotes,
  calendar_checked_at:calendarChecks.length?now:state.calendar_checked_at??0,calendar_checks:calendarChecks.length?calendarChecks:state.calendar_checks??[],source_checks:sourceChecks,price_checks:priceChecks,
  quota_lease_until:new Date(now+12*60000).toISOString()},receipt:{schema:'geomacro.macro-fastlane-run.v1',category:'macro',lanes:['forex','precious_metals'],source_checks:sourceChecks,price_checks:priceChecks,calendar_checks:calendarChecks,upstream_requests:requests,shared_originals:reusedCandidates.length,raw_content_persisted:false,real_time_price_latency_verified:false,github_cron_sla_verified:false}};
}
