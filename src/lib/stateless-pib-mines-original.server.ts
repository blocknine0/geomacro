/**
 * First-party Indian Ministry of Mines original news releases. Publicly read
 * the PIB index, then obtain the ORIGINAL local (IST) publication time from
 * the independently fetched first-party release page. No raw title/body/URL
 * leaves the website source reader: only derived Geomacro cards are returned.
 */
import type { StatelessSourceCandidate } from "./stateless-intelligence-model";
import { STATELESS_LOOKBACK_MS } from "./stateless-intelligence-model";

const INDEX = "https://www.pib.gov.in/AllRelease.aspx?lang=1&reg=6";
const PAGE_BASE = "https://www.pib.gov.in/PressReleasePage.aspx?PRID=";
const MAX_INDEX = 1_800_000;
const MAX_PAGE = 750_000;
const MAX_PAGES = 6;
const MONTHS: Record<string, number> = {
  JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11,
};
function decodeEntities(x: string) {
  const ent: Record<string,string> = {amp:"&",quot:'"',apos:"'",lt:"<",gt:">",nbsp:" "};
  return x.replace(/&(?:amp|quot|apos|lt|gt|nbsp);/giu,m=>ent[m.slice(1,-1).toLowerCase()]??m)
    .replace(/&#([0-9]{1,7});/gu,(_,d)=>String.fromCodePoint(Math.min(0x10ffff,Number(d))))
    .replace(/<[^>]*>/gu," ").replace(/\s+/gu," ").trim();
}
async function readText(url: string, max: number): Promise<string|null> {
  try {
    const response=await fetch(url,{
      method:"GET",redirect:"follow",cache:"no-store",
      headers:{Accept:"text/html"},
      signal:AbortSignal.timeout(5_500),
    });
    // Some PIB pages redirect only to the same publisher for locale.
    const final=new URL(response.url);
    if(!response.ok || final.protocol!=="https:" ||
       final.hostname!=="www.pib.gov.in" ||
       !/^\/(?:AllRelease|PressReleasePage)\.aspx$/iu.test(final.pathname) ||
       !/^text\/html(?:;|$)/iu.test(response.headers.get("content-type")??""))
      return null;
    const length=Number(response.headers.get("content-length")??"0");
    if(length>max)return null;
    const reader=response.body?.getReader();
    if(!reader)return null;
    const chunks: Uint8Array[]=[];let size=0;
    try{
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        size+=value.byteLength;
        if(size>max)return null;
        chunks.push(value);
      }
      const buf=new Uint8Array(size);let off=0;
      for(const chunk of chunks){buf.set(chunk,off);off+=chunk.length;}
      return new TextDecoder("utf-8",{fatal:true}).decode(buf);
    }finally{await reader.cancel().catch(()=>undefined);}
  }catch{return null;}
}
export function pibOriginalIstMs(raw:string):number|null {
  const found=/\bPosted\s+On\s*:\s*(\d{1,2})\s+([A-Z]{3})\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s+by\s+PIB\b/iu.exec(raw);
  if(!found)return null;
  const day=Number(found[1]),month=MONTHS[found[2].toUpperCase()];
  const year=Number(found[3]),hour=Number(found[4]),minute=Number(found[5]);
  if(month===undefined||day<1||day>31||hour<1||hour>12||minute>59)return null;
  const utc=Date.UTC(year,month,day,(hour%12)+(found[6].toUpperCase()==="PM"?12:0),minute)-330*60_000;
  const actual=new Date(utc+330*60_000);
  return actual.getUTCFullYear()===year&&actual.getUTCMonth()===month&&actual.getUTCDate()===day?utc:null;
}
/** A ministry-scoped native index, not a speculative keyword crawl. */
export function pibMinesIndexCandidates(html:string,now=Date.now()) {
  if(!html || html.length>MAX_INDEX)return [];
  const heading=/<h[2-5]\b[^>]*>\s*Ministry\s+of\s+Mines\s*<\/h[2-5]>/iu.exec(html);
  if(!heading)return [];
  const tail=html.slice(heading.index+heading[0].length);
  const next=/<h[2-5]\b/iu.exec(tail);
  const section=tail.slice(0,next?.index??Math.min(80_000,tail.length));
  const found: {id:string;title:string}[]=[];
  const seen=new Set<string>();
  const links=/<a\b[^>]{0,1200}href\s*=\s*["']([^"']*(?:PressReleseDetail|PressReleaseDetail|PressReleasePage)\.aspx\?[^"']*PRID=(\d{5,10})[^"']*)["'][^>]*>([\s\S]{5,800}?)<\/a>/giu;
  for(const m of section.matchAll(links)){
    const id=m[2],title=decodeEntities(m[3]);
    if(seen.has(id)||title.length<20||title.length>270 ||
       !/\b(minerals?|mining|ores?|metals?|rare earth|commercialisation catalogue|technolog(?:y|ies))\b/iu.test(title))
      continue;
    const ctx=section.slice(m.index+m[0].length,m.index+m[0].length+170);
    const dt=/Posted\s+on\s*:\s*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/iu.exec(decodeEntities(ctx));
    if(!dt)continue;
    const month=MONTHS[dt[2].toUpperCase()];
    if(month===undefined)continue;
    const date=Date.UTC(Number(dt[3]),month,Number(dt[1]));
    if(!Number.isFinite(date)||date>now||now-date>STATELESS_LOOKBACK_MS)continue;
    seen.add(id);found.push({id,title});
    if(found.length>=MAX_PAGES)break;
  }
  return found;
}
export async function readPibMinesOriginalCandidates(now=Date.now()):Promise<{
  healthy:boolean;candidates:StatelessSourceCandidate[]; inspected:number;original_verified:number;
}> {
  const html=await readText(INDEX,MAX_INDEX);
  if(!html)return {healthy:false,candidates:[],inspected:0,original_verified:0};
  const found=pibMinesIndexCandidates(html,now);
  const candidates=(await Promise.all(found.map(async item=>{
    const articleUrl=PAGE_BASE+item.id;
    const page=await readText(articleUrl,MAX_PAGE);
    if(!page || !/\bMinistry\s+of\s+Mines\b/iu.test(decodeEntities(page).slice(0,20_000)))return null;
    const original=pibOriginalIstMs(decodeEntities(page));
    if(original===null||original>now||now-original>STATELESS_LOOKBACK_MS)return null;
    return {
      title:"India mineral research: "+item.title,
      articleUrl,
      publishedAt:new Date(original).toISOString(),
      sourceId:"in_pib_mines",category:"rare_earth" as const,credit:null,
    };
  }))).filter(row=>row!==null);
  return {healthy:true,candidates,inspected:found.length,original_verified:candidates.length};
}
