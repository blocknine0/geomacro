/**
 * GeoMacro-only, free first-party DOE Critical Minerals landing-page fallback.
 * A landing-page date is NEVER enough: independently fetch the same-host
 * linked originating DOE article and require matching headline + source day.
 * Source-native day precision must age 36 hours before use, never fetch time.
 * No user/source URLs, raw headline, inferred rights or signed risk object
 * is emitted by the public derived-news projection.
 */
import {selectOfficialTopic,type StatelessSourceCandidate}
  from "./stateless-intelligence-model";

const ORIGIN="https://www.energy.gov";
const INDEX="https://www.energy.gov/cmm/critical-minerals-and-materials-program";
const ORIGINAL=/^\/(?:[a-z0-9-]+\/)?articles\/[a-z0-9][a-z0-9-]{12,225}$/u;
const ANCHOR=/<a\b[^>]{0,800}href\s*=\s*["']([^"'<>]{1,450})["'][^>]{0,800}>([\s\S]{8,600}?)<\/a>/giu;
const DATE=/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+([1-9]|[12]\d|3[01]),?\s+(20\d{2})\b/iu;
const MONTHS=["january","february","march","april","may","june","july",
  "august","september","october","november","december"];
const clean=(s:string)=>s.replace(/<[^>]*>/gu," ").replace(
  /&(?:amp|quot|apos|#39|nbsp);/giu,m=>({
    "&amp;":"&","&quot;":'"',"&apos;":"'","&#39;":"'","&nbsp;":" "
  }[m.toLowerCase()]??m)).replace(/\s+/gu," ").trim();
const words=(s:string)=>new Set(clean(s).toLowerCase().match(/[a-z]{4,}/gu)??[]);
export function pinnedDoeMineralsArticle(value:string):string|null{
  try{
    const u=new URL(value,INDEX);
    if(u.origin!==ORIGIN||u.username||u.password||u.port||
       u.search||u.hash||u.pathname.includes("//")||
       /%(?:2e|2f|5c)/iu.test(u.pathname)||!ORIGINAL.test(u.pathname))
      return null;
    return u.href;
  }catch{return null}
}
function publisherDay(value:string):string|null{
  const m=DATE.exec(clean(value));
  if(!m)return null;
  const month=MONTHS.indexOf(m[1].toLowerCase()),day=Number(m[2]),year=Number(m[3]);
  const at=Date.UTC(year,month,day);
  if(month<0||!Number.isFinite(at)||new Date(at).getUTCDate()!==day||
     new Date(at).getUTCMonth()!==month)return null;
  return new Date(at).toISOString().slice(0,10);
}
export function doeMineralsIndexCandidates(html:string,now=Date.now()):StatelessSourceCandidate[]{
  if(typeof html!=="string"||html.length>512*1024||!Number.isFinite(now)||
     /<!DOCTYPE\s+[^>]*\[/iu.test(html))return [];
  const out:StatelessSourceCandidate[]=[],seen=new Set<string>();
  let inspected=0;
  for(const match of html.matchAll(ANCHOR)){
    const articleUrl=pinnedDoeMineralsArticle(match[1]);
    if(!articleUrl)continue;
    if(++inspected>35)break;
    const title=clean(match[2]);
    if(title.length<25||title.length>240||
       !selectOfficialTopic(title,"rare_earth")||seen.has(articleUrl))continue;
    // DOE lists a card title and its date on the same bounded landing section.
    // Do not borrow another card's date or a page's generic last-modified time.
    const next=html.slice(match.index!+match[0].length,
      match.index!+match[0].length+260);
    const endOfCard=next.search(/<(?:h[2-6]|article)\b|<a\b/iu);
    const bounded=endOfCard<0?next:next.slice(0,endOfCard);
    const dates=[...bounded.matchAll(new RegExp(DATE.source,"giu"))];
    if(dates.length!==1)continue;
    const publishedAt=publisherDay(dates[0][0]);
    if(!publishedAt)continue;
    const age=now-Date.parse(publishedAt+"T00:00:00.000Z");
    // Day-only sources: maintain existing 36-hour conservative uncertainty
    // and absolute 72h freshness horizon. Never use the crawl clock.
    if(age<36*3_600_000||age>72*3_600_000)continue;
    seen.add(articleUrl);
    out.push({sourceId:"us_doe_cmei_minerals_index",category:"rare_earth",
      articleUrl,title,publishedAt,datePrecision:"day",
      credit:"U.S. Department of Energy"});
    if(out.length===2)break;
  }
  return out;
}
export function doeMineralsOriginalArticleMatches(
  html:string,original:StatelessSourceCandidate,
):boolean{
  if(typeof html!=="string"||html.length>256*1024||
     original.sourceId!=="us_doe_cmei_minerals_index"||
     original.category!=="rare_earth"||
     !pinnedDoeMineralsArticle(original.articleUrl))return false;
  const h1=/<h1\b[^>]{0,600}>([\s\S]{8,900}?)<\/h1>/iu.exec(html);
  if(!h1)return false;
  const titleWords=words(original.title),articleWords=words(h1[1]);
  if(titleWords.size<5||[...titleWords].filter(x=>articleWords.has(x)).length<
     Math.min(5,titleWords.size))return false;
  // Require article-owned first-party visible release day; do not trust
  // calendar dates from unrelated sidebar/news cards.
  const vicinity=html.slice(Math.max(0,h1.index-400),h1.index+h1[0].length+1800);
  const nativeDay=publisherDay(vicinity);
  return nativeDay!==null&&nativeDay===original.publishedAt;
}
