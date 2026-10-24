import {visiblePublisherText} from "./stateless-publisher-text";
import {verifiedPublisherPageDate} from "../../scripts/lib/official-original-article-date.mjs";
/**
 * Original first-publication day from exact Canada.ca government NEWS article.
 * Never infer from feed updated, dateModified, crawl time, URL year/month.
 * The first-party page heading must match the previously accepted feed title.
 * No article body, raw publisher title or URL survives the request.
 */
const ARTICLE=/^\/en\/(natural-resources-canada|global-affairs)\/news\/(20\d{2})\/(0[1-9]|1[0-2])\/[a-z0-9-]+\.html$/u;
function attr(tag: string, name: string): string | null {
  const m = new RegExp("\\b"+name.replace(/[^a-z0-9]/giu,"\\$&")+"\\s*=\\s*[\"']([^\"']{1,400})[\"']","iu").exec(tag);
  return m?.[1]??null;
}
function words(value: string): Set<string> {
  return new Set(value.replace(/<[^>]*>/gu," ").replace(/&(?:amp|quot|apos);/giu," ")
    .toLowerCase().match(/[a-z]{5,}/gu)??[]);
}
export function canadaOriginalPublicationDay(
  html: string, articleUrl: string, originalTitle: string, now=Date.now(),
  note?: (stage: "title_ok" | "clock_found" | "clock_consistent" | "date_path_ok" |
    "calendar_ok" | "not_future" | "within_30d") => void,
): string | null {
  if(typeof html!=="string"||html.length>384*1024||
     typeof originalTitle!=="string"||originalTitle.length>300||
     !Number.isFinite(now))return null;
  let u:URL;
  try{u=new URL(articleUrl)}catch{return null}
  const path=ARTICLE.exec(u.pathname);
  if(u.protocol!=="https:"||u.hostname!=="www.canada.ca"||
     u.username||u.password||u.port||u.search||u.hash||!path)return null;
  const h1=/<h1\b[^>]*>([\s\S]{1,1200}?)<\/h1>/iu.exec(html)?.[1]??"";
  const pageWords=words(h1),titleWords=words(originalTitle);
  if([...titleWords].filter(w=>pageWords.has(w)).length<2)return null;
  note?.("title_ok");

  const originalDates:string[]=[];
  for(const tag of html.match(/<meta\b[^>]*>/giu)??[]){
    const name=(attr(tag,"name")??attr(tag,"property")??attr(tag,"itemprop")??"").toLowerCase();
    if(!["dcterms.issued","article:published_time","datepublished"].includes(name))continue;
    const value=attr(tag,"content");
    if(value){
      if(!/^20\d{2}-\d{2}-\d{2}(?:$|T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$)/u.test(value))return null;
      if(value.length>10&&!Number.isFinite(Date.parse(value)))return null;
      originalDates.push(value.slice(0,10));
    }
  }
  // Some official pages publish a schema.org NewsArticle original issuance
  // clock instead of dcterms.issued. Use only the explicit datePublished,
  // *never* dateModified, after verifying the same original headline.
  for(const chunk of html.matchAll(/<script\b([^>]{0,450})>([\s\S]{1,12000}?)<\/script>/giu)){
    if(!/\btype\s*=\s*["']application\/ld\+json["']/iu.test(chunk[1]))continue;
    try{
      const root=JSON.parse(chunk[2]);
      const nodes=[root,...(Array.isArray(root)?root:[]),
        ...(root && typeof root==="object" && Array.isArray(root["@graph"])?root["@graph"]:[])];
      for(const item of nodes){
        if(!item || typeof item!=="object" || Array.isArray(item))continue;
        const kind=item["@type"];
        const types=Array.isArray(kind)?kind:[kind];
        if(!types.includes("NewsArticle")&&!types.includes("Article"))continue;
        if(typeof item.headline!=="string" ||
           [...titleWords].filter(w=>words(item.headline).has(w)).length<2)continue;
        if(typeof item.datePublished==="string" &&
           /^20\d{2}-\d{2}-\d{2}(?:T|$)/u.test(item.datePublished))
          originalDates.push(item.datePublished.slice(0,10));
      }
    }catch{ /* Unparsable first-party metadata does not substitute fetch time. */ }
  }
  for(const match of html.matchAll(/<time\b([^>]*)>([^<]{1,130})<\/time>/giu)){
    if((attr(match[1],"property")??"").toLowerCase()!=="datepublished")continue;
    const value=attr(match[1],"datetime")??match[2].trim();
    if(/^\d{4}-\d{2}-\d{2}/u.test(value))originalDates.push(value.slice(0,10));
  }
  if(!originalDates.length)return null;
  note?.("clock_found");
  if(new Set(originalDates).size!==1)return null;
  note?.("clock_consistent");
  const day=originalDates[0];
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(day)||day.slice(0,4)!==path[2]||
     day.slice(5,7)!==path[3])return null;
  note?.("date_path_ok");
  const ms=Date.parse(day+"T00:00:00.000Z");
  if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==day)return null;
  note?.("calendar_ok");
  if(ms>now)return null;
  note?.("not_future");
  if(ms<now-30*86_400_000)return null;
  note?.("within_30d");
  return day;
}

