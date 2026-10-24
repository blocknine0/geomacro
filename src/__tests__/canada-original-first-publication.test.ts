import { describe,it,expect } from "vitest";
import { canadaOriginalPublicationDay, canadaOriginalMineralsTopic } from "@/lib/stateless-canada-original.server";
import { deriveStatelessSignals, parseFirstPartyFeed, type StatelessSourceSpec }
  from "@/lib/stateless-intelligence-model";
import { verifyDerivedStory } from "../../workers/control-plane/src/website-derived-intelligence.mjs";

const news="https://www.canada.ca/en/natural-resources-canada/news/2026/10/critical-minerals-funding-announcement.html";
const foreign="https://www.canada.ca/en/global-affairs/news/2026/10/joint-statement-on-iran-october-12.html";
const NOW=Date.parse("2026-10-13T20:00:00.000Z");
const html=(issued: string, title: string, modified="2026-10-13")=>
  '<html><head><meta name="dcterms.issued" title="W3CDTF" content="'+issued+'"/>' +
  '<meta name="dcterms.modified" content="'+modified+'"/></head><body><h1>'+title+'</h1></body></html>';
const source:StatelessSourceSpec={id:"nrcan_releases",category:"rare_earth",
  url:"https://api.io.canada.ca/io-server/gc/news/en/v2?format=atom",
  media:"atom",allowedHosts:["www.canada.ca"],credit:"Natural Resources Canada",
  canadaOriginalPage:true};
const entry='<feed><entry><title>Canada critical minerals funding announcement</title>' +
  '<updated>2026-10-13T19:59:00Z</updated>' +
  '<link rel="alternate" href="'+news+'"/></entry></feed>';

describe("Canada official original publication day; never updated/crawl timestamp",()=>{
  it("accepts ONLY first-party original issued or datePublished with matching article path and title",()=>{
    expect(canadaOriginalPublicationDay(html("2026-10-09","Canada critical minerals funding announcement"),news,
      "Canada critical minerals funding announcement",NOW)).toBe("2026-10-09");
    expect(canadaOriginalPublicationDay(html("2026-10-12","Canada critical minerals funding announcement"),news,
      "Canada critical minerals funding announcement",NOW)).toBe("2026-10-12");
    const published='<html><head><meta property="article:published_time" content="2026-10-12T12:00:00Z"/>'+
      '</head><body><h1>Canada critical minerals funding announcement</h1></body></html>';
    expect(canadaOriginalPublicationDay(published,news,"Canada critical minerals funding announcement",NOW)).toBe("2026-10-12");
  });
  it("accepts headline-confirmed first-party NewsArticle JSON-LD original date, never modified time",()=>{
    const doc=(dateField:string,kind="NewsArticle",headline="Canada critical minerals funding announcement")=>
      '<html><head><script type="application/ld+json">'+
      JSON.stringify({"@type":kind,"headline":headline,[dateField]:"2026-10-12"})+
      '</script></head><body><h1>Canada critical minerals funding announcement</h1></body></html>';
    expect(canadaOriginalPublicationDay(doc("datePublished"),news,
      "Canada critical minerals funding announcement",NOW)).toBe("2026-10-12");
    expect(canadaOriginalPublicationDay(doc("dateModified"),news,
      "Canada critical minerals funding announcement",NOW)).toBeNull();
    expect(canadaOriginalPublicationDay(doc("datePublished","WebSite"),news,
      "Canada critical minerals funding announcement",NOW)).toBeNull();
    expect(canadaOriginalPublicationDay(doc("datePublished","NewsArticle","Unrelated forecast"),news,
      "Canada critical minerals funding announcement",NOW)).toBeNull();
    const conflicting=doc("datePublished")
      .replace("</head>",'<meta name="dcterms.issued" content="2026-10-11"/></head>');
    expect(canadaOriginalPublicationDay(conflicting,news,
      "Canada critical minerals funding announcement",NOW)).toBeNull();
  });
  it("fails closed on dcterms.modified only, path mismatch, unrelated page heading or contradictory original dates",()=>{
    const onlyModified='<html><head><meta name="dcterms.modified" content="2026-10-12"/></head>'+
      '<body><h1>Canada critical minerals funding announcement</h1></body></html>';
    expect(canadaOriginalPublicationDay(onlyModified,news,"Canada critical minerals funding announcement",NOW)).toBeNull();
    expect(canadaOriginalPublicationDay(html("2026-09-29","Canada critical minerals funding announcement"),
      news,"Canada critical minerals funding announcement",NOW)).toBeNull();
    expect(canadaOriginalPublicationDay(html("2026-10-12","Unrelated weather notice"),
      news,"Canada critical minerals funding announcement",NOW)).toBeNull();
    expect(canadaOriginalPublicationDay(html("2026-10-12","Canada critical minerals funding announcement")
      .replace("</head>",'<meta property="article:published_time" content="2026-10-11"/></head>'),
      news,"Canada critical minerals funding announcement",NOW)).toBeNull();
    expect(canadaOriginalPublicationDay(html("2026-10-12","Canada critical minerals funding announcement"),
      "https://attacker.example.com/en/natural-resources-canada/news/2026/10/critical-minerals-funding-announcement.html",
      "Canada critical minerals funding announcement",NOW)).toBeNull();
  });
  it("uses feed entry metadata only for the title and admitted link, never as date",()=>{
    const parsed=parseFirstPartyFeed(entry,source,NOW);
    expect(parsed.dated).toEqual([]);
    expect(parsed.undatedGov).toEqual([{title:"Canada critical minerals funding announcement",articleUrl:news}]);
    expect(parsed.metrics.undated_original).toBe(1);
    const candidate={sourceId:"nrcan_releases",category:"rare_earth" as const,
      title:"Canada critical minerals funding announcement",articleUrl:news,
      publishedAt:"2026-10-12",datePrecision:"day" as const,credit:"Natural Resources Canada"};
    expect(deriveStatelessSignals([candidate],Date.parse("2026-10-13T11:59:59.000Z"))).toEqual([]);
    const found=deriveStatelessSignals([candidate],Date.parse("2026-10-13T12:00:00.000Z"));
    expect(found).toHaveLength(1);
    expect(found[0].date_precision).toBe("day");
    expect(found[0].severity).toBeNull();
    expect(JSON.stringify(found)).not.toContain(news);
  });
  it("permits legitimate original-day geopolitical article after embargo but never raw article publication",()=>{
    const candidate={sourceId:"canada_foreign_statements",category:"geopolitics" as const,
      title:"Canada joint statement on Iran October 12",articleUrl:foreign,
      publishedAt:"2026-10-12",datePrecision:"day" as const,credit:"Global Affairs Canada"};
    expect(canadaOriginalPublicationDay(html("2026-10-12","Canada joint statement on Iran October 12"),
      foreign,candidate.title,NOW)).toBe("2026-10-12");
    const findings=deriveStatelessSignals([candidate],NOW);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe("geopolitics");
    expect(verifyDerivedStory(findings[0],NOW)).toBe(true);
  });
});

