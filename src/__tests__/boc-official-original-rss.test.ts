import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {acceptedOriginalArticleLink,parseFirstPartyFeed,deriveStatelessSignals,
  type StatelessSourceSpec} from "../lib/stateless-intelligence-model";

const config=readFileSync("src/lib/stateless-public-intelligence.server.ts","utf8");
const source:StatelessSourceSpec={
  id:"boc_policy_press",category:"macro",media:"rss",
  url:"https://www.bankofcanada.ca/content_type/press-releases/feed/",
  allowedHosts:["www.bankofcanada.ca"],credit:"Bank of Canada",
};
const now=Date.parse("2026-10-18T12:30:00Z");
const url="https://www.bankofcanada.ca/2026/10/fad-press-release-2026-10-18/";
const item=(published:string,link=url,title="Bank of Canada maintains its policy rate")=>
  '<rss version="2.0"><channel><item><title>'+title+'</title><link>'+
  link+'</link>'+(published?'<pubDate>'+published+'</pubDate>':'')+
  '<description>original publisher observation only</description></item></channel></rss>';

describe("first-party Bank of Canada original policy RSS discovery",()=>{
  it("registers only official publisher feed; not a licensed commercial GRO",()=>{
    expect(config).toContain('id: "boc_policy_press", category: "macro", media: "rss"');
    expect(config).toContain(source.url);
    expect(config).toContain('allowedHosts: ["www.bankofcanada.ca"], credit: "Bank of Canada"');
    expect(config).not.toContain('boc_policy_press", category: "geopolitics"');
  });
  it("derives unscored macro intelligence from native RSS pubDate with 15 minute delay",()=>{
    const parsed=parseFirstPartyFeed(item("Sun, 18 Oct 2026 10:00:00 GMT"),source,now);
    expect(parsed.metrics.original_link_valid).toBe(1);
    expect(parsed.metrics.native_clock_valid).toBe(1);
    expect(parsed.dated).toHaveLength(1);
    const signals=deriveStatelessSignals(parsed.dated,now);
    expect(signals).toHaveLength(1);
    expect(signals[0].status).toBe("official_release_observed_unscored");
    expect(signals[0].category).toBe("macro");
    expect(signals[0].severity).toBeNull();
    expect(signals[0].sources_credited).toContain("Bank of Canada");
    expect(JSON.stringify(signals)).not.toContain("bankofcanada.ca");
    expect(JSON.stringify(signals)).not.toContain("maintains its policy rate");
    const recent=parseFirstPartyFeed(item("Sun, 18 Oct 2026 12:25:00 GMT"),source,now);
    expect(deriveStatelessSignals(recent.dated,now)).toHaveLength(0);
  });
  it("rejects updated-only or future-clock feed entries and off-issuer original paths",()=>{
    for(const xml of [
      item(""),
      item("Mon, 19 Oct 2026 10:00:00 GMT"),
      item("Sun, 18 Oct 2026 10:00:00 GMT",url.replace("www.bankofcanada.ca","imposter.example")),
      item("Sun, 18 Oct 2026 10:00:00 GMT","https://www.bankofcanada.ca/rss-feeds/"),
      item("Sun, 18 Oct 2026 10:00:00 GMT",url+"?update=1"),
      item("Sun, 18 Oct 2026 10:00:00 GMT","https://www.bankofcanada.ca//2026/10/fake/"),
      item("Sun, 18 Oct 2026 10:00:00 GMT",url,"Governor speaks about educational activities"),
    ]){
      expect(parseFirstPartyFeed(xml,source,now).dated).toHaveLength(0);
    }
    expect(acceptedOriginalArticleLink(url,source)).toBe(url);
  });
  it("does not confuse RSS updated/transport time with original article publication",()=>{
    const xml='<rss version="2.0"><channel><item><title>Bank of Canada adjusts policy rate</title>'+
      '<link>'+url+'</link><updated>2026-10-18T10:00:00Z</updated></item></channel></rss>';
    expect(parseFirstPartyFeed(xml,source,now).dated).toHaveLength(0);
    expect(parseFirstPartyFeed(xml,source,now).undatedGov).toHaveLength(0);
  });
});
