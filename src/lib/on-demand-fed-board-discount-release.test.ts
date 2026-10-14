import {describe,it,expect,vi} from "vitest";
import {buildAgentQueryPlan} from "./agent-query-plan";
import {bindPrivateFedMinutesToExactCustomerQuery} from "./on-demand-private-query-bound-draft.server";
import {verifiedFedBoardDiscountMinutesOriginal} from "./on-demand-fed-board-discount-release.server";
import {originalFedDiscountMinutesArchiveLinks} from "./on-demand-fed-official-archive.server";
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
const EMPTY_FEED="<rss><channel></channel></rss>";
const ARCHIVE="<html><body><div>10/13/2026</div><div>"+
 '<a href="monetary20261013a.htm">'+TITLE+"</a></div></body></html>";
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
  if(url.endsWith("/newsevents/pressreleases/2026-press.htm"))
    return new Response(ARCHIVE,{headers:{"content-type":"text/html"}});
  if(url===ARTICLE_URL)return new Response(page,{headers:{"content-type":"text/html"}});
  if(host==="www.gov.uk")return new Response("<feed></feed>",{headers:{"content-type":"application/atom+xml"}});
  if(host==="www.ecb.europa.eu")return new Response("<rss></rss>",{headers:{"content-type":"application/rss+xml"}});
  if(host==="api.gdeltproject.org")return Response.json({articles:[]});
  return new Response("<rss><channel></channel></rss>",{headers:{"content-type":"application/rss+xml"}});
 }) as typeof fetch;
 return {fetchImpl,calls};
}
describe("genuine Fed issuer-original context to private structured answer, not paid",()=>{
 it("binds only issuer-owned annual index date and exact original-page clock; no RSS item needed",async()=>{
  const extracted=originalFedDiscountMinutesArchiveLinks(ARCHIVE,2026,NOW,86400_000);
  expect(extracted).toEqual([{
    article_url:ARTICLE_URL,article_title:TITLE,
    official_archive_release_day:"2026-10-13",
  }]);
  const {fetchImpl,calls}=fetcher(PAGE,EMPTY_FEED);
  const d=await discoverOnDemandForPrivateQualification(SEARCH,{fetchImpl,now:NOW});
  const fed=d.private_original_review_candidates.filter(x=>
    x.publisher_family==="us_federal_reserve_original_publisher");
  expect(fed).toHaveLength(1);
  expect(fed[0]).toMatchObject({
    official_archive_release_day:"2026-10-13",
    feed_item_published_at:null,
    source_native_feed_publication_date_verified:false,
    paid_delivery_allowed:false,
  });
  expect(d.discovery.source_probes.some(x=>
    x.family==="us_federal_reserve_annual_archive" &&
    x.observed_record_count===1)).toBe(true);
  const proof=await verifyOnDemandOriginalArticlePages(fed,{
    fetchImpl,now:NOW,maxAgeSeconds:86400});
  expect(proof).toMatchObject({verified:1,verified_candidates:[{
    verified_original_event_kind:"FED_BOARD_DISCOUNT_WINDOW_MEETING_MINUTES_PUBLISHED",
    publisher_article_page_date_verified:true,
    page_original_published_at:FEED_TIME,
    official_archive_release_day:"2026-10-13",
  }]});
  const qualified=qualifyRetrievedOnDemandEvidence({
    search:SEARCH,discovery:d.discovery,originals:fed,pageProof:proof,
    verifiedCountryName:d.private_verified_country_name,macroChanges:[],now:NOW});
  const finding=buildPrivateVerifiedFedMinutesFinding(qualified,proof);
  expect(finding).toMatchObject({
    original_publication_utc:FEED_TIME,
    country_iso3:"USA",category:"macro",
    rights:{item_specific_commercial_admission_verified:false,
      attribution_required:true},
    signed:false,registered_signing_eligible:false,x402_payment_authorized:false,
  });
  expect(qualified.originals).toHaveLength(1);
  expect(qualified.originals[0].rights_status).toBe("HOLD_ITEM_LEVEL_EXCEPTIONS");
  expect(qualified.originals[0].original_clock_basis).toBe("VERIFIED_ORIGINAL_PAGE");
  expect(qualified.commercial_delivery_eligible).toBe(false);
  expect(d.discovery.network_attempts).toBeLessThanOrEqual(12);
  expect(calls.filter(x=>x===ARTICLE_URL)).toHaveLength(1);
  expect(JSON.stringify(d.discovery)).not.toContain(ARTICLE_URL);
  expect(JSON.stringify(d.discovery)).not.toContain(TITLE);
 });
 it("binds the EXACT customer question to authentic Fed issuer proof, not generic macro risk",async()=>{
  const received={
    question:"When did the Federal Reserve Board publish its August and September 2026 discount-rate meeting minutes?",
    subjects:[{type:"country" as const,country_iso3:"USA"}],
    topics:["macro_risk" as const],
    fulfillment_mode:"live_on_demand" as const,
    max_age_seconds:86_400,
  };
  const canonicalPlan=buildAgentQueryPlan(received);
  const {fetchImpl}=fetcher();
  const discovered=await discoverOnDemandForPrivateQualification(SEARCH,{fetchImpl,now:NOW});
  const fed=discovered.private_original_review_candidates.filter(c=>
    c.publisher_family==="us_federal_reserve_original_publisher");
  const verified=await verifyOnDemandOriginalArticlePages(fed,{
    fetchImpl,now:NOW,maxAgeSeconds:86_400});
  const qualified=qualifyRetrievedOnDemandEvidence({
    search:SEARCH,discovery:discovered.discovery,originals:fed,pageProof:verified,
    verifiedCountryName:discovered.private_verified_country_name,macroChanges:[],now:NOW,
  });
  const finding=buildPrivateVerifiedFedMinutesFinding(qualified,verified,{
    queryPlanHash:canonicalPlan.query_plan_hash,observedAt:NOW,
  });
  expect(finding).not.toBeNull();
  const bind=(receivedRequest:unknown,plan=canonicalPlan,f= finding!)=>
    bindPrivateFedMinutesToExactCustomerQuery({
      receivedRequest,canonicalPlan:plan,finding:f,
    });
  const accepted=bind(received);
  expect(accepted.ok).toBe(true);
  if(!accepted.ok)throw Error("TEST_QUERY_EXPECTED_BOUND");
  expect(accepted.draft).toMatchObject({
    query_plan_sha256:canonicalPlan.query_plan_hash,
    exact_customer_question_sha256:expect.stringMatching(/^[a-f0-9]{64}$/),
    original_published_at_utc:FEED_TIME,
    original_age_seconds:61_200,
    country_iso3:"USA",category:"macro",
    source_page_verified:true,signing_eligible:false,
    independent_review_accepted:false,item_commercial_rights_admitted:false,
    durable_freeze_authorized:false,x402_payment_authorized:false,
    risk_score:null,status:"QUERY_BOUND_DRAFT_NOT_COMMERCIALLY_ADMITTED",
  });
  const again=bind(received);
  expect(again.ok).toBe(true);
  if(again.ok)expect(again.canonical_private_sha256).toBe(accepted.canonical_private_sha256);
  expect(accepted.canonical_private_sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(accepted.canonical_private_json).not.toContain(ARTICLE_URL);
  expect(accepted.canonical_private_json).not.toContain(received.question);
  const modified={...received,question:received.question+" And what was the FX impact?"};
  expect(bind(modified)).toEqual({ok:false,reason:"CANONICAL_QUERY_PLAN_MISMATCH"});
  expect(bind(modified,buildAgentQueryPlan(modified))).toEqual({
    ok:false,reason:"UNSUPPORTED_QUESTION_CLAIM",
  }); // Note a newly generated plan must still face narrow supported-claim rejection.
  const wrongCountry={...received,subjects:[{type:"country" as const,country_iso3:"GBR"}]};
  expect(bind(wrongCountry,buildAgentQueryPlan(wrongCountry))).toEqual({
    ok:false,reason:"SUBJECT_COUNTRY_CATEGORY_MISMATCH",
  });
  const wrongCategory={...received,topics:["critical_minerals" as const]};
  expect(bind(wrongCategory,buildAgentQueryPlan(wrongCategory))).toEqual({
    ok:false,reason:"SUBJECT_COUNTRY_CATEGORY_MISMATCH",
  });
  const sameSemanticDifferentBytes={...received,question:"  "+received.question+" "};
  const differentExact=bind(sameSemanticDifferentBytes);
  expect(differentExact.ok).toBe(true);
  if(differentExact.ok) {
    expect(differentExact.draft.exact_customer_question_sha256)
      .not.toBe(accepted.draft.exact_customer_question_sha256);
    expect(differentExact.canonical_private_sha256)
      .not.toBe(accepted.canonical_private_sha256);
  }
  const noClock={...finding!,source_freshness:null};
  expect(bind(received,canonicalPlan,noClock)).toEqual({
    ok:false,reason:"REAL_SOURCE_OBSERVATION_CLOCK_MISSING",
  });
  const expired={...finding!,source_freshness:{
    ...finding!.source_freshness!,checked_at_utc:"2026-10-14T18:01:00.000Z",
    original_age_seconds:86_460,
    classification:"HISTORICAL_ORIGINAL" as const,
  }};
  expect(bind(received,canonicalPlan,expired)).toEqual({
    ok:false,reason:"ORIGINAL_OUTSIDE_QUERY_WINDOW",
  });
  const wider={...received,max_age_seconds:31*86_400};
  const widePlan=buildAgentQueryPlan(wider);
  const historic={...expired,query_binding:{
    ...finding!.query_binding,received_query_plan_hash:widePlan.query_plan_hash,
  }};
  const historyResult=bind(wider,widePlan,historic);
  expect(historyResult.ok).toBe(true);
  if(historyResult.ok) {
    expect(historyResult.draft.source_classification).toBe("HISTORICAL_ORIGINAL");
    expect(historyResult.draft.signing_eligible).toBe(false);
  }
  const current={...wider,question:received.question.replace("When did","What is the current date when")};
  const currentPlan=buildAgentQueryPlan(current);
  const currentFinding={...historic,query_binding:{
    ...historic.query_binding,received_query_plan_hash:currentPlan.query_plan_hash,
  }};
  expect(bind(current,currentPlan,currentFinding)).toEqual({
    ok:false,reason:"CURRENT_QUERY_REQUIRES_FRESH_ORIGINAL",
  });
 });
 it("rejects forged/mismatched calendar days, off-host links and stale archive without invention",()=>{
   expect(originalFedDiscountMinutesArchiveLinks(
     ARCHIVE.replace(TITLE,"<span>"+TITLE+"</span>"),2026,NOW,86400_000))
       .toHaveLength(1);
   expect(originalFedDiscountMinutesArchiveLinks(
     ARCHIVE.replace(TITLE,"<script>"+TITLE+"</script>"),2026,NOW,86400_000))
       .toHaveLength(0);
   expect(originalFedDiscountMinutesArchiveLinks(
     ARCHIVE.replace("10/13/2026","10/12/2026"),2026,NOW,86400_000)).toEqual([]);
   expect(originalFedDiscountMinutesArchiveLinks(
     ARCHIVE.replace("monetary20261013a.htm","https://example.com/newsevents/pressreleases/monetary20261013a.htm"),
     2026,NOW,86400_000)).toEqual([]);
   expect(originalFedDiscountMinutesArchiveLinks(ARCHIVE,2026,
     new Date("2026-11-20T11:00:00Z"),86400_000)).toEqual([]);
   expect(verifiedFedBoardDiscountMinutesOriginal(PAGE,ARTICLE_URL,TITLE,null,
     NOW,"2026-10-12")).toBeNull();
   expect(verifiedFedBoardDiscountMinutesOriginal(PAGE,ARTICLE_URL,TITLE,null,
     NOW,"2026-10-13")?.publication_utc).toBe(FEED_TIME);
   expect(verifiedFedBoardDiscountMinutesOriginal(
     PAGE.replace("For release at 2:00 p.m. EDT","Last Modified 2:00 p.m. EDT"),
     ARTICLE_URL,TITLE,null,NOW,"2026-10-13")).toBeNull();
 });
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
  const planHash="f".repeat(64);
  const finding=buildPrivateVerifiedFedMinutesFinding(q,page,{
    observedAt:NOW,queryPlanHash:planHash,
  });
  expect(finding?.query_binding).toEqual({
    discovery_query_fingerprint_sha256:d.discovery.query_fingerprint_sha256,
    received_query_plan_hash:planHash,
    exact_customer_question_verified:false,
  });
  expect(finding?.evidence_fingerprint_sha256).toBe(q.evidence_fingerprint_sha256);
  expect(finding?.source_freshness).toEqual({
    checked_at_utc:NOW.toISOString(),original_age_seconds:61200,
    current_24h_window_expires_utc:"2026-10-14T18:00:00.000Z",
    classification:"CURRENT_24H_ORIGINAL",
  });
  expect(finding?.reviewer).toEqual({
    independent_same_event_verified:false,
    original_item_relevance_verified:true,
    commercial_item_admission_verified:false,
    acceptance_status:"BLOCKED_ITEM_RIGHTS_AND_INDEPENDENT_REVIEW",
  });
  expect(buildPrivateVerifiedFedMinutesFinding(q,page,{
    observedAt:NOW,queryPlanHash:"not-a-hash",
  })).toBeNull();
  expect(buildPrivateVerifiedFedMinutesFinding(q,page,{
    observedAt:new Date("2026-10-15T18:01:00.000Z"),
  })?.source_freshness?.classification).toBe("HISTORICAL_ORIGINAL");
  expect(buildPrivateVerifiedFedMinutesFinding(q,page)?.source_freshness)
    .toBeNull(); // No real probe clock: unknown, never silently use Date.now()
  expect(buildPrivateVerifiedFedMinutesFinding(q,page,{
    observedAt:new Date("2026-10-13T17:59:59.000Z"),
  })).toBeNull();
  expect(buildPrivateVerifiedFedMinutesFinding({...q,originals:q.originals.map(
    e=>({...e,rights_status:"SOURCE_RIGHTS_CERTIFIED"}))},page,{
    observedAt:NOW,
  })).toBeNull(); // never borrow a rights state from missing item review
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

describe("Part 7 bounded historical Fed publication and exact customer question",()=>{
 it("keeps the 13 October 2026 minutes release historical on 15 October; builds only an unsigned private exact-query draft",async()=>{
  const now=new Date("2026-10-15T10:00:00.000Z");
  const windowSeconds=7*86_400;
  const research={...SEARCH,max_age_seconds:windowSeconds};
  const received={
    question:"When did the Federal Reserve Board publish its August and September 2026 discount-rate meeting minutes?",
    subjects:[{type:"country" as const,country_iso3:"USA"}],
    topics:["macro_risk" as const],fulfillment_mode:"live_on_demand" as const,
    max_age_seconds:windowSeconds,
  };
  const plan=buildAgentQueryPlan(received);
  const {fetchImpl,calls}=fetcher(PAGE,EMPTY_FEED);
  const evidence=await discoverOnDemandForPrivateQualification(research,{
    now,fetchImpl,disableDiscoveryIndex:true,
  });
  const fed=evidence.private_original_review_candidates.filter(x=>
    x.publisher_family==="us_federal_reserve_original_publisher");
  expect(fed).toHaveLength(1);
  expect(fed[0].official_archive_release_day).toBe("2026-10-13");
  const pages=await verifyOnDemandOriginalArticlePages(fed,{
    now,fetchImpl,maxAgeSeconds:windowSeconds,
  });
  expect(pages.verified_candidates).toHaveLength(1);
  expect(pages.verified_candidates[0].page_original_published_at).toBe(FEED_TIME);
  const q=qualifyRetrievedOnDemandEvidence({
    search:research,discovery:evidence.discovery,originals:fed,pageProof:pages,
    verifiedCountryName:evidence.private_verified_country_name,macroChanges:[],now,
  });
  const finding=buildPrivateVerifiedFedMinutesFinding(q,pages,{
    observedAt:now,queryPlanHash:plan.query_plan_hash,
  });
  expect(finding?.source_freshness?.classification).toBe("HISTORICAL_ORIGINAL");
  expect(finding?.new_rate_decision_verified).toBe(false);
  expect(finding?.rights.item_specific_commercial_admission_verified).toBe(false);
  expect(finding?.reviewer.independent_same_event_verified).toBe(false);
  expect(finding?.registered_signing_eligible).toBe(false);
  expect(finding?.x402_payment_authorized).toBe(false);
  const bound=bindPrivateFedMinutesToExactCustomerQuery({
    receivedRequest:received,canonicalPlan:plan,finding:finding!,
  });
  expect(bound.ok).toBe(true);
  if(bound.ok){
    expect(bound.draft.source_classification).toBe("HISTORICAL_ORIGINAL");
    expect(bound.draft.original_published_at_utc).toBe(FEED_TIME);
    expect(bound.draft.expiry_at_utc).toBe("2026-10-20T18:00:00.000Z");
    expect(bound.draft.signing_eligible).toBe(false);
    expect(bound.draft.required_data_attribution.credit)
      .toBe("Board of Governors of the Federal Reserve System");
    expect(bound.draft.required_data_attribution.material)
      .toContain("October 13, 2026");
    expect(bound.draft.item_commercial_rights_admitted).toBe(false);
    expect(bound.draft.risk_score).toBeNull();
    expect(bound.canonical_private_json).not.toContain(received.question);
    expect(bound.canonical_private_json).not.toContain(ARTICLE_URL);
  }
  const currentOnly={...received,max_age_seconds:86_400};
  const currentPlan=buildAgentQueryPlan(currentOnly);
  expect(bindPrivateFedMinutesToExactCustomerQuery({
    receivedRequest:currentOnly,canonicalPlan:currentPlan,
    finding:{...finding!,query_binding:{...finding!.query_binding,
      received_query_plan_hash:currentPlan.query_plan_hash}},
  })).toEqual({ok:false,reason:"ORIGINAL_OUTSIDE_QUERY_WINDOW"});
  expect(evidence.discovery.network_attempts).toBeLessThanOrEqual(12);
  expect(calls.filter(url=>url===ARTICLE_URL)).toHaveLength(1);
 });
});
