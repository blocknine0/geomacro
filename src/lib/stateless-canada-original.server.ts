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

  const originalDates:string[]=[];
  for(const tag of html.match(/<meta\b[^>]*>/giu)??[]){
    const name=(attr(tag,"name")??attr(tag,"property")??"").toLowerCase();
    if(!["dcterms.issued","article:published_time","datepublished"].includes(name))continue;
    const value=attr(tag,"content");
    if(value)originalDates.push(value.slice(0,10));
  }
  for(const match of html.matchAll(/<time\b([^>]*)>([^<]{1,130})<\/time>/giu)){
    if((attr(match[1],"property")??"").toLowerCase()!=="datepublished")continue;
    const value=attr(match[1],"datetime")??match[2].trim();
    if(/^\d{4}-\d{2}-\d{2}/u.test(value))originalDates.push(value.slice(0,10));
  }
  if(!originalDates.length||new Set(originalDates).size!==1)return null;
  const day=originalDates[0];
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(day)||day.slice(0,4)!==path[2]||
     day.slice(5,7)!==path[3])return null;
  const ms=Date.parse(day+"T00:00:00.000Z");
  if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==day||
     ms>now||ms<now-30*86_400_000)return null;
  return day;
}
