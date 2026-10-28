/** Shared Macro Economics fastlane. Bounded first-party news, separate quotes. */
export const MACRO_FASTLANE_REVISION=1;
export const MACRO_TOPICS=Object.freeze({
 gold:{name:'gold fundamentals and positioning',implication:'Gold demand, central-bank purchases, mine supply and futures positioning can affect bullion exposure. Observed prices and causal market effects require separate evidence.'},
 silver:{name:'silver industrial demand and supply',implication:'Silver industrial and solar demand, mining supply and futures positioning can affect precious-metals exposure. No price direction is inferred from a news release.'},
 bullion:{name:'precious metals market structure',implication:'Gold and silver benchmarks, exchange notices and positioning inform market structure. A benchmark or delayed quote is not a real-time spot price.'},
});
export function macroPreciousTopic(title){
 if(typeof title!=='string')return null;
 if(/\bsilver\b/i.test(title))return MACRO_TOPICS.silver;
 if(/\bgold\b/i.test(title)&&! /\bgold(?:en)? (?:medal|award|jubilee)\b/i.test(title))return MACRO_TOPICS.gold;
 if(/\b(?:bullion|precious metals?|COMEX|LBMA)\b/i.test(title))return MACRO_TOPICS.bullion;
 return null;
}
export function macroEventContext(signal){
 if(signal?.category!=='macro')return null;
 const text=signal.topic+' '+signal.title+' '+signal.what_changed;
 const metals=macroPreciousTopic(text);
 const broad=/monetary|inflation|employment|payroll|economic statistics|yields|foreign.exchange|currency/i.test(text);
 const instruments=metals?.name===MACRO_TOPICS.silver.name?['XAG/USD']:
  metals?.name===MACRO_TOPICS.gold.name?['XAU/USD']:
  metals?['XAU/USD','XAG/USD']:broad?['EUR/USD','USD/JPY','GBP/USD','USD/INR','XAU/USD','XAG/USD']:[];
 if(!instruments.length)return null;
 return {event_id:signal.id,parent_category:'macro',lanes:[...(instruments.some(x=>!x.startsWith('XA'))?['forex']:[]),...(instruments.some(x=>x.startsWith('XA'))?['precious_metals']:[])],related_instruments:instruments,
  consensus:null,surprise_vs_consensus:null,price_reaction:null,causal_price_impact_verified:false};
}
const s=(id,url,host,path,extra={})=>Object.freeze({id,category:'macro',media:'rss',url,host,path,credit:null,...extra});
export const MACRO_NEWS_SOURCES=Object.freeze([
 s('bls_cpi','https://www.bls.gov/feed/cpi.rss','www.bls.gov',/^\/news\.release\/(?:archives\/cpi_\d{8}|cpi\.nr\d+)\.htm$/u,{media:'atom',critical:true}),
 s('bls_employment','https://www.bls.gov/feed/empsit.rss','www.bls.gov',/^\/news\.release\/(?:archives\/empsit_\d{8}|empsit\.nr\d+)\.htm$/u,{media:'atom',critical:true}),
 s('bls_ppi','https://www.bls.gov/feed/ppi.rss','www.bls.gov',/^\/news\.release\/(?:archives\/ppi_\d{8}|ppi\.nr\d+)\.htm$/u,{media:'atom',critical:true}),
 s('fed_press','https://www.federalreserve.gov/feeds/press_all.xml','www.federalreserve.gov',/^\/newsevents\/pressreleases\/[a-z]+\d{8}[a-z]\.htm$/u,{critical:true,credit:'Federal Reserve Board',shared:true}),
 s('ecb_press','https://www.ecb.europa.eu/rss/press.html','www.ecb.europa.eu',/^\/press\/(?:pr|key|govcdec)\/[A-Za-z0-9_./~-]+\.en\.html$/u,{critical:true,credit:'European Central Bank',shared:true}),
 s('fed_speeches','https://www.federalreserve.gov/feeds/speeches.xml','www.federalreserve.gov',/^\/newsevents\/speech\/[a-z0-9]+\.htm$/u,{credit:'Federal Reserve Board',critical:true,official_communication:true}),
 s('boe_press','https://www.bankofengland.co.uk/rss/news','www.bankofengland.co.uk',/^\/(?:news|monetary-policy-summary-and-minutes)\/20\d{2}\/[a-z0-9/-]+$/u,{credit:'Bank of England'}),
 s('boj_press_global','https://www.boj.or.jp/en/rss/whatsnew.xml','www.boj.or.jp',/^\/en\/(?:about|announcements|mopo|statistics|research)\/[A-Za-z0-9_./-]+\.htm$/u,{credit:'Bank of Japan'}),
 s('snb_monetary','https://www.snb.ch/public/rss/en/mopo','www.snb.ch',/^\/en\/[A-Za-z0-9_./-]+$/u,{credit:'Swiss National Bank'}),
 s('rbi_press','https://www.rbi.org.in/pressreleases_rss.xml','www.rbi.org.in',/^\/Scripts\/BS_PressReleaseDisplay\.aspx$/iu,{credit:'Reserve Bank of India',rbi:true}),
 s('wgc_research','https://www.gold.org/goldhub/gold-focus','www.gold.org',/^\/goldhub\/(?:gold-focus\/20\d{2}\/\d{2}\/[a-z0-9-]+|research\/[a-z0-9/-]+)$/u,{media:'html',credit:'World Gold Council',periodic:true}),
 s('lbma_news','https://www.lbma.org.uk/articles','www.lbma.org.uk',/^\/articles\/[a-z0-9-]+$/u,{media:'html',credit:'LBMA',periodic:true}),
 s('cftc_news','https://www.cftc.gov/PressRoom/PressReleases/rss.xml','www.cftc.gov',/^\/PressRoom\/PressReleases\/[0-9-]+$/u,{credit:'Commodity Futures Trading Commission',periodic:true}),
 s('cme_news','https://investor.cmegroup.com/rss/news-releases.xml','investor.cmegroup.com',/^\/news-releases\/news-release-details\/[a-z0-9-]+$/u,{credit:'CME Group',periodic:true}),
 s('silver_institute','https://silverinstitute.org/feed/','silverinstitute.org',/^\/[a-z0-9]+(?:-[a-z0-9]+){2,}\/$/u,{credit:'The Silver Institute',periodic:true}),
]);
// Five-minute primary pool shares Fed/ECB reads with the existing collector.
// Three rotating secondary slots; every secondary is visited within 15 minutes.
export function planMacroSources(now,{release=false,reusedIds=[]}={}){
 if(!Number.isFinite(now))throw Error('MACRO_CLOCK_INVALID');
 const reused=new Set(reusedIds);
 const critical=MACRO_NEWS_SOURCES.filter(x=>x.critical&&!reused.has(x.id));
 if(release)return critical;
 const secondary=MACRO_NEWS_SOURCES.filter(x=>!x.critical);
 const slot=Math.floor(now/300000);
 if(critical.length>9)throw Error('MACRO_SOURCE_BUDGET_EXCEEDED');
 const width=Math.min(4,9-critical.length);
 const selected=Array.from({length:width},(_,i)=>secondary[(slot*width+i)%secondary.length]);
 return [...critical,...selected.filter(x=>!reused.has(x.id))];
}
export function pinnedMacroArticle(raw,spec){
 try{
  let value=String(raw).trim();
  if(spec.id==='boj_press_global')value=value.replace(/^http:\/\/www\.boj\.or\.jp\//,'https://www.boj.or.jp/');
  if(spec.rbi)value=value.replace(/^http:\/\/(?:www\.)?rbi\.org\.in\//i,'https://www.rbi.org.in/').replace(/^https:\/\/rbi\.org\.in\//i,'https://www.rbi.org.in/');
  if(spec.id==='ecb_press')value=value.replace('eu//press/','eu/press/');
  const u=new URL(value,spec.url);
  if(u.protocol!=='https:'||u.hostname!==spec.host||u.username||u.password||u.port||u.hash||!spec.path.test(u.pathname))return null;
  if(spec.rbi){const p=[...u.searchParams];if(p.length!==1||p[0][0].toLowerCase()!=='prid'||!/^\d{3,10}$/.test(p[0][1]))return null;}
  else if(u.search)return null;
  return u.href;
 }catch{return null;}
}
export const PRICE_MAX_AGE_MS=5*60000;
export function normalizeMetalQuote(doc,symbol,now){
 const at=typeof doc?.updatedAt==='string'&&/Z$/.test(doc.updatedAt)?Date.parse(doc.updatedAt):NaN;
 if(!['XAU','XAG'].includes(symbol)||doc?.symbol!==symbol||doc.currency!=='USD'||typeof doc.price!=='number'||!Number.isFinite(doc.price)||doc.price<=0||!Number.isFinite(at)||at>now||now-at>PRICE_MAX_AGE_MS)return null;
 return {instrument:symbol+'/USD',value:doc.price,currency:'USD',unit:'troy_ounce',observed_at:new Date(at).toISOString(),received_at:new Date(now).toISOString(),quote_kind:'provider_spot_indication',provider_latency_verified:false,exchange_tick_verified:false};
}
export function measuredPriceReaction(eventAt,before,after){
 const event=Date.parse(eventAt),a=Date.parse(before?.observed_at),b=Date.parse(after?.observed_at);
 if(!Number.isFinite(event)||!Number.isFinite(a)||!Number.isFinite(b)||before.instrument!==after.instrument||before.quote_kind!==after.quote_kind||before.currency!==after.currency||before.unit!==after.unit||a>event||b<event||b<=a||event-a>PRICE_MAX_AGE_MS||b-event>PRICE_MAX_AGE_MS||!Number.isFinite(before.value)||before.value<=0||!Number.isFinite(after.value)||after.value<=0)return null;
 return {instrument:after.instrument,before_at:before.observed_at,after_at:after.observed_at,change_pct:(after.value/before.value-1)*100,caused_by_event_verified:false};
}
export async function boundedMacroGet(url,{fetchImpl=fetch,accept='application/xml,text/xml,application/rss+xml',etag=null}={}){
 const headers={Accept:accept};if(etag)headers['If-None-Match']=etag;
 const res=await fetchImpl(url,{redirect:'error',headers,signal:AbortSignal.timeout(8000)});
 if(res.redirected)throw Error('REDIRECT');
 if(res.status===304)return {notModified:true,etag,text:null};
 if(!res.ok){try{await res.body?.cancel()}catch{}throw Error(res.status===429?'RATE_LIMITED':res.status===403?'ACCESS_DENIED':'HTTP_'+res.status);}
 const limit=384*1024;if(Number(res.headers.get('content-length')??0)>limit)throw Error('OVERSIZE');
 const reader=res.body?.getReader();if(!reader)throw Error('BODY_MISSING');
 let size=0;const parts=[];
 try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>limit)throw Error('OVERSIZE');parts.push(r.value);}}finally{try{await reader.cancel()}catch{}reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
 return {text:new TextDecoder('utf-8',{fatal:true}).decode(bytes),etag:res.headers.get('etag')?.slice(0,200)??null};
}
/** Fill each existing 64 KiB ingress request as far as row and UTF-8 limits allow. */
export function packDerivedNewsBatches(signals,maxRows=50,maxBytes=60*1024){
 if(!Array.isArray(signals)||!Number.isSafeInteger(maxRows)||maxRows<1||maxRows>50||!Number.isSafeInteger(maxBytes)||maxBytes<1000||maxBytes>64*1024)throw Error('NEWS_BATCH_BUDGET_INVALID');
 const encoder=new TextEncoder();
 const overhead=encoder.encode(JSON.stringify({schema:'geomacro.website-derived-news-batch.v1',signals:[]})).byteLength;
 const batches=[];let batch=[],bytes=overhead;
 for(const signal of signals){
  const size=encoder.encode(JSON.stringify(signal)).byteLength;
  if(size+overhead>maxBytes)throw Error('NEWS_SIGNAL_EXCEEDS_BYTE_BUDGET');
  if(batch.length&&(batch.length===maxRows||bytes+size+1>maxBytes)){batches.push(batch);batch=[];bytes=overhead;}
  bytes+=size+(batch.length?1:0);batch.push(signal);
 }
 if(batch.length)batches.push(batch);return batches;
}
