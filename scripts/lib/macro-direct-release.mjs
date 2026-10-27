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
