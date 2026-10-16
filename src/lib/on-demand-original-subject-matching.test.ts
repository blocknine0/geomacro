import { describe, expect, it, vi } from "vitest";
import { originalHeadlineMentionsCountry, originalPublisherMatchesCountry } from "./on-demand-original-subject-matching";
import {
  discoverOnDemandGlobal, discoverOnDemandForPrivateQualification,
  matchesRequestedTopic,
} from "./on-demand-global-discovery.server";

const now=new Date("2026-10-11T12:00:00Z");

describe("fixed country qualification for original publisher evidence",()=>{
  it.each([
    ["Chinese lithium export licensing update","CHN","China",true],
    ["China lithium supply restrictions","CHN","China",true],
    ["CHINA / lithium trade","CHN","China",true],
    ["China-based battery supply regulation","CHN","China",true],
    ["Chinatown lithium supply update","CHN","China",false],
    ["India lithium production","CHN","China",false],
    ["Chinese lithium production","IND","India",false],
    ["Indian lithium exports","IND","India",true],
    ["IndiaMart lithium supplies","IND","India",false],
    ["American lithium supply announcement","USA","United States",true],
    ["U.S. cobalt sanctions","USA","United States",true],
    ["USGS publishes lithium data","USA","United States",false],
  ] as const)("matches scoped first-party title %s",(
    title,iso,name,expected,
  )=>{
    expect(originalHeadlineMentionsCountry(title,iso,name)).toBe(expected);
  });
  it("recognizes original Fed discount-rate policy as macro, not FX or mineral evidence",()=>{
    const genuineTitle="Minutes of the Board's discount rate meetings on August 17, September 9, and September 16, 2026";
    expect(matchesRequestedTopic(genuineTitle,"macro",["macro_risk"])).toBe(true);
    expect(matchesRequestedTopic(genuineTitle,"macro",["fx_external_risk"])).toBe(false);
    expect(matchesRequestedTopic(genuineTitle,"rare_earth",["critical_minerals"])).toBe(false);
  });
  it("admits only authenticated US Fed domestic discount-rate meeting releases for implicit US scope",()=>{
    const original="Minutes of the Board's discount rate meetings on August 17, September 9, and September 16, 2026";
    expect(originalPublisherMatchesCountry(original,"","USA","United States",
      "us_federal_reserve_original_publisher")).toBe(true);
    expect(originalPublisherMatchesCountry(original,"","GBR","United Kingdom",
      "us_federal_reserve_original_publisher")).toBe(false);
    expect(originalPublisherMatchesCountry(original,"","USA","United States",
      "uk_hmt_original_publisher")).toBe(false);
    expect(originalPublisherMatchesCountry("Federal Reserve Bank acquires overseas securities",
      "","USA","United States","us_federal_reserve_original_publisher")).toBe(false);
    expect(originalPublisherMatchesCountry(original,"","USA","",
      "us_federal_reserve_original_publisher")).toBe(false);
  });
  it("fails closed when no real country name has been established",()=>{
    expect(originalHeadlineMentionsCountry("Chinese lithium","CHN","")).toBe(false);
    expect(originalHeadlineMentionsCountry("Chinese lithium","CHN","https://example")).toBe(false);
    expect(originalHeadlineMentionsCountry("Chinese lithium","CHN/path","China")).toBe(false);
  });
});

function articleXml(title:string,url:string,atom:boolean){
  const date="2026-10-11T07:00:00Z";
  return atom
    ? '<entry><title>'+title+'</title><published>'+date+'</published><link rel="alternate" href="'+url+'"/></entry>'
    : '<item><title>'+title+'</title><pubDate>Sun, 11 Oct 2026 07:00:00 GMT</pubDate><link>'+url+'</link></item>';
}
describe("China lithium exact customer question — one shared bounded on-demand engine",()=>{
  it("retains original Chinese lithium issuer candidates, excludes unrelated metals, places and provider mirrors",async()=>{
    const requests:string[]=[];
    const fetchImpl=vi.fn(async(input:RequestInfo|URL,opts?:RequestInit)=>{
      const uri=new URL(String(input));requests.push(uri.href);
      expect(opts?.method).toBe("GET");
      expect(opts?.redirect).toBe("error");
      if(uri.hostname==="api.worldbank.org")
        return Response.json([{page:1,total:1},[{id:"CHN",name:"China"}]]);
      if(uri.hostname==="api.gdeltproject.org")
        return Response.json({articles:[]});
      if(uri.hostname==="www.gov.uk")
        return new Response('<feed>'+
          articleXml("Chinese lithium export licensing update",
            "https://www.gov.uk/government/news/chinese-lithium-export-licensing",true)+
          articleXml("Chinatown lithium trade celebration",
            "https://www.gov.uk/government/news/chinatown-trade-event",true)+
          articleXml("Chinese cobalt export licensing update",
            "https://www.gov.uk/government/news/chinese-cobalt-exports",true)+
          '</feed>');
      if(uri.hostname==="www.minister.industry.gov.au")
        return new Response('<rss><channel>'+
          articleXml("Chinese lithium supply agreement update",
            "https://www.minister.industry.gov.au/t-ayres/media/releases/chinese-lithium",false)+
          articleXml("Chilean lithium investment update",
            "https://www.minister.industry.gov.au/t-ayres/media/releases/chile-lithium",false)+
          '</channel></rss>');
      throw Error("UNEXPECTED_PROVIDER");
    }) as unknown as typeof fetch;
    const scoped={country_iso3:"CHN",categories:["rare_earth" as const],mineral:"lithium" as const};
    const privateProof=await discoverOnDemandForPrivateQualification(scoped,{fetchImpl,now});
    expect(privateProof.discovery.network_attempts).toBe(3);
    expect(privateProof.private_candidates).toHaveLength(2);
    expect(privateProof.private_candidates.map(x=>x.publisher_family).sort())
      .toEqual(["australian_industry_original_publisher","uk_dbt_original_publisher"]);
    expect(privateProof.private_candidates.every(x=>
      x.article_title.toLowerCase().includes("chinese lithium") &&
      x.first_party_article_url_verified &&
      !x.publisher_article_page_date_verified &&
      !x.independent_same_event_verified &&
      !x.derived_commercial_rights_verified &&
      !x.paid_delivery_allowed)).toBe(true);
    const safe=await discoverOnDemandGlobal(scoped,{fetchImpl,now});
    const serialized=JSON.stringify(safe);
    expect(safe.payable).toBe(false);
    expect(safe.raw_upstream_delivered).toBe(false);
    expect(safe.signed_derived_intelligence_created).toBe(false);
    expect(serialized).not.toContain("article_title");
    expect(serialized).not.toContain("Chinese lithium");
    expect(serialized).not.toContain("chinese-lithium-export-licensing");
    expect(requests).toHaveLength(6);
    expect(requests.some(url=>url.includes("/v2/country/CHN?"))).toBe(false);
    expect(requests.every(v=>v.startsWith("https://"))).toBe(true);
  });
});
