/**
 * Constrained annual Federal Reserve issuer press-release INDEX discovery.
 * This is not an RSS substitute, source corroboration, publication clock,
 * proprietary intelligence, licence decision, or separate retrieval engine.
 * The existing canonical original-page verifier independently establishes the
 * originating page's exact release clock and content.
 */
const MINUTES_TITLE=/^Minutes of the Board['\u2019]s discount rate meetings on\s+[A-Z]/iu;
const URL=/^\/newsevents\/pressreleases\/monetary(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])a\.htm$/u;
const htmlEntities=(text:string)=>text.replace(/&(?:#39|apos|rsquo|#8217);/giu,"'")
  .replace(/&(?:nbsp|#160);/giu," ")
  .replace(/&amp;/giu,"&").replace(/\s+/gu," ").trim();
/** The public Board index often formats link labels with nested <span>.
 * Extract visible anchor text using a bounded scanner, not an HTML tag-
 * stripping regex. Reject scripts/styles and malformed markup entirely.
 */
function visibleLinkText(fragment:string):string {
 if(fragment.length>1400)return "";
 let out="",at=0;
 while(at<fragment.length){
   const open=fragment.indexOf("<",at);
   if(open<0){out+=fragment.slice(at);break;}
   out+=fragment.slice(at,open);
   const close=fragment.indexOf(">",open+1);
   if(close<0 || close-open>256)return "";
   const tag=fragment.slice(open+1,close).trim().toLowerCase();
   if(!/^\/?(?:span|strong|em|b|i|small|sup|sub)(?:\s[^<>]{0,180})?\/?$/u.test(tag))
     return "";
   at=close+1;
 }
 return htmlEntities(out);
}
export type FedArchiveOriginal=Readonly<{
 article_url:string;article_title:string;
 official_archive_release_day:string;
}>;
export function originalFedDiscountMinutesArchiveLinks(
 html:string,year:number,now:Date,maxAgeMs:number,
):readonly FedArchiveOriginal[]{
 if(typeof html!=="string"||html.length>384*1024 ||
    !Number.isInteger(year)||year<2020||year>2100 ||
    !(now instanceof Date)||!Number.isFinite(now.getTime()) ||
    !Number.isFinite(maxAgeMs)||maxAgeMs<=0||maxAgeMs>31*86400_000)return [];
 const result:FedArchiveOriginal[]=[];
 const seen=new Set<string>();
 const base="https://www.federalreserve.gov/newsevents/pressreleases/"+year+"-press.htm";
 // Parse fixed first-party link markup ONLY; never treat site page text or
 // script fields as a verified original. No HTML content is printed/stored.
 const anchors=html.matchAll(/<a\b([^<>]{0,1400})>([\s\S]{12,1400}?)<\/a\s*>/giu);
 for(const a of anchors){
  if(result.length>=2)break;
  const href=/\bhref\s*=\s*["']([^"']{1,350})["']/iu.exec(a[1])?.[1];
  if(!href)continue;
  const title=visibleLinkText(a[2]);
  if(title.length>300||!MINUTES_TITLE.test(title))continue;
  let uri:URL;
  try{uri=new globalThis.URL(href.replace(/&amp;/giu,"&"),base);}catch{continue;}
  if(uri.protocol!=="https:"||uri.hostname!=="www.federalreserve.gov" ||
     uri.username||uri.password||uri.port||uri.search||uri.hash)continue;
  const m=URL.exec(uri.pathname);
  if(!m || Number(m[1])!==year)continue;
  const day=m[1]+"-"+m[2]+"-"+m[3];
  const ms=Date.parse(day+"T00:00:00.000Z");
  if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==day ||
     ms>now.getTime()||now.getTime()-ms>maxAgeMs+86400_000)continue;
  // Require the original press ARCHIVE to print the same calendar day
  // adjacent to this headline. URL digits alone cannot certify this day.
  const context=html.slice(Math.max(0,a.index-2000),a.index);
  const archiveDate=String(Number(m[2]))+"/"+String(Number(m[3]))+"/"+m[1];
  if(!context.includes(archiveDate))continue;
  const origin=uri.origin+uri.pathname;
  if(seen.has(origin))continue;
  seen.add(origin);
  result.push(Object.freeze({
    article_url:origin,article_title:title,
    official_archive_release_day:day,
  }));
 }
 return result;
}
