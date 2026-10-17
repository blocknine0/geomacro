/**
 * First-party BLS newsroom discovery WHEN RSS transport is separately denied.
 * Official original HTML is verified in memory before deriving a day-only
 * unscored macro news signal. RSS 403 never becomes a claimed RSS success.
 * No third-party proxy, raw article persistence, or fabricated release clock.
 */
const FAMILIES={
  cpi:{indexTitle:"Consumer Price Index",originalTitle:/Consumer Price Index (?:Summary|News Release)/iu},
  empsit:{indexTitle:"Employment Situation",originalTitle:/Employment Situation (?:Summary|News Release)/iu},
  ximpim:{indexTitle:"U.S. Import and Export Price Indexes",originalTitle:/U\.S\. Import and Export Price Indexes (?:summary|News Release)/iu},
} as const;
type Family=keyof typeof FAMILIES;
export type BlsNewsroomCandidate={
  family:Family;title:string;articleUrl:string;date:string;
};
const MONTHS=["January","February","March","April","May","June",
  "July","August","September","October","November","December"];
const FULL_MONTH=new RegExp("\\b("+MONTHS.join("|")+")\\s+(\\d{1,2}),\\s+(20\\d{2})\\b","iu");
function validDay(year:number,month:number,day:number,nowMs:number){
  const millis=Date.UTC(year,month-1,day);
  const check=new Date(millis);
  return Number.isFinite(millis)&&check.getUTCFullYear()===year&&
    check.getUTCMonth()===month-1&&check.getUTCDate()===day&&
    millis<=nowMs && nowMs-millis<=31*86400000
      ?check.toISOString().slice(0,10):null;
}
function indexDate(value:string,nowMs:number):string|null{
  const m=/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(20\d{2})\b/u.exec(value);
  return m?validDay(+m[3],+m[1],+m[2],nowMs):null;
}
const textOnly=(v:string)=>v.replace(/<[^>]*>/gu," ")
 .replace(/&(?:amp|nbsp|quot|#39);/giu," ").replace(/\s+/gu," ").trim();
/** BLS newsroom has a clearly labeled "Latest News Releases" section.
 * Never scan upcoming releases, old archives, site footer or unrelated links.
 */
export function discoverBlsNewsroomOriginals(html:string,nowMs:number):BlsNewsroomCandidate[]{
  if(typeof html!=="string"||new TextEncoder().encode(html).length>384*1024||
     !Number.isFinite(nowMs)||/<!ENTITY|<!DOCTYPE\s+[^>]*\[/iu.test(html))return [];
  const start=html.indexOf("Latest News Releases from the National Office");
  if(start<0)return [];
  const end=html.indexOf("Latest Publications",start);
  if(end<=start||end-start>16000)return [];
  const portion=html.slice(start,end),out:BlsNewsroomCandidate[]=[],seen=new Set<string>();
  for(const match of portion.matchAll(/<a\b[^>]*href=["']([^"']{1,280})["'][^>]*>([\s\S]{1,300}?)<\/a>/giu)){
    const raw=match[1].replace(/&amp;/giu,"&");
    let u:URL;
    try{u=new URL(raw,"https://www.bls.gov");}catch{continue;}
    if(u.protocol!=="https:"||u.hostname!=="www.bls.gov"||u.port||
       u.username||u.password||u.search||u.hash)continue;
    const m=/^\/news\.release\/(cpi|empsit|ximpim)\.toc\.htm$/u.exec(u.pathname);
    if(!m)continue;
    const family=m[1] as Family;
    if(textOnly(match[2]).toLowerCase()!==FAMILIES[family].indexTitle.toLowerCase())continue;
    const closeIndex=match.index+match[0].length;
    const next=textOnly(portion.slice(closeIndex,closeIndex+190));
    const date=indexDate(next,nowMs);
    if(!date||seen.has(family))continue;
    seen.add(family);
    out.push({family,title:FAMILIES[family].indexTitle,
      articleUrl:"https://www.bls.gov/news.release/"+family+".nr0.htm",
      date});
    if(out.length===3)break;
  }
  return out;
}
/** Require the BLS ORIGINAL news summary to match both the indexed family
 * AND the issuer's embargo/release calendar date. Metadata, last-modified,
 * URL, feed fetchedAt and upcoming calendar cannot create a publication.
 */
export function verifyBlsNewsroomOriginal(
  html:string,candidate:BlsNewsroomCandidate,nowMs:number,
):string|null{
  if(typeof html!=="string"||new TextEncoder().encode(html).length>384*1024||
     !Number.isFinite(nowMs)||!candidate||!(candidate.family in FAMILIES)||
     candidate.articleUrl!=="https://www.bls.gov/news.release/"+candidate.family+".nr0.htm"||
     !/^(?:20\d{2})-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u.test(candidate.date)||
     /<!ENTITY|<!DOCTYPE\s+[^>]*\[/iu.test(html))return null;
  const main=/<h1\b[^>]*>([\s\S]{1,250}?)<\/h1>/iu.exec(html);
  if(!main||!FAMILIES[candidate.family].originalTitle.test(textOnly(main[1])))return null;
  const plain=textOnly(html.slice(0,95*1024));
  const after=/Transmission of material in this release is embargoed until\s+([^]{0,240})/iu.exec(plain)?.[1];
  if(!after)return null;
  const original=FULL_MONTH.exec(after);
  if(!original)return null;
  const month=MONTHS.findIndex(x=>x.toLowerCase()===original[1].toLowerCase())+1;
  const day=validDay(+original[3],month,+original[2],nowMs);
  return day===candidate.date?day:null;
}
