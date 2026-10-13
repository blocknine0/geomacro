/**
 * Official first-party Australian geoscience NEWS releases only.
 * Treat the publisher's dated news-index entry as the original day, NOT
 * article page "last updated", crawl time, or publication date guessed
 * from an article URL. Require independently fetched same-host article H1.
 * No storage, source IDs, URLs, raw headlines or bodies in public output.
 */
import {
  selectOfficialTopic, type StatelessSourceCandidate,
} from "./stateless-intelligence-model";

const MONTH: Readonly<Record<string,number>>={
  january:1,february:2,march:3,april:4,may:5,june:6,
  july:7,august:8,september:9,october:10,november:11,december:12,
};
const ORIGINAL_DATE=/\b([1-9]|[12]\d|3[01])\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/iu;
const HEADLINE=/<h3\b[^>]{0,500}>([\s\S]{1,550}?)<\/h3>/giu;
const ARTICLE_TITLE=/<h1\b[^>]{0,600}>([\s\S]{1,950}?)<\/h1>/iu;
const ARTICLE_PATH=/^\/news\/[a-z0-9][a-z0-9-]{18,195}$/u;

function words(input:string):Set<string>{
  const untagged=input.replace(/<[^>]*>/gu," ").replace(/&(?:amp|quot|apos|#39|nbsp);/giu," ").replace(/\s+/gu," ").toLowerCase();
  return new Set(untagged.match(/[a-z]{5,}/gu)??[]);
}
function plain(input:string):string {
  return input.replace(/<[^>]*>/gu," ")
    .replace(/&(?:amp|quot|apos|#39|nbsp);/giu,m=>({
      "&amp;":"&","&quot;":'"',"&apos;":"'","&#39;":"'","&nbsp;":" "
    }[m.toLowerCase()]??m))
    .replace(/\s+/gu," ").trim();
}
function officialArticleLink(href:string):string|null {
  try {
    const u=new URL(href,"https://www.ga.gov.au/news");
    if(u.protocol!=="https:"||u.hostname!=="www.ga.gov.au"||
       u.username||u.password||u.port||u.search||u.hash||
       !ARTICLE_PATH.test(u.pathname))return null;
    return u.href;
  }catch{return null}
}
export function australianNewsIndexCandidates(html:string,now=Date.now()):StatelessSourceCandidate[]{
  if(typeof html!=="string"||html.length>512*1024||!Number.isFinite(now)||
     /<!DOCTYPE\s+[^>]*\[/iu.test(html))return[];
  const candidates:StatelessSourceCandidate[]=[];
  const seen=new Set<string>();
  const heads=[...html.matchAll(HEADLINE)].slice(0,65);
  for(let i=0;i<heads.length&&candidates.length<6;i++){
    const head=heads[i],title=plain(head[1]);
    if(title.length<12||title.length>300||/[<>]/u.test(title)||
       !selectOfficialTopic(title,"rare_earth"))continue;
    const end=Math.min(html.length,heads[i+1]?.index??html.length,head.index!+3000);
    const card=html.slice(head.index!+head[0].length,end);
    const date=ORIGINAL_DATE.exec(card.slice(0,1500));
    if(!date)continue;
    const day=Number(date[1]),month=MONTH[date[2].toLowerCase()],year=Number(date[3]);
    const ms=Date.UTC(year,month-1,day);
    if(!Number.isFinite(ms)||new Date(ms).getUTCDate()!==day||
       now-ms>30*86400000||ms>now)continue;
    // The source's original release-index day MUST precede the item's
    // actual "Learn more" link, within this same bounded dated news card.
    const links=[...card.matchAll(/<a\b[^>]{0,1200}href\s*=\s*["']([^"']{1,500})["'][^>]*>/giu)];
    const link=links.map(m=>officialArticleLink(m[1])).find((x):x is string=>!!x);
    if(!link||seen.has(link))continue;
    const slug=new Set(new URL(link).pathname.split("/").at(-1)!.split("-").filter(x=>x.length>4));
    if([...words(title)].filter(x=>slug.has(x)).length<3)continue;
    seen.add(link);
    candidates.push({sourceId:"au_geoscience",category:"rare_earth",
      title,articleUrl:link,publishedAt:new Date(ms).toISOString().slice(0,10),
      datePrecision:"day",credit:null});
  }
  return candidates;
}
export function australianArticleMatchesOriginal(html:string,title:string):boolean {
  if(typeof html!=="string"||html.length>256*1024||title.length>300)return false;
  const found=ARTICLE_TITLE.exec(html);
  if(!found)return false;
  const articleWords=words(found[1]),originalWords=words(title);
  const matched=[...originalWords].filter(x=>articleWords.has(x)).length;
  return matched>=Math.min(5,originalWords.size) && originalWords.size>=4;
}