/** Optional SAME-PAGE precision upgrade. This is only possible after
 * canadaOriginalPublicationDay has validated publisher URL, heading, and
 * issuer-native first issue day. Strict original datePublished metadata
 * must establish an exact hour WITHIN the approved 22h verification window.
 * Day-only dates, dateModified, conflicting clocks and future UTC remain day.
 * This carries no source rights, review signature or score.
 */
export function canadaOriginalPrecisePublicationTime(
  html:string,verifiedDay:string,now=Date.now(),
):string|null {
  if(typeof html!=="string"||!/^20\\d{2}-\\d{2}-\\d{2}$/u.test(verifiedDay)||
     !Number.isFinite(now))return null;
  const precise=verifiedPublisherPageDate(html,new Date(now),null,{
    maxAgeMs:22*60*60_000,
  });
  // Both issuer-native day and independently read precise first-publication
  // metadata must agree. Do not substitute noon or local-crawl time.
  return precise&&precise.slice(0,10)===verifiedDay?precise:null;
}

/** Private, finite topic from the SAME original article, never navigation,
 * footer, related links or feed summary. Original date/title checks remain
 * mandatory. No raw paragraph survives this function; no event outcome,
 * economic impact or commercial entitlement is established. */
export function canadaOriginalMineralsTopic(
  html:string,articleUrl:string,originalTitle:string,now=Date.now(),
):"critical-minerals policy"|"mineral exploration and production"|null {
  if(!articleUrl.startsWith("https://www.canada.ca/en/natural-resources-canada/news/")||
     !canadaOriginalPublicationDay(html,articleUrl,originalTitle,now))return null;
  const main=/<main\b[^>]*>([\s\S]*?)<\/main>/iu.exec(html)?.[1]??"";
  const start=/<div\b[^>]*\bid=["']news-release-container["'][^>]*>/iu.exec(main);
  if(!start)return null;
  const body=main.slice(start.index+start[0].length).split(/<div\b[^>]*\bclass=["']news-tags\b/iu)[0];
  // Tokenize rather than removing HTML blocks with regex. In particular,
  // HTML permits closing tags such as </script >; hidden paragraphs must
  // never become minerals evidence. Nothing here is an HTML sanitizer.
  const hidden:string[]=[];
  let paragraph:string[]|null=null;
  for(const token of body.match(/<[^>]*>|[^<]+/gu)??[]){
    if(!token.startsWith("<")){
      if(!hidden.length&&paragraph)paragraph.push(token);
      continue;
    }
    const tag=/^<\s*(\/)?\s*([a-z][a-z0-9:-]*)\b[^>]*>$/iu.exec(token);
    if(!tag)continue;
    const name=tag[2].toLowerCase();
    if(hidden.length){
      if(tag[1]&&name===hidden[hidden.length-1])hidden.pop();
      else if(!tag[1]&&name===hidden[hidden.length-1])hidden.push(name);
      continue;
    }
    if(!tag[1]&&["script","style","template","nav","aside","footer"].includes(name)){
      hidden.push(name);continue;
    }
    if(name!=="p")continue;
    if(!tag[1]){paragraph=[];continue;}
    if(!paragraph)continue;
    const text=visiblePublisherText(paragraph.join(" "));
    paragraph=null;
    if(text.length>6000)continue;
    if(/\b(?:critical minerals?|critical raw materials?|minerals? supply chains?|battery minerals?)\b/iu.test(text))
      return "critical-minerals policy";
    if(/\b(?:mining value chain|mineral exploration|mineral production)\b/iu.test(text))
      return "mineral exploration and production";
  }
  return null;
}
