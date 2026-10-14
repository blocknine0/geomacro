import {describe,it,expect,vi} from "vitest";
import {
  discoverOnDemandForPrivateQualification,
  verifyOnDemandOriginalArticlePages,
} from "./on-demand-global-discovery.server";

const now=new Date("2026-10-14T09:00:00Z");
const pub="2026-10-14T06:00:00Z";
const firstUrl="https://news.un.org/en/story/2026/10/1150001";
const secondUrl="https://news.un.org/en/story/2026/10/1150002";
const xml='<rss><channel>'+
  '<item><title>India conflict ceasefire talks initial meeting</title>'+
    '<pubDate>Wed, 14 Oct 2026 06:00:00 GMT</pubDate><link>'+firstUrl+'</link></item>'+
  '<item><title>India conflict security council follow-up statement</title>'+
    '<pubDate>Wed, 14 Oct 2026 06:00:00 GMT</pubDate><link>'+secondUrl+'</link></item>'+
  '</channel></rss>';

async function originals(){
  const fetchImpl=vi.fn(async(input:RequestInfo|URL):Promise<Response>=>{
    const uri=new URL(String(input));
    if(uri.hostname==="api.worldbank.org")
      return Response.json([{page:1},[{id:"IND",name:"India"}]]);
    if(uri.hostname==="news.un.org")
      return new Response(xml,{headers:{"content-type":"application/rss+xml"}});
    if(uri.hostname==="www.gov.uk")return new Response("<feed></feed>");
    throw Error("UNEXPECTED_PROVIDER");
  }) as unknown as typeof fetch;
  const found=await discoverOnDemandForPrivateQualification({
    country_iso3:"IND",categories:["geopolitics"],
    topics:["conflict_geopolitics"],
  },{now,fetchImpl,disableDiscoveryIndex:true});
  const candidates=found.private_original_review_candidates.filter(x=>
    x.publisher_family==="un_news_original_publisher");
  expect(candidates.map(x=>x.article_url)).toEqual([firstUrl,secondUrl]);
  return candidates;
}
const goodPage='<html><head><meta property="article:published_time" content="'+pub+'"></head></html>';
const invalidPage='<html><head><meta property="article:modified_time" content="'+pub+'"></head></html>';

describe("bounded second original article verification from the same publisher",()=>{
  it("uses a spare verification slot only after the first page lacks a valid original clock",async()=>{
    const candidates=await originals();
    const seen:string[]=[];
    const pages=vi.fn(async(input:RequestInfo|URL):Promise<Response>=>{
      const url=String(input);seen.push(url);
      return new Response(url===firstUrl?invalidPage:goodPage,
        {headers:{"content-type":"text/html"}});
    }) as typeof fetch;
    const result=await verifyOnDemandOriginalArticlePages(candidates,{fetchImpl:pages,now});
    expect(result.attempted).toBe(2);
    expect(result.verified).toBe(1);
    expect(seen).toEqual([firstUrl,secondUrl]);
    expect(result.verified_candidates[0].article_url).toBe(secondUrl);
    expect(result.verified_candidates[0].page_original_published_at)
      .toBe("2026-10-14T06:00:00.000Z");
    expect(result.verified_candidates[0].derived_commercial_rights_verified).toBe(false);
    expect(result.verified_candidates[0].independent_same_event_verified).toBe(false);
    expect(result.verified_candidates[0].paid_delivery_allowed).toBe(false);
    expect(result.verified_candidates[0].signed_gro_verified).toBe(false);
  });
  it("never probes a second page if first-page publication was verified",async()=>{
    const candidates=await originals();
    const pages=vi.fn(async()=>new Response(goodPage,
      {headers:{"content-type":"text/html"}})) as typeof fetch;
    const result=await verifyOnDemandOriginalArticlePages(candidates,{fetchImpl:pages,now});
    expect(result.attempted).toBe(1);
    expect(result.verified).toBe(1);
    expect(pages).toHaveBeenCalledTimes(1);
  });
  it.each([403,429])("never bypasses publisher HTTP %i denial using its second URL",async(status)=>{
    const candidates=await originals();
    const pages=vi.fn(async()=>new Response("denied",{status})) as typeof fetch;
    const result=await verifyOnDemandOriginalArticlePages(candidates,{fetchImpl:pages,now});
    expect(result.attempted).toBe(1);
    expect(result.verified).toBe(0);
    expect(pages).toHaveBeenCalledTimes(1);
  });
  it("refuses invalid second clock rather than claiming a rescued article",async()=>{
    const candidates=await originals();
    const pages=vi.fn(async()=>new Response(invalidPage,
      {headers:{"content-type":"text/html"}})) as typeof fetch;
    const result=await verifyOnDemandOriginalArticlePages(candidates,{fetchImpl:pages,now});
    expect(result.attempted).toBe(2);
    expect(result.verified).toBe(0);
    expect(pages).toHaveBeenCalledTimes(2);
  });
});
