import {describe, expect, it, vi} from "vitest";
import {
  discoverOnDemandForPrivateQualification,
  verifyOnDemandOriginalArticlePages,
} from "./on-demand-global-discovery.server";

const now=new Date("2026-10-11T12:00:00.000Z");
const published="2026-10-11T07:00:00Z";

function discoveryFixture(url:string):Response {
  const uri=new URL(url);
  if(uri.hostname==="api.worldbank.org" && uri.pathname==="/v2/country/IND")
    return Response.json([{page:1},[{id:"IND",name:"India"}]]);
  if(uri.hostname==="api.worldbank.org")
    return Response.json([{page:1},[{date:"2025",value:3.2}]]);
  if(uri.hostname==="api.gdeltproject.org")
    return Response.json({articles:[]});
  if(uri.hostname==="api.reliefweb.int")
    return Response.json({data:[]});
  const feeds:Record<string,{title:string,url:string,atom:boolean}> = {
    "news.un.org":{
      title:"India conflict security council review",
      url:"https://news.un.org/en/story/2026/10/1150000",atom:false,
    },
    "www.federalreserve.gov":{
      title:"India inflation monetary policy review",
      url:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261011a.htm",
      atom:false,
    },
    "www.minister.industry.gov.au":{
      title:"India lithium critical minerals cooperation",
      url:"https://www.minister.industry.gov.au/t-ayres/media/releases/india-minerals",
      atom:false,
    },
  };
  const d=feeds[uri.hostname] ??
    (uri.hostname==="www.gov.uk" ?
      uri.pathname.includes("foreign-commonwealth")
        ? {title:"India diplomatic security talks",
          url:"https://www.gov.uk/government/news/india-diplomatic-talks",atom:true}
        : {title:"India lithium critical minerals agreement",
          url:"https://www.gov.uk/government/news/india-lithium-critical-minerals-agreement",atom:true}
      : null);
  if(!d)throw Error("UNEXPECTED_PROVIDER");
  const xml=d.atom
    ? '<feed><entry><title>'+d.title+'</title><published>'+published+'</published>'+
      '<link rel="alternate" href="'+d.url+'"/></entry></feed>'
    : '<rss><channel><item><title>'+d.title+'</title>'+
      '<pubDate>Sun, 11 Oct 2026 07:00:00 GMT</pubDate>'+
      '<link>'+d.url+'</link></item></channel></rss>';
  return new Response(xml);
}

const discoverFetch=vi.fn(async(input:RequestInfo|URL)=>discoveryFixture(String(input))) as unknown as typeof fetch;
async function candidates(){
  const proof=await discoverOnDemandForPrivateQualification({
    country_iso3:"IND",categories:["geopolitics","macro","rare_earth"],
  },{fetchImpl:discoverFetch,now});
  expect(proof.private_candidates).toHaveLength(5);
  return proof.private_candidates;
}

function articleHtml(meta:string){
  return '<html><head>'+meta+'</head><body>Not emitted to customer</body></html>';
}

