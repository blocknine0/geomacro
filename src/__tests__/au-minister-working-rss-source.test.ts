import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {
  acceptedOriginalArticleLink, deriveStatelessSignals,
  parseFirstPartyFeed, type StatelessSourceSpec,
} from "@/lib/stateless-intelligence-model";

const uri="https://www.minister.industry.gov.au/t-ayres/media/construction-starts-arafura-rare-earths-project";
const now=Date.parse("2026-10-13T09:40:00.000Z");
const issued=Date.parse("2026-10-08T04:15:00.000Z");
const feed:StatelessSourceSpec={
  id:"au_industry_minister",category:"rare_earth",media:"rss",
  url:"https://www.minister.industry.gov.au/feed/t-ayres/rss.xml",
  allowedHosts:["www.minister.industry.gov.au"],credit:null,
};
function xml(title:string,link=uri,pub="Thu, 08 Oct 2026 04:15:00 GMT"){
  return '<rss version="2.0"><channel><item><title>'+title+
    "</title><link>"+link+"</link><pubDate>"+pub+
    "</pubDate></item></channel></rss>";
}
const title="Construction starts on Arafura Rare Earths Project";
describe("Australian ministerial RSS reuses an actually working original source",()=>{
  it("admits a first-party native-dated rare-earth media release",()=>{
    const result=parseFirstPartyFeed(xml(title),feed,now);
    expect(result.metrics).toMatchObject({
      seen:1,relevant:1,original_link_valid:1,native_clock_valid:1,
    });
    expect(result.dated).toHaveLength(1);
    expect(result.dated[0].publishedAt).toBe(new Date(issued).toISOString());
    expect(result.dated[0].articleUrl).toBe(uri);
    const signals=deriveStatelessSignals(result.dated,now);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      category:"rare_earth",date_precision:"exact",severity:null,
      same_event_corrob_verified:false,
      status:"official_release_observed_unscored",
    });
    expect(JSON.stringify(signals)).not.toContain(uri);
    expect(JSON.stringify(signals)).not.toContain(title);
    expect(JSON.stringify(signals)).not.toContain("www.minister.industry.gov.au");
  });
  it("retains precisely 15-minute website delay and cannot invent publication clock",()=>{
    const r=parseFirstPartyFeed(xml(title),feed,now);
    expect(deriveStatelessSignals(r.dated,issued+14*60_000)).toHaveLength(0);
    expect(deriveStatelessSignals(r.dated,issued+15*60_000)).toHaveLength(1);
    for(const pub of ["","2026-10-08","Tue, 13 Oct 2026 09:40:00"]) {
      const bad=parseFirstPartyFeed(xml(title,uri,pub),feed,now);
      expect(bad.dated).toHaveLength(0);
    }
    expect(deriveStatelessSignals(r.dated,issued+31*86400_000)).toHaveLength(0);
  });
  it("rejects arbitrary destination URLs, queries, copied feeds and unrelated content",()=>{
    const attacks=[
      uri.replace("www.minister.industry.gov.au","www.minister.industry.gov.au.bad.invalid"),
      uri.replace("/t-ayres/","/king/"),
      uri.replace("/media/","/subscribe/"),
      uri+"?utm_source=track",
      uri+"#article",
      "http://www.minister.industry.gov.au/t-ayres/media/construction-starts-arafura-rare-earths-project",
      "https://www.minister.industry.gov.au/king/media/construction-starts-arafura-rare-earths-project",
    ];
    for(const target of attacks)expect(acceptedOriginalArticleLink(target,feed)).toBeNull();
    const fakeTitle="Speech to the science and arts award winners";
    expect(parseFirstPartyFeed(xml(fakeTitle),feed,now).dated).toHaveLength(0);
  });
  it("keeps distinct verified original publishers private and does not change paid authority",()=>{
    const website=readFileSync("src/lib/stateless-public-intelligence.server.ts","utf8");
    const source=readFileSync("scripts/ops/probe-expanded-official-source-mesh.mjs","utf8");
    expect(website).toContain('id: "au_industry_minister"');
    expect(website).toContain("https://www.minister.industry.gov.au/feed/t-ayres/rss.xml");
    expect(source).toContain('id:"australia_industry_minister_original_rss_review"');
    expect(source).toContain("https://www.minister.industry.gov.au/feed/t-ayres/rss.xml");
    expect(website).not.toContain('id: "au_resource_exports"');
    expect(website).not.toContain('id: "au_resource_releases"');
    expect(website).not.toContain('id: "au_resources_minerals_index"');
    expect(website).not.toContain("SUPABASE_DB_URL");
  });
});
