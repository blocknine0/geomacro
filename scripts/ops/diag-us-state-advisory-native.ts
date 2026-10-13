import { parseFirstPartyFeed } from "../../src/lib/stateless-intelligence-model";

const url="https://travel.state.gov/_res/rss/TAsTWs.xml";
const source={
  id:"us_state_advisories",
  category:"geopolitics" as const,
  media:"rss" as const,
  url,allowedHosts:["travel.state.gov"],credit:null,
};
const response=await fetch(url,{
  redirect:"error",
  headers: { Accept:"application/rss+xml, application/xml, text/xml" },
  signal:AbortSignal.timeout(10_000),
});
const body=await response.text();
const parsed=parseFirstPartyFeed(body.slice(0,384*1024),source,Date.now());
const items=[...body.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)].slice(0,75);
const datedItems=items.filter(x=>/<pubDate(?:\s[^>]*)?>/iu.test(x[1]));
const parsedItems=items.filter(x=>{
  const match=/<pubDate(?:\s[^>]*)?>([^<>]{8,90})<\/pubDate>/iu.exec(x[1]);
  return match && Number.isFinite(Date.parse(match[1]));
});
const distinctDateSamples=parsedItems.slice(0,8).map(x=>{
  const m=/<pubDate(?:\s[^>]*)?>([^<>]{8,90})<\/pubDate>/iu.exec(x[1]);
  const t=Date.parse(m?.[1]??"");
  return Number.isFinite(t)?Math.floor((Date.now()-t)/86_400_000):null;
});
const routeStats={
  withTitle:0, countryLevelTitle:0, countryAdvisoryTitle:0,
  linkValidHost:0, expectedArticlePath:0, advisoryDirectory:0,
  last30Days:0, last7Days:0,
  pathClasses:{} as Record<string,number>,
  queryUrls:0,fragmentUrls:0,longPaths:0,currentSubtree:0,
};
for(const [,fragment] of items){
  const title=/<title(?:\s[^>]*)?>([^<>]+)<\/title>/iu.exec(fragment)?.[1]??"";
  const link=/<link(?:\s[^>]*)?>([^<>]+)<\/link>/iu.exec(fragment)?.[1]??"";
  const pub=/<pubDate(?:\s[^>]*)?>([^<>]+)<\/pubDate>/iu.exec(fragment)?.[1]??"";
  if(title)routeStats.withTitle++;
  if(/^[A-Za-z][A-Za-z .'-]{2,100}\s+-\s+Level [1-4]:\s+.{8,160}$/u.test(title))routeStats.countryLevelTitle++;
  if(/^[A-Za-z][A-Za-z .'-]{2,100}\s+Travel Advisory$/u.test(title))routeStats.countryAdvisoryTitle++;
  try {
    const u=new URL(link);
    if(u.hostname==="travel.state.gov"){
      routeStats.linkValidHost++;
      if(u.search)routeStats.queryUrls++;
      if(u.hash)routeStats.fragmentUrls++;
      if(u.pathname.length>320)routeStats.longPaths++;
      if(u.pathname.startsWith("/content/tsgaem/us/en/home/international-travel/"))routeStats.currentSubtree++;
      const parts=u.pathname.split("/").filter(Boolean);
      const safePrefix=parts.slice(0,6).join("/").replace(/[^a-z0-9\/-]/giu,"");
      routeStats.pathClasses[safePrefix]=(routeStats.pathClasses[safePrefix]??0)+1;
      if(u.pathname.includes("traveladvisories"))routeStats.advisoryDirectory++;
      if(/^\/content\/travel\/en\/traveladvisories\/traveladvisories\/[a-z0-9-]+(?:\.html)?$/iu.test(u.pathname))
        routeStats.expectedArticlePath++;
    }
  }catch{}
  const t=Date.parse(pub);
  if(Number.isFinite(t) && Date.now()-t<=30*86_400_000)routeStats.last30Days++;
  if(Number.isFinite(t) && Date.now()-t<=7*86_400_000)routeStats.last7Days++;
}
const report={
  schema:"geomacro.state-original-advisory-once.v1",
  http:response.status,verified_transport:response.ok && /<rss\b/iu.test(body),
  examined:parsed.metrics.seen,
  route_stats:routeStats,
  pubdate_tagged:datedItems.length,parseable_pubdate:parsedItems.length,
  sample_age_days:distinctDateSamples,
  qualified_source_native_clocks:parsed.metrics.native_clock_valid,
  qualified_first_party_urls:parsed.metrics.original_link_valid,
  current_signals:parsed.dated.length,
  provider_titles_logged:false,provider_article_urls_logged:false,
  signed_gro_generated:false,scoring_performed:false,payment_sent:false,
};
console.log(JSON.stringify(report));
if(!report.verified_transport || parsed.metrics.seen===0) process.exitCode=2;