describe("privileged privacy-safe original-page reason accounting",()=>{
 it("reports missing native publication metadata, never issuer identity, URL or title",async()=>{
  const one=(await candidates())[0];
  const fetchImpl=vi.fn(async()=>new Response(articleHtml(
   '<meta property="article:modified_time" content="'+published+'">'),
    {headers:{"content-type":"text/html"}})) as unknown as typeof fetch;
  const result=await verifyOnDemandOriginalArticlePages([one],{
   fetchImpl,now,diagnostics:true
  });
  expect(result.attempted).toBe(1);
  expect(result.verified).toBe(0);
  expect(result.page_rejection_counts).toEqual({
   PUBLISHER_PUBLICATION_METADATA_MISSING:1
  });
  const safe=JSON.stringify(result.page_rejection_counts);
  expect(safe).not.toContain(one.article_url);
  expect(safe).not.toContain(one.article_title);
  expect(safe).not.toContain(one.publisher_family);
 });
 it("treats native feed conflict as a separate non-certifying reason, with no extra GET",async()=>{
  const one=(await candidates())[0];
  const fetchImpl=vi.fn(async()=>new Response(articleHtml(
   '<meta property="article:published_time" content="2026-10-11T10:00:00Z">'),
    {headers:{"content-type":"text/html"}})) as unknown as typeof fetch;
  const result=await verifyOnDemandOriginalArticlePages([one],{
   fetchImpl,now,diagnostics:true
  });
  expect(result.verified).toBe(0);
  expect(result.page_rejection_counts).toEqual({
   ORIGINAL_FEED_AND_PAGE_CLOCK_MISMATCH:1
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
 });
 it("does not expose aggregate reasons to ordinary callers without explicit private opt-in",async()=>{
  const one=(await candidates())[0];
  const fetchImpl=vi.fn(async()=>new Response(articleHtml(
    '<meta property="article:modified_time" content="'+published+'">'),
    {headers:{"content-type":"text/html"}})) as unknown as typeof fetch;
  const result=await verifyOnDemandOriginalArticlePages([one],{fetchImpl,now});
  expect(result.page_rejection_counts).toBeUndefined();
 });
});

describe("private on-demand publisher page date checks",()=>{
  it("checks a maximum of 4 distinct originating publisher pages and never grants paid rights",async()=>{
    const urls:string[]=[];
    const pageFetch=vi.fn(async(input:RequestInfo|URL,options?:RequestInit)=>{
      urls.push(String(input));
      expect(options?.redirect).toBe("manual");
      expect(options?.method).toBe("GET");
      return new Response(articleHtml(
        '<meta property="article:published_time" content="'+published+'">'),
        {headers:{"content-type":"text/html"}});
    }) as unknown as typeof fetch;
    const proof=await verifyOnDemandOriginalArticlePages(await candidates(),{fetchImpl:pageFetch,now});
    expect(proof.attempted).toBe(4);
    expect(proof.verified).toBe(4);
    expect(new Set(proof.verified_candidates.map(x=>x.publisher_family)).size).toBe(4);
    expect(new Set(proof.verified_candidates.map(x=>x.domain)))
      .toEqual(new Set(["geopolitics","macro","rare_earth"]));
    expect(proof.verified_candidates.every(x=>
      x.publisher_article_page_date_verified &&
      x.page_original_published_at==="2026-10-11T07:00:00.000Z" &&
      x.derived_commercial_rights_verified===false &&
      x.independent_same_event_verified===false &&
      x.signed_gro_verified===false &&
      x.paid_delivery_allowed===false)).toBe(true);
    expect(urls).toHaveLength(4);
    expect(urls.every(x=>new URL(x).protocol==="https:")).toBe(true);
  });

  it("rejects fabricated publisher, altered fingerprint or unsafe article URL before HTTP",async()=>{
    const originals=await candidates();
    const one=originals[0];
    const bad=[
      {...one,publisher_family:"unregistered_issuer"},
      {...one,article_identity_sha256:"0".repeat(64)},
      {...one,article_url:"https://news.un.org.evil.example/en/story/2026/10/1150000"},
      {...one,article_url:"https://news.un.org/en/story/2026/10/1150000?tracking=1"},
    ];
    const pageFetch=vi.fn(async()=>{throw Error("UNEXPECTED_HTTP");}) as unknown as typeof fetch;
    const proof=await verifyOnDemandOriginalArticlePages(bad,{fetchImpl:pageFetch,now});
    expect(proof).toEqual({attempted:0,verified:0,verified_candidates:[]});
    expect(pageFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["missing publication date","<meta property='article:modified_time' content='"+published+"'>"],
    ["date-only unsupported","<meta property='article:published_time' content='2026-10-11'>"],
    ["mismatched clock","<meta property='article:published_time' content='2026-10-11T09:30:00Z'>"],
    ["future clock","<meta property='article:published_time' content='2026-10-12T07:00:00Z'>"],
  ])("fails closed on %s",async(_label,meta)=>{
    const one=(await candidates())[0];
    const pageFetch=vi.fn(async()=>new Response(articleHtml(meta))) as unknown as typeof fetch;
    const proof=await verifyOnDemandOriginalArticlePages([one],{fetchImpl:pageFetch,now});
    expect(proof.attempted).toBe(1);
    expect(proof.verified).toBe(0);
    expect(proof.verified_candidates).toEqual([]);
  });

  it("fails closed on upstream redirect, timeout-like failure and oversized HTML",async()=>{
    const one=(await candidates())[0];
    const responses=[
      new Response(null,{status:302,headers:{location:"https://another.example/"}}),
      new Response("x".repeat(384*1024+1),{status:200,headers:{"content-type":"text/html"}}),
    ];
    for(const response of responses){
      const pageFetch=vi.fn(async()=>response) as unknown as typeof fetch;
      const proof=await verifyOnDemandOriginalArticlePages([one],{fetchImpl:pageFetch,now});
      expect(proof.verified).toBe(0);
    }
    const failing=vi.fn(async()=>{throw Error("network fail");}) as unknown as typeof fetch;
    const result=await verifyOnDemandOriginalArticlePages([one],{fetchImpl:failing,now});
    expect(result).toEqual({attempted:1,verified:0,verified_candidates:[]});
  });
});

it("a private three-domain intake limits probes to one original per category while public default remains four",async()=>{
 const originals=await candidates();let reads=0;
 const result=await verifyOnDemandOriginalArticlePages(originals,{now,maxProbes:3,
  fetchImpl:async()=>{reads++;return new Response('<html><head><meta property="article:published_time" content="'+published+'"/></head></html>',{headers:{'content-type':'text/html'}});}});
 expect(result.attempted).toBe(3);expect(reads).toBe(3);
 expect(new Set(result.verified_candidates.map(x=>x.domain))).toEqual(new Set(["geopolitics","macro","rare_earth"]));
 for(const maxProbes of [0,5,NaN])await expect(verifyOnDemandOriginalArticlePages([],{now,maxProbes})).rejects.toThrow(/CLOCK_INVALID/);
});
