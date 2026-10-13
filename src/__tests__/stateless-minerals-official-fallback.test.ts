import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  australianNewsIndexCandidates, australianArticleMatchesOriginal,
} from "@/lib/stateless-australian-geoscience-original.server";
import {
  parseFirstPartyFeed, deriveStatelessSignals,
  type StatelessSourceSpec,
} from "@/lib/stateless-intelligence-model";

const NOW=Date.parse("2026-10-13T06:00:00Z");
const title="Delamerian project reveals new mineral and groundwater insights beneath south-eastern Australia";
const path="/news/delamerian-project-reveals-new-mineral-and-groundwater-insights-beneath-south-eastern-australia";
const sample=(href=path,day="18 September 2026")=>
  '<section><h3>'+title+'</h3><div><strong><span>'+day+'</span></strong></div>'+
  '<p>Geoscience Australia published a geological resource finding.</p>'+
  '<a href="'+href+'">Learn more</a></section>';
const rss:StatelessSourceSpec={
  id:"eu_representation_news",category:"rare_earth",media:"rss",
  url:"https://luxembourg.representation.ec.europa.eu/node/27/rss_en",
  allowedHosts:["luxembourg.representation.ec.europa.eu"],credit:null,
};
const original="https://luxembourg.representation.ec.europa.eu/actualites-et-evenements/actualites/commission-selects-46-new-strategic-projects-bolster-eus-supply-critical-raw-materials-2026-10-09_en";
const xml='<rss><channel><item><title>Commission selects 46 new Strategic Projects to bolster the EU supply of critical raw materials</title>'+
  '<link>'+original+'</link><pubDate>Fri, 09 Oct 2026 09:00:00 GMT</pubDate></item></channel></rss>';

describe("private official first-party mineral live fallback",()=>{
  it("binds Australian index original day, first-party article slug and separate original H1",()=>{
    const candidates=australianNewsIndexCandidates(sample(),NOW);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({category:"rare_earth",datePrecision:"day",
      publishedAt:"2026-09-18",credit:null,articleUrl:"https://www.ga.gov.au"+path});
    const article="<h1>"+title+"</h1><div>Page last updated: 25 September 2026</div>";
    expect(australianArticleMatchesOriginal(article,title)).toBe(true);
    expect(australianArticleMatchesOriginal("<h1>Unrelated official project</h1>",title)).toBe(false);
    const derived=deriveStatelessSignals(candidates,NOW);
    expect(derived).toHaveLength(1);
    expect(derived[0].title).toMatch(/^Geomacro finds /);
    expect(derived[0].topic).toBe("mineral exploration and production");
    expect(derived[0].date_precision).toBe("day");
    expect(derived[0].published_at).toBe("2026-09-18");
    expect(derived[0].severity).toBeNull();
    expect(JSON.stringify(derived)).not.toContain("ga.gov.au");
    expect(JSON.stringify(derived)).not.toContain("Delamerian");
  });
  it("never admits off-host, search/fragment, missing publisher date, stale, future or spoofed links",()=>{
    for(const href of [
      "https://attacker.example.com"+path,
      "//attacker.example.com"+path,
      path+"?ref=redirect",
      path+"#from-feed",
      "/news/bad",
    ])expect(australianNewsIndexCandidates(sample(href),NOW)).toHaveLength(0);
    for(const day of ["", "14 August 2026","14 November 2026", "31 September 2026"])
      expect(australianNewsIndexCandidates(sample(path,day),NOW)).toHaveLength(0);
    expect(australianNewsIndexCandidates(sample().repeat(3000),NOW)).toHaveLength(0);
    expect(australianNewsIndexCandidates(sample().replace(title,"National awards ceremony"),NOW)).toHaveLength(0);
    expect(australianNewsIndexCandidates(sample(path,"15 October 2026"),NOW)).toHaveLength(0);
  });
  it("accepts a separate EU first-party RSS-native original clock without response/updated/fetch clocks",()=>{
    const good=parseFirstPartyFeed(xml,rss,NOW);
    expect(good.dated).toHaveLength(1);
    const derived=deriveStatelessSignals(good.dated,NOW);
    expect(derived).toHaveLength(1);
    expect(derived[0].published_at).toBe("2026-10-09T09:00:00.000Z");
    expect(derived[0].topic).toBe("critical-minerals policy");
    expect(JSON.stringify(derived)).not.toContain("luxembourg.representation");
    const updated=xml.replace(/<pubDate>[^<]+<\/pubDate>/u,"<lastBuildDate>Tue, 13 Oct 2026 05:00:00 GMT</lastBuildDate>");
    expect(parseFirstPartyFeed(updated,rss,NOW).dated).toHaveLength(0);
    expect(parseFirstPartyFeed(xml.replace(original,"https://malicious.invalid/article"),rss,NOW).dated).toHaveLength(0);
  });
  it("replaces the two proven-dead source transports without global risk or wallet changes",()=>{
    const src=readFileSync("src/lib/stateless-public-intelligence.server.ts","utf8");
    expect(src).toContain('id: "au_geoscience"');
    expect(src).toContain('id: "eu_representation_news"');
    expect(src).not.toContain('id: "au_industry"');
    expect(src).not.toContain('id: "usgs_minerals"');
    expect(src).toContain("australianArticleMatchesOriginal(body, candidate.title)");
    expect(src).not.toContain("SUPABASE_DB_URL");
  });
});