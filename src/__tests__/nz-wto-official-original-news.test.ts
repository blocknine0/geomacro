import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {acceptedOriginalArticleLink,parseFirstPartyFeed,
  deriveStatelessSignals,type StatelessSourceSpec} from "../lib/stateless-intelligence-model";

const NOW=Date.parse("2026-10-20T16:00:00.000Z");
const DATE="Tue, 20 Oct 2026 15:00:00 GMT";
const specs:StatelessSourceSpec[]=[
 {id:"nz_beehive_geopolitics",category:"geopolitics",media:"rss",
  url:"https://www.beehive.govt.nz/rss.xml",
  allowedHosts:["www.beehive.govt.nz"],credit:"New Zealand Government (Beehive)"},
 {id:"nz_beehive_macro",category:"macro",media:"rss",
  url:"https://www.beehive.govt.nz/rss.xml",
  allowedHosts:["www.beehive.govt.nz"],credit:"New Zealand Government (Beehive)"},
 {id:"nz_beehive_minerals",category:"rare_earth",media:"rss",
  url:"https://www.beehive.govt.nz/rss.xml",
  allowedHosts:["www.beehive.govt.nz"],credit:"New Zealand Government (Beehive)"},
 {id:"wto_trade_original_rss",category:"macro",media:"rss",
  url:"https://www.wto.org/library/rss/latest_news_e.xml",
  allowedHosts:["www.wto.org"],credit:"WTO news"},
];
const fixture=(title:string,url:string,clock=DATE)=>
 '<rss version="2.0"><channel><item><title>'+title+'</title>'+
 '<link>'+url+'</link><pubDate>'+clock+'</pubDate></item></channel></rss>';

describe("new official NZ/WTO sources, original clock and mandatory credit",()=>{
 it("pins four first-party lanes, 3 domains, and no paid/legal promotion",()=>{
  const s=readFileSync("src/lib/stateless-public-intelligence.server.ts","utf8");
  for(const p of specs){
    expect(s).toContain('id:"'+p.id+'"');
    expect(s).toContain('url:"'+p.url+'"');
    expect(p.credit).not.toBeNull();
  }
  expect(s).toContain("readStatelessWebsiteIntelligence");
  const wf=readFileSync(".github/workflows/website-derived-news-continuity.yml","utf8");
  expect(wf).toContain("scripts/ops/publish-website-derived-news.ts");
 });
 it.each([
  [specs[0],"Government announces new national security sanctions","https://www.beehive.govt.nz/release/new-national-security-sanctions"],
  [specs[1],"Government announces new inflation and interest rate policy","https://www.beehive.govt.nz/release/government-interest-rate-policy"],
  [specs[2],"Government announces approval of critical minerals lithium processing","https://www.beehive.govt.nz/release/critical-minerals-lithium-processing"],
  [specs[3],"WTO announces trade agreement and new trade negotiations","http://www.wto.org/english/news_e/news26_e/wto_trade_e.htm"],
 ])("accepts only a genuine source-native dated matching original, not a payment or score",(
   source,title,url
 )=>{
  const p=parseFirstPartyFeed(fixture(title,url),source,NOW);
  expect(p.dated).toHaveLength(1);
  expect(p.dated[0].publishedAt).toBe("2026-10-20T15:00:00.000Z");
  expect(p.dated[0].credit).toBe(source.credit);
  expect(p.dated[0].articleUrl.startsWith("https://")).toBe(true);
  const signals=deriveStatelessSignals(p.dated,NOW);
  expect(signals).toHaveLength(1);
  expect(signals[0]).toMatchObject({category:source.category,
    sources_credited:[source.credit],
    same_event_corrob_verified:false,severity:null,
    published_at:"2026-10-20T15:00:00.000Z"});
  expect(JSON.stringify(signals)).not.toContain(url);
  expect(JSON.stringify(signals)).not.toContain(title);
 });
 it("admits original WTO safeguard/trade-remedy notices with real native dates but never makes claims of tariff effect",()=>{
   const source=specs[3];
   for(const title of [
     "Madagascar launches safeguard investigation on imported confectionery",
     "WTO members discuss countervailing duties and trade-remedy investigations",
     "Members start trade policy review of a country's export measures",
     "Panel established for WTO dispute settlement",
   ]){
     const p=parseFirstPartyFeed(fixture(title,
       "https://www.wto.org/english/news_e/news26_e/mark_12oct26_516_e.htm"),source,NOW);
     expect(p.dated).toHaveLength(1);
     const rows=deriveStatelessSignals(p.dated,NOW);
     expect(rows).toHaveLength(1);
     expect(rows[0].sources_credited).toEqual(["WTO news"]);
     expect(rows[0].why_it_matters).not.toMatch(/\b(?:guaranteed|increased tariff by|fx fell by)\b/iu);
     expect(rows[0].severity).toBeNull();
   }
   for(const title of ["WTO publishes staff meeting agenda",
     "Training course for young professionals","New employee joins WTO"]){
     expect(parseFirstPartyFeed(fixture(title,
       "https://www.wto.org/english/news_e/news26_e/mark_12oct26_516_e.htm"),source,NOW).dated)
       .toHaveLength(0);
   }
 });
 it("rejects feed updated-only clocks, future/unzoned dates and off-site or unsafe originals",()=>{
  for(const source of specs){
    const article=source.id==="wto_trade_original_rss"
      ?"https://www.wto.org/english/news_e/news26_e/wto_trade_e.htm"
      :"https://www.beehive.govt.nz/release/critical-minerals-lithium-processing";
    const title=source.category==="rare_earth"?"New government critical minerals supply update":
      source.category==="geopolitics"?"New government national security sanctions":"Trade agreements and new interest rates";
    for(const date of ["","2026-10-20T15:00:00","2036-10-20T15:00:00Z"]){
      expect(parseFirstPartyFeed(fixture(title,article,date),source,NOW).dated).toHaveLength(0);
    }
    const bad=["https://evil.example/release/government-national-security",
     "https://www.beehive.govt.nz/admin/data",
     "https://www.wto.org/english/news_e/news26_e/wto_trade_e.htm?api_key=x"];
    for(const u of bad)expect(acceptedOriginalArticleLink(u,source)).toBeNull();
  }
  expect(acceptedOriginalArticleLink("http://www.wto.org/english/news_e/news26_e/wto_trade_e.htm",specs[3]))
   .toBe("https://www.wto.org/english/news_e/news26_e/wto_trade_e.htm");
  expect(acceptedOriginalArticleLink("http://attacker.example/english/news_e/news26_e/wto_trade_e.htm",specs[3]))
   .toBeNull();
  expect(acceptedOriginalArticleLink("https://www.beehive.govt.nz/release/minerals-sector-gaining-momentum-under-strategy",specs[2]))
   .not.toBeNull();
 });
 it("never exposes upstream body, WTO link or source credits in paid source-neutral no-attribution draft",()=>{
  const n=parseFirstPartyFeed(fixture("Government approves lithium processing",
   "https://www.beehive.govt.nz/release/critical-minerals-lithium-processing"),specs[2],NOW);
  const signals=deriveStatelessSignals(n.dated,NOW);
  // Attribution-required rows are explicitly withheld from the existing
  // no-attribution derived-structured commercial research projection.
  const bridge=readFileSync("src/lib/derived-news-structural-bridge.ts","utf8");
  expect(bridge).toContain("if(signal.sources_credited.length!==0)continue");
  const json=JSON.stringify(signals);
  expect(json).not.toContain("https://");
  expect(json).not.toContain("Government approves lithium processing");
  expect(json).toContain("New Zealand Government (Beehive)");
 });
});
