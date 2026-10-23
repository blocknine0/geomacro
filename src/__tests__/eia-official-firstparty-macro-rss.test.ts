import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {acceptedOriginalArticleLink,parseFirstPartyFeed,deriveStatelessSignals,
  type StatelessSourceSpec} from "../lib/stateless-intelligence-model";

const source:StatelessSourceSpec={
  id:"eia_press_macro",category:"macro",media:"rss",
  url:"https://www.eia.gov/rss/press_rss.xml",
  allowedHosts:["www.eia.gov"],credit:"U.S. Energy Information Administration",
};
const now=Date.parse("2026-10-18T12:30:00.000Z");
const article="https://www.eia.gov/pressroom/releases/press593.php";
const fixture=(clock:string,title="EIA expects a mixed picture for winter fuel costs this year",url=article)=>`
<rss version="2.0"><channel><item><title>${title}</title>
<link>${url}</link>${clock?`<pubDate>${clock}</pubDate>`:""}
<description>not customer evidence</description></item></channel></rss>`;

describe("EIA first-party press releases: derived-only original clock",()=>{
  it("pins official Press Releases RSS rather than Today-in-Energy, no GRI approval",()=>{
    const s=readFileSync("src/lib/stateless-public-intelligence.server.ts","utf8");
    expect(s).toContain('id: "eia_press_macro", category: "macro", media: "rss"');
    expect(s).toContain(source.url);
    expect(s).toContain('allowedHosts: ["www.eia.gov"], credit: "U.S. Energy Information Administration"');
    expect(s).not.toContain('id: "eia_press_macro", category: "rare_earth"');
  });
  it("accepts genuinely issuer-native dated macro release without added publication delay",()=>{
    const parsed=parseFirstPartyFeed(
      fixture("Sun, 18 Oct 2026 10:00:00 GMT"),source,now);
    expect(parsed.dated).toHaveLength(1);
    expect(parsed.metrics.native_clock_valid).toBe(1);
    const out=deriveStatelessSignals(parsed.dated,now);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("official_release_observed_unscored");
    expect(out[0].severity).toBeNull();
    expect(out[0].same_event_corrob_verified).toBe(false);
    expect(out[0].category).toBe("macro");
    expect(out[0].sources_credited).toContain("U.S. Energy Information Administration");
    expect(JSON.stringify(out)).not.toContain("press593.php");
    expect(JSON.stringify(out)).not.toContain("mixed picture for winter");
    const recent=parseFirstPartyFeed(fixture("Sun, 18 Oct 2026 12:25:00 GMT"),source,now);
    expect(deriveStatelessSignals(recent.dated,now)).toHaveLength(1);
  });
  it("rejects future/updated-only clocks, non-original or foreign press-room links",()=>{
    const changed=[
      fixture(""),
      fixture("Mon, 19 Oct 2026 10:00:00 GMT"),
      fixture("Sun, 18 Oct 2026 10:00:00 GMT",undefined as unknown as string,
        article.replace("www.eia.gov","mirror.example")),
      fixture("Sun, 18 Oct 2026 10:00:00 GMT",undefined as unknown as string,"https://www.eia.gov/pressroom/releases.php"),
      fixture("Sun, 18 Oct 2026 10:00:00 GMT",undefined as unknown as string,article+"?tracking=1"),
      fixture("Sun, 18 Oct 2026 10:00:00 GMT",undefined as unknown as string,"https://www.eia.gov/rss/press_rss.xml"),
      fixture("Sun, 18 Oct 2026 10:00:00 GMT","General staff activity and conference notice"),
    ];
    changed.forEach(row=>expect(parseFirstPartyFeed(row,source,now).dated).toHaveLength(0));
    expect(acceptedOriginalArticleLink(article,source)).toBe(article);
    expect(acceptedOriginalArticleLink("/pressroom/releases/press593.php",source))
      .toBe(article);
    expect(acceptedOriginalArticleLink("//www.eia.gov/pressroom/releases/press593.php",source)).toBeNull();
    expect(acceptedOriginalArticleLink("/pressroom/releases/press593.php?modified=1",source)).toBeNull();
    expect(acceptedOriginalArticleLink("/pressroom/releases/../releases/press593.php",source)).toBeNull();
    expect(acceptedOriginalArticleLink("/pressroom/releases/press593.php#top",source)).toBeNull();
    const relativeFeed=parseFirstPartyFeed(
      fixture("Sun, 18 Oct 2026 10:00:00 GMT",undefined as unknown as string,
        "/pressroom/releases/press593.php"),source,now);
    expect(relativeFeed.dated).toHaveLength(1);
    expect(relativeFeed.dated[0].articleUrl).toBe(article);
    const rss='<rss version="2.0"><channel><item><title>EIA expects fuel costs</title>'+
      '<link>'+article+'</link><updated>2026-10-18T10:00:00Z</updated></item></channel></rss>';
    expect(parseFirstPartyFeed(rss,source,now).dated).toHaveLength(0);
  });
});
