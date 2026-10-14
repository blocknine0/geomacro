import {describe,it,expect,vi} from "vitest";
import {verifiedFedBoardDiscountMinutesOriginal} from "./on-demand-fed-board-discount-release.server";
import {deriveStatelessSignals} from "./stateless-intelligence-model";
import {discoverOnDemandForPrivateQualification,verifyOnDemandOriginalArticlePages}
 from "./on-demand-global-discovery.server";
import {qualifyRetrievedOnDemandEvidence,buildPrivateVerifiedFedMinutesFinding}
 from "./on-demand-evidence-qualification.server";
const NOW=new Date("2026-10-14T11:00:00.000Z");
const ARTICLE_URL="https://www.federalreserve.gov/newsevents/pressreleases/monetary20261013a.htm";
const TITLE="Minutes of the Board's discount rate meetings on August 17, September 9, and September 16, 2026";
const FEED_TIME="2026-10-13T18:00:00.000Z";
const PAGE="<html><head><title>"+TITLE+"</title></head><body><h3>Press Release</h3>"+
 "<p>October 13, 2026</p><h3>"+TITLE+"</h3>"+
 "<p>For release at 2:00 p.m. EDT</p>"+
 "<p>The Federal Reserve Board on Tuesday released the minutes from its recent meetings to review and determine the discount rates provided to depository institutions through the discount window.</p>"+
 "<p>The Board's process for setting the discount rate is distinct from the process the Federal Open Market Committee follows in setting the target range for the federal funds rate.</p></body></html>";
const FEED="<rss><channel><item><title>"+TITLE+"</title><link>"+ARTICLE_URL+
 "</link><pubDate>Tue, 13 Oct 2026 18:00:00 GMT</pubDate></item></channel></rss>";
