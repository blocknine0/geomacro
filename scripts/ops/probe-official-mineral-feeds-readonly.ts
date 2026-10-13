/**
 * Diagnostics only: inspect independently hosted official releases without
 * exposing content, links or source identities in operational logs.
 * No source is promoted just because a transport returned HTTP 200.
 */
import { parseFirstPartyFeed, selectOfficialTopic, originalPublicationMs, type StatelessSourceSpec } from "../../src/lib/stateless-intelligence-model";

type Lane = StatelessSourceSpec;
const gov = (id: string, path: string): Lane => ({
  id, category: "rare_earth", media: "atom",
  url: "https://www.gov.uk/government/organisations/" + path + ".atom",
  allowedHosts: ["www.gov.uk"], credit: null, govContentApi: true,
});
const lanes: Lane[] = [
  gov("minerals_probe_foreign", "foreign-commonwealth-development-office"),
  gov("minerals_probe_science", "department-for-science-innovation-and-technology"),
  gov("minerals_probe_defence", "ministry-of-defence"),
  gov("minerals_probe_trade", "department-for-business-and-trade"),
  gov("minerals_probe_cabinet", "cabinet-office"),
  gov("minerals_probe_transport", "department-for-transport"),
  gov("minerals_probe_environment", "department-for-environment-food-rural-affairs"),
  gov("minerals_probe_housing", "ministry-of-housing-communities-and-local-government"),
  {id:"minerals_probe_eea",category:"rare_earth",media:"rss",url:"https://www.eea.europa.eu/en/newsroom/rss",
    allowedHosts:["www.eea.europa.eu"],credit:null},
  {id:"minerals_probe_council",category:"rare_earth",media:"rss",url:"https://www.consilium.europa.eu/en/press/press-releases/rss/",
    allowedHosts:["www.consilium.europa.eu"],credit:null},
  {id:"minerals_probe_canada_ised",category:"rare_earth",media:"atom",
    url:"https://api.io.canada.ca/io-server/gc/news/en/v2?dept=innovation-science-and-economic-development-canada&sort=publishedDate&orderBy=desc&pick=50&format=atom",
    allowedHosts:["www.canada.ca","api.io.canada.ca"],credit:null},
];
async function pageDay(candidate: {title:string;articleUrl:string}): Promise<boolean> {
  if(!candidate.articleUrl.startsWith("https://www.gov.uk/government/"))return false;
  try {
    const article=new URL(candidate.articleUrl);
    if(!/^\/government\/(?:news|speeches|statements|world-location-news|publications)\/[a-z0-9-]+$/u.test(article.pathname))return false;
    const response=await fetch("https://www.gov.uk/api/content"+article.pathname,{
      redirect:"error",headers:{Accept:"application/json"},signal:AbortSignal.timeout(5000)
    });
    if(!response.ok||!response.headers.get("content-type")?.includes("application/json"))return false;
    const len=Number(response.headers.get("content-length")??0);
    if(len>128*1024)return false;
    const raw=await response.text();
    if(raw.length>128*1024)return false;
    const doc=JSON.parse(raw) as {base_path?:string;title?:string;first_published_at?:string;document_type?:string};
    if(doc.base_path!==article.pathname||typeof doc.title!=="string"||
       !["news_story","press_release","speech","statement","publication","world_location_news_article"].includes(doc.document_type??""))return false;
    const feedWords=new Set(candidate.title.toLowerCase().match(/[a-z]{5,}/gu)??[]);
    const pageWords=new Set(doc.title.toLowerCase().match(/[a-z]{5,}/gu)??[]);
    if(![...feedWords].some(w=>pageWords.has(w)))return false;
    return originalPublicationMs(doc.first_published_at??null)!==null;
  }catch{return false}
}
const now=Date.now();
const report=await Promise.all(lanes.map(async (src,index)=>{
  let status=0,kind="none",seen=0,relevant=0,eligible=0,recovered=0;
  try {
    const response=await fetch(src.url,{redirect:"error",signal:AbortSignal.timeout(6500),
      headers:{Accept: src.media==="atom"?"application/atom+xml,application/xml,text/xml":"application/rss+xml,application/xml,text/xml"}});
    status=response.status;
    if(!response.ok)return {lane:index,status,kind,seen,relevant,eligible,recovered};
    const mime=response.headers.get("content-type")??"";
    if(!/^(?:application\/(?:rss\+xml|atom\+xml|xml)|text\/xml)(?:;|$)/iu.test(mime))
      return {lane:index,status,kind:"other",seen,relevant,eligible,recovered};
    const content=await response.text();
    if(content.length>384*1024)return {lane:index,status,kind:"oversized",seen,relevant,eligible,recovered};
    const parsed=parseFirstPartyFeed(content,src,now);
    seen=parsed.metrics.seen;relevant=parsed.metrics.relevant;eligible=parsed.dated.length;
    const isOriginal=parsed.undatedGov.filter(x=>selectOfficialTopic(x.title,"rare_earth")).slice(0,5);
    const results=await Promise.all(isOriginal.map(pageDay));
    recovered=results.filter(Boolean).length;
    kind="xml";
  }catch(e){
    kind=(e instanceof Error&&(/timeout|abort/i.test(e.name)||/timeout|abort/i.test(e.message)))?"timeout":"network";
  }
  return {lane:index,status,kind,seen,relevant,eligible,recovered};
}));
for(const item of report)console.log("MINERAL_FEED_ORIGINAL_PROBE",JSON.stringify(item));
console.log("MINERAL_PROBE_TOTALS",JSON.stringify({checked:report.length,xml:report.filter(x=>x.kind==="xml").length,admissible:report.filter(x=>x.eligible+x.recovered>0).length}));
