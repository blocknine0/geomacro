import test from "node:test";
import assert from "node:assert/strict";
import {
 GLOBAL_OFFICIAL_RELEASE_FEEDS,globalOriginalArticleUrl
} from "./global-official-release-feeds.mjs";
import {registeredOriginalPublisherOrganization} from "./independent-same-event-qualification.mjs";

// All fixtures are published URL path shapes, not assertions of a fresh event.
// Exact live source + native clock and rights are separately verified.
const consilium="https://www.consilium.europa.eu/en/press/press-releases/2026/10/21/libyaturkiye-statement-by-the-high-representative-on-behalf-of-the-eu-on-the-ratification-of-the-libya-turkiye-mou-by-libya-s-house-of-representatives/";
const usgs="https://www.usgs.gov/news/national-news-release/usgs-lithium-carolinas-could-replace-imports-a-century-or-more";
const eu=GLOBAL_OFFICIAL_RELEASE_FEEDS.find(x=>x.id==="eu_council_press_original");
const minerals=GLOBAL_OFFICIAL_RELEASE_FEEDS.find(x=>x.id==="usgs_minerals_news_original");
test("source registry pins genuine published EU Council and USGS advertised RSS origins",()=>{
 assert.equal(eu.url,"https://www.consilium.europa.eu/en/rss/pressreleases.ashx");
 assert.equal(eu.category,"geopolitics");
 assert.equal(eu.family,"eu_council_original_publisher");
 assert.equal(minerals.url,"https://www.usgs.gov/news/minerals/feed");
 assert.equal(minerals.category,"rare_earth");
 assert.equal(minerals.family,"usgs_minerals_original_publisher");
 assert.equal(globalOriginalArticleUrl(consilium,eu),consilium);
 assert.equal(globalOriginalArticleUrl(usgs,minerals),usgs);
});
test("strict original paths reject same-host index/feed, forged host, query and translation aliases",()=>{
 for(const candidate of [
  "https://www.consilium.europa.eu/en/rss/pressreleases.ashx",
  "https://www.consilium.europa.eu/en/press/press-releases/",
  consilium+"?utm_source=rss",
  consilium+"#first-published",
  consilium.replace("www.consilium.europa.eu","www.consilium.europa.eu.attacker.invalid"),
  consilium.replace("/en/press/","/fr/press/"),
 ])assert.equal(globalOriginalArticleUrl(candidate,eu),null);
 for(const candidate of [
  "https://www.usgs.gov/news/minerals/feed",
  "https://www.usgs.gov/news",
  usgs+"?src=feed",
  usgs.replace("/national-news-release/","/programs/"),
  usgs.replace("https://","http://"),
 ])assert.equal(globalOriginalArticleUrl(candidate,minerals),null);
});
test("new feeds cannot imply free commercial rights or fabricated publisher clocks",()=>{
 assert.ok(eu.credit.includes("attribution"));
 assert.ok(minerals.credit.includes("no third-party rights granted"));
 for(const x of [eu,minerals]){
  assert.equal(x.production_update_reader,true);
  assert.equal(x.poll_minutes,30);
  assert.equal(x.maxBytes,384*1024);
  assert.equal(Object.hasOwn(x,"commercial_rights_verified"),false);
  assert.equal(Object.hasOwn(x,"native_publication_clock_verified"),false);
  assert.equal(Object.hasOwn(x,"current_three_domain_gri_qualified"),false);
 }
});
test("new registered EU publisher is a distinct real institution, not itself a rights or facts grant",()=>{
 assert.equal(registeredOriginalPublisherOrganization("www.consilium.europa.eu"),"eu_council");
 assert.equal(registeredOriginalPublisherOrganization("www.usgs.gov"),"usgs");
 assert.equal(registeredOriginalPublisherOrganization("www.consilium.europa.eu.attacker.invalid"),null);
});
