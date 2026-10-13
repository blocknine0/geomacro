import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {
  parseFirstPartyFeed,acceptedOriginalArticleLink,deriveStatelessSignals,
  type StatelessSourceSpec,
} from "@/lib/stateless-intelligence-model";

const now=Date.parse("2026-10-13T10:00:00Z");
const native="Thu, 08 Oct 2026 12:30:00 GMT";
const URLS={
  bls_cpi:"https://www.bls.gov/news.release/cpi.nr0.htm",
  bls_employment:"https://www.bls.gov/news.release/empsit.nr0.htm",
  bls_external_prices:"https://www.bls.gov/news.release/ximpim.nr0.htm",
};
const config={
  bls_cpi:{title:"Consumer Price Index Report for September",topic:"inflation"},
  bls_employment:{title:"Employment Situation for September",topic:"labour"},
  bls_external_prices:{title:"U.S. Import and Export Price Indexes",topic:"prices"},
};
const input=(source:keyof typeof URLS):StatelessSourceSpec=>({
  id:source,category:"macro",media:"rss",
  url:"https://www.bls.gov/feed/"+({bls_cpi:"cpi.rss",
    bls_employment:"empsit.rss",bls_external_prices:"ximpim.rss"}[source]),
  allowedHosts:["www.bls.gov"],credit:null,
});
const xml=(title:string,link:string,published=native)=>
  '<rss version="2.0"><channel><item><title>'+title+
    '</title><link>'+link+'</link><pubDate>'+published+
    '</pubDate></item></channel></rss>';
describe("BLS original-publisher macro RSS fail-closed ingestion",()=>{
  for(const family of Object.keys(URLS) as (keyof typeof URLS)[]){
    it("accepts only a native-published original "+family,()=>{
      const source=input(family), title=config[family].title;
      const result=parseFirstPartyFeed(xml(title,URLS[family]),source,now);
      expect(result.metrics).toMatchObject({
        seen:1,relevant:1,original_link_valid:1,native_clock_valid:1,
      });
      expect(result.dated).toHaveLength(1);
      const signals=deriveStatelessSignals(result.dated,now);
      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject({
        category:"macro",severity:null,date_precision:"exact",
        same_event_corrob_verified:false,status:"official_release_observed_unscored",
      });
      expect(JSON.stringify(signals)).not.toContain(URLS[family]);
      expect(JSON.stringify(signals)).not.toContain(title);
      expect(JSON.stringify(signals)).not.toContain("bls.gov");
    });
    it("denies links outside the pinned source family "+family,()=>{
      const source=input(family),good=URLS[family];
      expect(acceptedOriginalArticleLink(good,source)).toBe(good);
      const attacks=[
        good.replace("www.bls.gov","www.bls.gov.attacker.invalid"),
        good.replace("/news.release/","/feed/"),
        good.replace(".nr0.htm",".txt"),
        good+"?date=today",
        good+"#source",
        good.replace("https:","http:"),
      ];
      for(const link of attacks)expect(acceptedOriginalArticleLink(link,source)).toBeNull();
      const wrong=Object.values(URLS).find(v=>v!==good)!;
      expect(acceptedOriginalArticleLink(wrong,source)).toBeNull();
    });
    it("never makes stale, undated, or last-updated headlines fresh "+family,()=>{
      const source=input(family),title=config[family].title;
      for(const wrong of ["", "2026-10-08","2026-10-08T12:30:00"]) {
        const parsed=parseFirstPartyFeed(xml(title,URLS[family],wrong),source,now);
        expect(parsed.dated).toHaveLength(0);
      }
      const dated=parseFirstPartyFeed(xml(title,URLS[family]),source,now);
      const at=Date.parse("2026-10-08T12:30:00Z");
      expect(deriveStatelessSignals(dated.dated,at+14*60_000)).toHaveLength(0);
      expect(deriveStatelessSignals(dated.dated,at+15*60_000)).toHaveLength(1);
      expect(deriveStatelessSignals(dated.dated,at+31*86_400_000)).toHaveLength(0);
    });
  }
  it("separately registers three true government feeds with no current-score promotion",()=>{
    const text=readFileSync("src/lib/stateless-public-intelligence.server.ts","utf8");
    for(const feed of ["cpi.rss","empsit.rss","ximpim.rss"])
      expect(text).toContain("https://www.bls.gov/feed/"+feed);
    expect(text).not.toContain("SUPABASE_DB_URL");
    expect(text).not.toContain("settleCoinbase");
  });
});
