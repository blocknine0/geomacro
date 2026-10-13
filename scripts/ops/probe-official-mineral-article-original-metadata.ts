const candidates=[
 {index:"https://www.ga.gov.au/news",article:"https://www.ga.gov.au/news/delamerian-project-reveals-new-mineral-and-groundwater-insights-beneath-south-eastern-australia",title:"Delamerian project reveals new mineral and groundwater insights beneath south-eastern Australia"},
 {index:"https://single-market-economy.ec.europa.eu/index_en",article:"https://luxembourg.representation.ec.europa.eu/actualites-et-evenements/actualites/commission-selects-46-new-strategic-projects-bolster-eus-supply-critical-raw-materials-2026-10-09_en",title:"Commission selects 46 new Strategic Projects to bolster the EU's supply of critical raw materials"},
];
for(const [lane,source] of candidates.entries()){
 const responses=await Promise.all([source.index,source.article].map(async (u)=> {
  try { const response=await fetch(u,{headers:{Accept:"text/html"},redirect:"error",signal:AbortSignal.timeout(8500)});
   const raw=await response.text();return {http:response.status,mime:response.headers.get("content-type"),raw};}
  catch {return{http:0,mime:"error",raw:""};}
 }));
 for(const [kind,item] of responses.entries()){
  const html=item.raw;
  const pos=html.toLowerCase().indexOf(source.title.toLowerCase());
  const around=pos<0?"":html.slice(Math.max(0,pos-1200),Math.min(html.length,pos+1600));
  const tags=[...around.matchAll(/<\/?[a-z][a-z0-9-]*\b/giu)].map(m=>m[0].slice(1)).slice(0,90);
  const urlLinks=[...around.matchAll(/href=["']([^"']+)["']/giu)].map(m=>m[1]);
  const ownLinks=urlLinks.filter(x=>x.startsWith("/")||/https:\/\/(?:www\.ga\.gov\.au|single-market-economy\.ec\.europa\.eu|luxembourg\.representation\.ec\.europa\.eu)/iu.test(x));
  const date=kind===0?/\b(?:9 October 2026|18 September 2026)\b/iu.test(around):null;
  const dateMetaNames=[...html.matchAll(/<meta\\b[^>]*>/giu)]
    .map(m=>/\\b(?:name|property)\\s*=\\s*["']([^"']+)["']/iu.exec(m[0])?.[1]??"")
    .filter(n=>/date|publish|release|modified|issued|dc\\.date/iu.test(n)).slice(0,12);
  console.log("ORIGINAL_MINERAL_SHAPE",JSON.stringify({lane,kind,http:item.http,bytes:html.length,
   titleFound:pos>=0,dateNearby:date,dateTokens:[...around.matchAll(/\b(?:9 October 2026|18 September 2026)\b/gi)].length,
   linksNearby:urlLinks.length,samePublisherLinksNearby:ownLinks.length,
   tagSequence:tags,dateMetaNames,
   titleMeta:[...html.matchAll(/<meta\b[^>]{0,400}(?:datepublished|published_time|dcterms\.issued|datecreated|last-modified)[^>]*>/giu)].length,
   jsonLdDates:[...html.matchAll(/"datePublished"\s*:/gu)].length,
   pageLastUpdated:[...html.matchAll(/Page last updated/giu)].length,
   articleTitleHeader:/<h1\b[\s\S]{0,1400}?<\/h1>/iu.test(html)}));
 }
}