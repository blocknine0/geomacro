import {describe,expect,it,vi} from "vitest";
import {
  discoverOnDemandForPrivateQualification,discoverOnDemandGlobal,
  verifyOnDemandOriginalArticlePages,
} from "./on-demand-global-discovery.server";
import {indexedHeadlineMatchesOriginalPage} from "./on-demand-index-original-title.server";

const now=new Date("2026-10-13T12:00:00.000Z");
const original="2026-10-13T07:00:00Z";
const originalUrl="https://www.gov.uk/government/news/india-security-council-ceasefire-briefing";
const originalTitle="India security council ceasefire briefing";
const validPage='<html><head><meta property="article:published_time" content="'+
  original+'"></head><body><h1>'+originalTitle+'</h1></body></html>';

function sourceFetch(leadUrl=originalUrl,leadTitle=originalTitle) {
  const calls:string[]=[];
  const mock=vi.fn(async(input:RequestInfo|URL)=>{
    const u=String(input);calls.push(u);
    if(u.startsWith("https://api.worldbank.org/v2/country/IND"))
      return Response.json([{page:1},[{id:"IND",name:"India"}]]);
    if(u.startsWith("https://api.gdeltproject.org/"))
      return Response.json({articles:[{url:leadUrl,title:leadTitle,
        seendate:"20261013120000"}]});
    // A publisher RSS outage need not prevent first-party article verification
    // once its exact URL has been found via global index.
    if(u.startsWith("https://www.gov.uk/") || u.startsWith("https://news.un.org/"))
      return new Response("unavailable",{status:503});
    throw Error("UNEXPECTED_PROVIDER");
  }) as unknown as typeof fetch;
  return {mock,calls};
}
describe("free global search indexing recovers missing *original* publishers",()=>{
  it("takes a GDELT official URL as PRIVATE UNDATED candidate; verifies publisher article separately",async()=>{
    const {mock}=sourceFetch();
    const result=await discoverOnDemandForPrivateQualification({
      country_iso3:"IND",categories:["geopolitics"],
    },{fetchImpl:mock,now});
    expect(result.discovery.source_probes.find(s=>s.family==="gdelt_doc_discovery"))
      .toMatchObject({reachable:true,publication_clock_verified:false,
        independent_claim_verified:false});
    expect(result.private_candidates).toHaveLength(1);
    expect(result.private_candidates[0]).toMatchObject({
      domain:"geopolitics",publisher_family:"uk_fcdo_original_publisher",
      article_url:originalUrl,feed_item_published_at:null,
      index_original_page_pending:true,
      source_native_feed_publication_date_verified:false,
      independent_same_event_verified:false,derived_commercial_rights_verified:false,
      score_verified:false,signed_gro_verified:false,paid_delivery_allowed:false,
    });
    const serialized=JSON.stringify(result.discovery);
    expect(serialized).not.toContain(originalTitle);
    expect(serialized).not.toContain(originalUrl);
    expect(result.discovery.payable).toBe(false);
    expect(result.discovery.network_attempts).toBeLessThanOrEqual(12);
    expect(result.discovery.b2_requests).toBe(0);
    expect(result.discovery.supabase_requests).toBe(0);
    const pageFetch=vi.fn(async(request:RequestInfo|URL,opts?:RequestInit)=>{
      expect(String(request)).toBe(originalUrl);
      expect(opts?.redirect).toBe("manual");
      expect(opts?.method).toBe("GET");
      return new Response(validPage,{headers:{"content-type":"text/html"}});
    }) as unknown as typeof fetch;
    const proof=await verifyOnDemandOriginalArticlePages(
      result.private_original_review_candidates,{now,fetchImpl:pageFetch});
    expect(proof).toMatchObject({attempted:1,verified:1});
    expect(proof.verified_candidates[0]).toMatchObject({
      publisher_article_page_date_verified:true,
      page_original_published_at:"2026-10-13T07:00:00.000Z",
      signed_gro_verified:false,paid_delivery_allowed:false,
    });
    expect(pageFetch).toHaveBeenCalledTimes(1);
  });
  it("never treats index seendate, a third-party URL or a URL query as originating evidence",async()=>{
    for(const url of [
      "https://untrusted.example/article/india-security-council",
      "https://www.gov.uk.attacker.invalid/government/news/india-security",
      originalUrl+"?updated=1",originalUrl+"#published",
      "http://www.gov.uk/government/news/india-security-council-ceasefire-briefing",
    ]){
      const {mock}=sourceFetch(url);
      const r=await discoverOnDemandForPrivateQualification({
        country_iso3:"IND",categories:["geopolitics"],
      },{fetchImpl:mock,now});
      expect(r.private_candidates).toEqual([]);
      expect(r.private_original_review_candidates).toEqual([]);
      expect(r.discovery.payable).toBe(false);
    }
  });
  it("rejects same-host original URL with unrelated headline or wrong country",async()=>{
    for(const title of ["Australia ceasefire security council briefing",
       "India trade policy agricultural incentives"]){
      const {mock}=sourceFetch(originalUrl,title);
      const x=await discoverOnDemandForPrivateQualification({
        country_iso3:"IND",categories:["geopolitics"],
      },{fetchImpl:mock,now});
      expect(x.private_candidates).toEqual([]);
    }
  });
  it("rejects manipulated index text when original article H1 or date disagrees",async()=>{
    const {mock}=sourceFetch();
    const x=await discoverOnDemandForPrivateQualification({
      country_iso3:"IND",categories:["geopolitics"],
    },{fetchImpl:mock,now});
    const pages=[
      '<html><h1>Australia security council ceasefire briefing</h1>'+
        '<meta property="article:published_time" content="'+original+'"></html>',
      '<html><script><h1>'+originalTitle+'</h1></script><h1>Unrelated release</h1>'+
        '<meta property="article:published_time" content="'+original+'"></html>',
      '<html><h1>'+originalTitle+'</h1><!--<meta property="article:published_time" content="'+original+'">--></html>',

      '<html><h1>Unrelated renewable energy investment announcement</h1>'+
        '<meta property="article:published_time" content="'+original+'"></html>',
      '<html><h1>'+originalTitle+'</h1>'+
        '<meta property="article:modified_time" content="'+original+'"></html>',
      '<html><h1>'+originalTitle+'</h1>'+
        '<meta property="article:published_time" content="2026-10-14T07:00:00Z"></html>',
      '<html><h1>'+originalTitle+'</h1><script>'+
        '<meta property="article:published_time" content="'+original+'">'+
        '</script></html>',
    ];
    for(const html of pages) {
      const pageFetch=vi.fn(async()=>new Response(html,{
        headers:{"content-type":"text/html"},
      })) as unknown as typeof fetch;
      const p=await verifyOnDemandOriginalArticlePages(
        x.private_original_review_candidates,{now,fetchImpl:pageFetch});
      expect(p.verified).toBe(0);
      expect(p.verified_candidates).toEqual([]);
    }
    expect(indexedHeadlineMatchesOriginalPage(originalTitle,validPage)).toBe(true);
    expect(indexedHeadlineMatchesOriginalPage("Unrelated India budget legislation",validPage))
      .toBe(false);
  });
  it("remains no-charge in public discovery when publisher feeds are unavailable",async()=>{
    const {mock}=sourceFetch();
    const publicResult=await discoverOnDemandGlobal({
      country_iso3:"IND",categories:["geopolitics"],
    },{fetchImpl:mock,now});
    expect(publicResult.raw_upstream_delivered).toBe(false);
    expect(publicResult.signed_derived_intelligence_created).toBe(false);
    expect(publicResult.independent_same_event_corroboration_verified).toBe(false);
    expect(publicResult.payable).toBe(false);
    expect(publicResult.settlement_attempted).toBe(false);
  });
});