const SEARCH={country_iso3:"USA",categories:["macro" as const],topics:["macro_risk"],max_age_seconds:86400};
function fetcher(page=PAGE,feed=FEED){
 const calls:string[]=[];
 const fetchImpl=vi.fn(async(u:RequestInfo|URL):Promise<Response>=>{
  const url=String(u);calls.push(url);const host=new URL(url).hostname;
  if(host==="api.worldbank.org" && new URL(url).pathname==="/v2/country/USA")
    return Response.json([{page:1},[{id:"USA",name:"United States"}]]);
  if(host==="api.worldbank.org")return Response.json([{page:1},[]]);
  if(host==="www.federalreserve.gov" && url.endsWith("/feeds/press_all.xml"))
    return new Response(feed,{headers:{"content-type":"application/rss+xml"}});
  if(url===ARTICLE_URL)return new Response(page,{headers:{"content-type":"text/html"}});
  if(host==="www.gov.uk")return new Response("<feed></feed>",{headers:{"content-type":"application/atom+xml"}});
  if(host==="www.ecb.europa.eu")return new Response("<rss></rss>",{headers:{"content-type":"application/rss+xml"}});
  if(host==="api.gdeltproject.org")return Response.json({articles:[]});
  return new Response("<rss><channel></channel></rss>",{headers:{"content-type":"application/rss+xml"}});
 }) as typeof fetch;
 return {fetchImpl,calls};
}
describe("genuine Fed issuer-original context to private structured answer, not paid",()=>{
 it("matches the actual D1 display-key candidate without treating FNV as cryptographic proof",()=>{
  const rows=deriveStatelessSignals([{sourceId:"fed_press",category:"macro",
    title:TITLE,articleUrl:ARTICLE_URL,publishedAt:FEED_TIME,
    credit:"Federal Reserve Board"}],NOW.getTime());
  expect(rows).toHaveLength(1);
  expect(rows[0].id).toBe("macro-f6445c13");
  expect(rows[0].status).toBe("official_release_observed_unscored");
  expect(rows[0].same_event_corrob_verified).toBe(false);
  expect(rows[0].severity).toBeNull();
  expect(JSON.stringify(rows)).not.toContain(ARTICLE_URL);
 });
 it("derives a verified 18:00 UTC original announcement from Board page and independent native feed clock",()=>{
  const verified=verifiedFedBoardDiscountMinutesOriginal(PAGE,ARTICLE_URL,TITLE,FEED_TIME,NOW);
  expect(verified).toMatchObject({
   publication_utc:FEED_TIME,
   verified_event:"FED_BOARD_DISCOUNT_WINDOW_MEETING_MINUTES_PUBLISHED",
   first_party_release_clock_verified:true,board_issued_release:true,
  });
 });
 it("joins existing canonical discovery, page verification, private qualification and structured finding",async()=>{
  const {fetchImpl,calls}=fetcher();
  const d=await discoverOnDemandForPrivateQualification(SEARCH,{fetchImpl,now:NOW});
  // World Bank issuer-country identity must be independently resolved before
  // any official Fed country-specific original can be selected.
  expect(Boolean(d.private_verified_country_name)).toBe(true);
  const fed=d.private_original_review_candidates.filter(x=>x.publisher_family==="us_federal_reserve_original_publisher");
  // Only numeric producer audit counters; do not leak source ARTICLE_URL/title.
  const probe=d.discovery.source_probes.find(x=>x.family==="us_federal_reserve_original_publisher");
  expect(probe?.retrieval_state??"NO_FED_ISSUER_PROBE").toBe("RECORDS_OBSERVED");
  expect(probe?.feed_audit).toMatchObject({
    inspected:1,native_dated:1,country_mentioned:1,
    scope_matched:1,eligible_pub_date:1,allowed_article_paths:1,
  });
  expect(fed).toHaveLength(1);
  expect(fed[0].article_url).toBe(ARTICLE_URL);
  expect(fed[0].feed_item_published_at).toBe(FEED_TIME);
  const page=await verifyOnDemandOriginalArticlePages(fed,{fetchImpl,now:NOW,maxAgeSeconds:86400});
  expect(page.verified).toBe(1);
  expect(page.verified_candidates[0]).toMatchObject({
    verified_original_event_kind:"FED_BOARD_DISCOUNT_WINDOW_MEETING_MINUTES_PUBLISHED",
    page_original_published_at:FEED_TIME,
    publisher_article_page_date_verified:true,
    paid_delivery_allowed:false,
  });
  const q=qualifyRetrievedOnDemandEvidence({search:SEARCH,
    discovery:d.discovery,originals:fed,pageProof:page,
    verifiedCountryName:d.private_verified_country_name,macroChanges:[],now:NOW});
  const finding=buildPrivateVerifiedFedMinutesFinding(q,page);
  expect(finding).toMatchObject({
    country_iso3:"USA",category:"macro",original_publication_utc:FEED_TIME,
    provenance:{issuer:"Board of Governors of the Federal Reserve System",
      original_page_verified:true},
    rights:{attribution_required:true,item_specific_commercial_admission_verified:false},
    registered_signing_eligible:false,signed:false,x402_payment_authorized:false,
    new_rate_decision_verified:false,external_fx_market_impact_verified:false,
  });
  expect(finding?.finding).toContain("published minutes");
  expect(q.originals[0].rights_status).toBe("HOLD_ITEM_LEVEL_EXCEPTIONS");
  expect(q.commercial_delivery_eligible).toBe(false);
  expect(d.discovery.payable).toBe(false);
  expect(d.discovery.network_attempts).toBeLessThanOrEqual(12);
  expect(calls.filter(x=>x===ARTICLE_URL)).toHaveLength(1);
  expect(JSON.stringify(d.discovery)).not.toContain(ARTICLE_URL);
  expect(JSON.stringify(d.discovery)).not.toContain(TITLE);
 });
 it.each([
  ["wrong origin",PAGE,"https://example.com/newsevents/pressreleases/monetary20261013a.htm",TITLE,FEED_TIME],
  ["wrong title",PAGE,ARTICLE_URL,"Federal Reserve makes unrelated announcement",FEED_TIME],
  ["wrong feed instant",PAGE,ARTICLE_URL,TITLE,"2026-10-13T16:00:00.000Z"],
  ["wrong explicit timezone",PAGE.replace("2:00 p.m. EDT","2:00 p.m. EST"),ARTICLE_URL,TITLE,FEED_TIME],
  ["missing body",PAGE.replace("The Federal Reserve Board on Tuesday released the minutes","Someone released the minutes"),ARTICLE_URL,TITLE,FEED_TIME],
  ["fake date",PAGE.replace("October 13, 2026","October 12, 2026"),ARTICLE_URL,TITLE,FEED_TIME],
  ["fake rate announcement",PAGE.replace("Board's process for setting the discount rate","Board's process for setting a new exchange rate"),ARTICLE_URL,TITLE,FEED_TIME],
 ] as const)("rejects %s without inferring rate, rights or exact clock",(_name,html,url,title,published)=>{
  expect(verifiedFedBoardDiscountMinutesOriginal(html,url,title,published,NOW)).toBeNull();
 });
 it("rejects modified-only clock, stale original, timezone/date conflict and customer-owned claims",()=>{
   expect(verifiedFedBoardDiscountMinutesOriginal(
    PAGE.replace("For release at 2:00 p.m. EDT","Last Updated 2:00 p.m. EDT"),
    ARTICLE_URL,TITLE,FEED_TIME,NOW)).toBeNull();
   expect(verifiedFedBoardDiscountMinutesOriginal(PAGE,ARTICLE_URL,TITLE,FEED_TIME,
    new Date("2026-11-15T11:00:00.000Z"))).toBeNull();
 });
 it("refuses signing candidate without independently qualified page-bound evidence",async()=>{
  const {fetchImpl}=fetcher();
  const d=await discoverOnDemandForPrivateQualification(SEARCH,{fetchImpl,now:NOW});
  const fed=d.private_original_review_candidates.filter(x=>x.publisher_family==="us_federal_reserve_original_publisher");
  const page=await verifyOnDemandOriginalArticlePages(fed,{fetchImpl,now:NOW});
  const q=qualifyRetrievedOnDemandEvidence({
   search:SEARCH,discovery:d.discovery,originals:fed,pageProof:page,
   verifiedCountryName:d.private_verified_country_name,macroChanges:[],now:NOW,
  });
  expect(buildPrivateVerifiedFedMinutesFinding({...q,originals:[]},page)).toBeNull();
  expect(buildPrivateVerifiedFedMinutesFinding(q,{...page,verified_candidates:[]})).toBeNull();
  expect(buildPrivateVerifiedFedMinutesFinding({...q,country_iso3:"CHN"},page)).toBeNull();
 });
});
