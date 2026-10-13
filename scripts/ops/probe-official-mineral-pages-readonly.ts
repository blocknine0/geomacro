/**
 * Bounded publisher-original HTML discovery (no raw article/data log).
 * Metadata and original article title must later be verified independently.
 */
const urls=[
 "https://single-market-economy.ec.europa.eu/index_en",
 "https://luxembourg.representation.ec.europa.eu/actualites-et-evenements/actualites/commission-selects-46-new-strategic-projects-bolster-eus-supply-critical-raw-materials-2026-10-09_en",
 "https://www.ga.gov.au/news",
 "https://www.bgs.ac.uk/news/",
 "https://www.gov.uk/government/news/new-lithium-mine-in-cornwall-to-unlock-britains-industrial-potential-and-support-skilled-jobs",
];
const rows=await Promise.all(urls.map(async(url,lane)=>{
 let code=0,kind="none",bytes=0,anchor=0,dateTokens=0,titleTags=0,jsonld=0,sourceLinks=0;
 try{
  const resp=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(8000),
    headers:{Accept:"text/html"}});
  code=resp.status;
  if(!resp.ok)return{lane,code,kind,bytes,anchor,dateTokens,titleTags,jsonld,sourceLinks};
  const mime=resp.headers.get("content-type")??"";
  if(!/^text\/html(?:;|$)/i.test(mime))return{lane,code,kind:"other",bytes,anchor,dateTokens,titleTags,jsonld,sourceLinks};
  const html=await resp.text();bytes=html.length;
  if(bytes>600000)return{lane,code,kind:"oversize",bytes,anchor,dateTokens,titleTags,jsonld,sourceLinks};
  anchor=[...html.matchAll(/<a\b[^>]{0,1000}href\s*=/gi)].length;
  titleTags=[...html.matchAll(/<(?:h1|h2|h3|h4)\b/gi)].length;
  jsonld=[...html.matchAll(/application\/ld\+json/gi)].length;
  dateTokens=[...html.matchAll(/\b(?:[0-2]?\d|3[01])\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b/gi)].length;
  sourceLinks=[...html.matchAll(/\b(?:presscorner\/detail|government\/news|news\/|actualites\/)/gi)].length;
  kind="html";
 }catch(e){kind=e instanceof Error&&(/abort|timeout/i.test(e.name)||/abort|timeout/i.test(e.message))?"timeout":"network"}
 return{lane,code,kind,bytes,anchor,dateTokens,titleTags,jsonld,sourceLinks};
}));
rows.forEach(row=>console.log("ORIGINAL_MINERAL_HTML_PROBE",JSON.stringify(row)));