describe("NRCan same-original article body topical evidence",()=>{
 const url=news;
 const title="Canada and Türkiye joint statement on energy cooperation";
 const body=(text:string,date="2026-10-12")=>html(date,title).replace('</body>',
   '<main><div id="news-release-container"><p>'+text+'</p><div class="news-tags"></div></div></main></body>');
 it("recovers a minerals topic when the original headline has no minerals word",()=>{
  const doc=body('The Ministers agreed to strengthen minerals supply chains through bilateral trade and investment.');
  expect(canadaOriginalMineralsTopic(doc,url,title,NOW)).toBe('critical-minerals policy');
  const xml='<feed><entry><title>'+title+'</title><updated>2026-10-13T19:59:00Z</updated><link href="'+url+'"/></entry></feed>';
  const parsed=parseFirstPartyFeed(xml,source,NOW);
  expect(parsed.dated).toEqual([]);expect(parsed.undatedGov).toHaveLength(1);
  const result=deriveStatelessSignals([{title,articleUrl:url,publishedAt:'2026-10-12',datePrecision:'day',
   category:'rare_earth',sourceId:'nrcan_releases',credit:'Natural Resources Canada',
   originalBodyTopic:canadaOriginalMineralsTopic(doc,url,title,NOW)!}],NOW);
  expect(result).toHaveLength(1);
  expect(result[0].topic).toBe('critical-minerals policy');
  expect(result[0].status).toBe('official_release_observed_unscored');
  expect(result[0].published_at).toBe('2026-10-12');
  expect(result[0].severity).toBeNull();expect(verifyDerivedStory(result[0],NOW)).toBe(true);
  expect(JSON.stringify(result)).not.toContain('The Ministers agreed');
  expect(JSON.stringify(result)).not.toContain(url);
 });
 it("never accepts navigation, related links, forestry-only body, missing date or mismatched headline",()=>{
  for(const doc of [body('A forestry and wildfire cooperation update.'),
   body('A forestry update.')+'<footer><p>critical minerals</p></footer>',
   body('A forestry update.').replace('<main>','<nav><p>critical minerals</p></nav><main>'),
   body('A forestry update.').replace('news-tags','news-tags"><p>critical minerals</p><div class="'),
   body('Critical minerals supply cooperation.').replace('dcterms.issued','dcterms.modified'),
   body('Critical minerals supply cooperation.').replace('<h1>'+title,'<h1>Unrelated notice'),
  ])expect(canadaOriginalMineralsTopic(doc,url,title,NOW)).toBeNull();
 });
 it("refuses malformed original metadata rather than truncating a valid date prefix",()=>{
  expect(canadaOriginalPublicationDay(html('2026-10-12malformed',title),url,title,NOW)).toBeNull();
 });
});
