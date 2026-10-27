import {boundedMacroGet} from './macro-fx-metals.mjs';
import {zonedRelease} from './macro-release-calendar.mjs';
import {verifiedPublisherPageDate} from './official-original-article-date.mjs';
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const clean=s=>s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
export function directReleaseSpec(event){
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:event.kind==='ecb_rates'?'Europe/Berlin':'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(event.at)).replace(/-/g,'');
 if(event.kind==='fomc')return {id:'fed_press',url:'https://www.federalreserve.gov/newsevents/pressreleases/monetary'+date+'a.htm',credit:'Federal Reserve Board'};
 const family={cpi:'cpi',ppi:'ppi',nfp:'empsit'}[event.kind];
 return family?{id:{cpi:'bls_cpi',ppi:'bls_ppi',nfp:'bls_employment'}[event.kind],url:'https://www.bls.gov/news.release/'+family+'.nr0.htm',credit:null}:null;
}
export function verifiedDirectRelease(html,spec,event,now){
 if(typeof html!=='string'||html.length>384*1024||/<!ENTITY/i.test(html))return null;
 const expected=spec.id==='fed_press'?/Federal Reserve issues FOMC statement/i:spec.id==='bls_cpi'?/consumer price index/i:spec.id==='bls_ppi'?/producer price index/i:/employment situation/i;
 const title=[...html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map(m=>clean(m[1])).find(t=>expected.test(t));
 if(!title)return null;
 let published=verifiedPublisherPageDate(html,new Date(now),null,{maxAgeMs:72*3600000});
 if(!published){
  const text=clean(html);
  if(spec.id==='fed_press'){
   const stamp=/\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (20\d{2})\b[\s\S]{0,450}?For release at (\d{1,2}):(\d\d) (a\.m\.|p\.m\.) (EDT|EST)/i.exec(text);
   if(stamp){const h=+stamp[4]%12+(stamp[6].toLowerCase()==='p.m.'?12:0);published=zonedRelease(+stamp[3],MONTHS.indexOf(stamp[1])+1,+stamp[2],h,+stamp[5],'America/New_York');}
  }else{
   const stamp=/embargoed until[\s\S]{0,100}?(\d{1,2}):(\d\d)\s*(a\.m\.|p\.m\.)\s*\(ET\)[\s\S]{0,100}?\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (20\d{2})/i.exec(text);
   if(stamp){const h=+stamp[1]%12+(stamp[3].toLowerCase()==='p.m.'?12:0);published=zonedRelease(+stamp[6],MONTHS.indexOf(stamp[4])+1,+stamp[5],h,+stamp[2],'America/New_York');}
  }
 }
 const at=Date.parse(published);
 // Actual article timestamp must agree with the official calendar. Merely
 // reaching the old mutable nr0 page at release time is not fresh evidence.
 if(!Number.isFinite(at)||at>now||Math.abs(at-Date.parse(event.at))>60000)return null;
 return {title,articleUrl:spec.url,publishedAt:new Date(at).toISOString(),sourceId:spec.id,category:'macro',credit:spec.credit};
}
export async function collectDirectReleaseCandidates(events,{now=Date.now(),fetchImpl=fetch,existing=[]}={}){
 const candidates=[],checks=[];let requests=0;
 for(const event of events.slice(0,4)){
  const spec=directReleaseSpec(event);if(!spec||existing.some(c=>c.sourceId===spec.id&&Math.abs(Date.parse(c.publishedAt)-Date.parse(event.at))<=60000))continue;
  if(now<Date.parse(event.at))continue;
  try{requests++;const page=await boundedMacroGet(spec.url,{fetchImpl,accept:'text/html'});const row=verifiedDirectRelease(page.text,spec,event,now);if(row)candidates.push(row);checks.push({id:spec.id,state:row?'ORIGINAL_PAGE_ACCEPTED':'ORIGINAL_PAGE_NOT_CURRENT'});}catch{checks.push({id:spec.id,state:'ORIGINAL_PAGE_UNAVAILABLE'});}
 }
 return {candidates,checks,requests};
}

/** Small fixed vocabulary for the minute Worker; expensive newsroom NLP stays
 * in the existing GitHub bundle. IDs are identical to the full derivation. */
export function deriveCriticalReleaseSignals(candidates,events,now){
 const kinds={fed_press:{kind:'fomc',actor:'Federal Reserve',subject:'FOMC policy statement',topic:'monetary policy'},ecb_press:{kind:'ecb_rates',actor:'European Central Bank',subject:'monetary policy release',topic:'monetary policy'},bls_cpi:{kind:'cpi',actor:'US Bureau of Labor Statistics',subject:'consumer price index release',topic:'inflation and prices'},bls_ppi:{kind:'ppi',actor:'US Bureau of Labor Statistics',subject:'producer price index release',topic:'inflation and prices'},bls_employment:{kind:'nfp',actor:'US Bureau of Labor Statistics',subject:'Employment Situation release',topic:'official economic statistics'}};
 const rows=[],seen=new Set();
 for(const candidate of candidates.slice(0,40)){
  const spec=kinds[candidate.sourceId],at=Date.parse(candidate.publishedAt);
  if(!spec||!Number.isFinite(at)||at>now||!events.some(e=>e.kind===spec.kind&&Math.abs(Date.parse(e.at)-at)<=60000))continue;
  const identity=candidate.sourceId+'|'+(candidate.sourceId.startsWith('bls_')?candidate.publishedAt:candidate.articleUrl);
  let hash=2166136261;for(let i=0;i<identity.length;i++){hash^=identity.charCodeAt(i);hash=Math.imul(hash,16777619);}
  const id='macro-'+(hash>>>0).toString(16).padStart(8,'0');if(seen.has(id))continue;seen.add(id);
  rows.push({id,category:'macro',title:'Geomacro finds '+spec.actor+': published '+spec.subject,
   what_changed:spec.actor+' published its '+spec.subject+'. The original release was observed; numerical values and changes require the underlying statement or statistical tables.',
   why_it_matters:'The release can inform monetary expectations, currency exposure and precious-metals analysis. Rate levels, consensus surprise and any market-price reaction require separate evidence.',
   topic:spec.topic,geography:null,development_type:'official update',published_at:new Date(at).toISOString(),date_precision:'exact',observed_release_count:1,sources_credited:candidate.credit?[candidate.credit]:[],status:'official_release_observed_unscored',same_event_corrob_verified:false,severity:null});
 }
 return rows;
}
