import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseFirstPartyFeed, acceptedOriginalArticleLink, deriveStatelessSignals,
  type StatelessSourceSpec,
} from "@/lib/stateless-intelligence-model";

const fixedClock = "Thu, 08 Oct 2026 12:30:00 GMT";
const date = Date.parse("2026-10-13T14:00:00Z");
const bls = [
  ["bls_cpi","cpi","Consumer Price Index for All Urban Consumers rises in September"],
  ["bls_employment","empsit","The Employment Situation in September for workers"],
  ["bls_external_prices","ximpim","U.S. Import and Export Price Indexes for September"],
] as const;
const spec = (id:string, category:"macro"|"rare_earth"="macro"): StatelessSourceSpec => ({
  id,category,media:"rss",credit:null,
  url:id==="au_industry_minister"
    ?"https://www.minister.industry.gov.au/feed/t-ayres/rss.xml"
    :`https://www.bls.gov/feed/${id==="bls_cpi"?"cpi":id==="bls_employment"?"empsit":"ximpim"}.rss`,
  allowedHosts:id==="au_industry_minister"?["www.minister.industry.gov.au"]:["www.bls.gov"],
});
const item=(title:string,link:string,when=fixedClock)=>
  `<rss version="2.0"><channel><item><title>${title}</title><link>${link}</link><pubDate>${when}</pubDate></item></channel></rss>`;
describe("independent first-party publisher feeds, strictly unscored",()=>{
  for(const [id,family,title] of bls){
    it("accepts BLS "+id+" only with its own original dated release",()=>{
      const source=spec(id);
      const url=`https://www.bls.gov/news.release/${family}.nr0.htm`;
      const result=parseFirstPartyFeed(item(title,url),source,date);
      expect(result.metrics).toMatchObject({seen:1,relevant:1,original_link_valid:1,native_clock_valid:1});
      expect(result.dated).toHaveLength(1);
      const signals=deriveStatelessSignals(result.dated,date);
      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject({category:"macro",severity:null,same_event_corrob_verified:false,status:"official_release_observed_unscored"});
      expect(JSON.stringify(signals)).not.toContain(title);
      expect(JSON.stringify(signals)).not.toContain("bls.gov");
      const bad=[
        url.replace("www.bls.gov","www.bls.gov.bad.invalid"),
        url.replace("/news.release/","/feed/"),
        url.replace(".nr0.htm",".txt"),url+"?id=1",url+"#p",
        url.replace("https:","http:"),
        url.replace(family+".nr0","other.nr0"),
      ];
      for(const link of bad)expect(acceptedOriginalArticleLink(link,source)).toBeNull();
      for(const raw of ["","2026-10-08","2026-10-08T12:30:00"]){
        expect(parseFirstPartyFeed(item(title,url,raw),source,date).dated).toHaveLength(0);
      }
      const at=Date.parse("2026-10-08T12:30:00Z");
      expect(deriveStatelessSignals(result.dated,at+14*60_000)).toHaveLength(0);
      expect(deriveStatelessSignals(result.dated,at+15*60_000)).toHaveLength(1);
      expect(deriveStatelessSignals(result.dated,at+31*86_400_000)).toHaveLength(0);
    });
  }
  it("accepts only the previously independently live-verified Ayres original article",()=>{
    const source=spec("au_industry_minister","rare_earth");
    const title="Construction starts on Arafura Rare Earths Project";
    const url="https://www.minister.industry.gov.au/t-ayres/media/construction-starts-arafura-rare-earths-project";
    const parsed=parseFirstPartyFeed(item(title,url),source,date);
    expect(parsed.metrics).toMatchObject({seen:1,relevant:1,original_link_valid:1,native_clock_valid:1});
    expect(parsed.dated).toHaveLength(1);
    const signal=deriveStatelessSignals(parsed.dated,date);
    expect(signal[0]).toMatchObject({category:"rare_earth",severity:null,status:"official_release_observed_unscored"});
    expect(JSON.stringify(signal)).not.toContain(title);
    expect(JSON.stringify(signal)).not.toContain("minister.industry.gov.au");
    for(const u of [
      url.replace("/t-ayres/","/king/"),url.replace("/media/","/subscribe/"),
      url+"?revised=1",url+"#latest",
      url.replace("www.minister","not-minister"),
    ])expect(acceptedOriginalArticleLink(u,source)).toBeNull();
  });
  it("keeps sources stateless and cannot promote paid signing without review",()=>{
    const s=readFileSync("src/lib/stateless-public-intelligence.server.ts","utf8");
    for(const path of ["cpi.rss","empsit.rss","ximpim.rss"])expect(s).toContain("https://www.bls.gov/feed/"+path);
    expect(s).toContain("https://www.minister.industry.gov.au/feed/t-ayres/rss.xml");
    expect(s).not.toContain("SUPABASE_DB_URL");
    expect(s).not.toContain("settleCoinbase");
  });
});
