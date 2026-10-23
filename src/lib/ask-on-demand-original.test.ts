import {describe,expect,it,vi} from "vitest";
import {answerFromCurrentOriginals,answerFromOriginalPlan,planAskOriginalQuestion} from "./ask-on-demand-original.server";
const now=new Date("2026-10-17T12:00:00.000Z");
const published="2026-10-17T11:00:00.000Z";
const original={
 domain:"rare_earth" as const,country_iso3:"CHN",publisher_family:"uk_dbt_original_publisher",
 article_url:"https://www.gov.uk/government/news/china-lithium-investment",
 article_title:"China lithium mining investment announcement",
 feed_item_published_at:published,article_identity_sha256:"a".repeat(64),
 first_party_article_url_verified:true as const,source_native_feed_publication_date_verified:true,
 publisher_article_page_date_verified:false as const,
 independent_same_event_verified:false as const,derived_commercial_rights_verified:false as const,
 score_verified:false as const,signed_gro_verified:false as const,paid_delivery_allowed:false as const,
};
const discover=vi.fn(async()=>({discovery:{},private_candidates:[original],
 private_original_review_candidates:[],duplicate_original_headline_count:0,
 private_macro_changes:[],private_macro_qualifications:[],private_verified_country_name:"China"})) as never;
const verifyPages=vi.fn(async()=>({attempted:1,verified:1,verified_candidates:[
 {...original,publisher_article_page_date_verified:true as const,page_original_published_at:published}
]})) as never;
describe("Ask question-driven original publisher retrieval",()=>{
 it("routes canonical ISO3, categories, country aliases, freshness and ambiguity",()=>{
  expect(planAskOriginalQuestion("China latest lithium news")?.country_iso3).toBe("CHN");
  expect(planAskOriginalQuestion("India critical minerals developments this week")).toMatchObject({
    country_iso3:"IND",categories:["rare_earth"],max_age_seconds:604800});
  expect(planAskOriginalQuestion("US macro updates today")?.country_iso3).toBe("USA");
  expect(planAskOriginalQuestion("What about us today?")).toBeNull();
  expect(planAskOriginalQuestion("Latest exact inflation rate in India?")).toBeNull();
  expect(planAskOriginalQuestion("What is the latest GRI risk index for India?")).toBeNull();
  expect(planAskOriginalQuestion("Latest news in India and China?")).toBeNull();
  expect(planAskOriginalQuestion("Latest sanctions in South Sudan")?.country_iso3).toBe("SSD");
  expect(planAskOriginalQuestion("Latest mining updates in Democratic Republic of the Congo")?.country_iso3).toBe("COD");
  expect(planAskOriginalQuestion("What changed globally today?")).toBeNull();
 });
 it("returns only source-private derived first-party release observations",async()=>{
  const output=await answerFromCurrentOriginals("China latest lithium news",{now,discover,verifyPages});
  expect(output?.intelligence_tier).toBe("official_observation_unscored");
  expect(output?.latest_original_published_at).toBe(published);
  expect(output?.insufficient_evidence).toBe(false);
  expect(output?.low_confidence).toBe(true);
  expect(output?.signed_gro_generated).toBe(false);
  expect(output?.independent_same_event_verification).toBe(false);
  const text=JSON.stringify(output);
  expect(text).not.toContain("www.gov.uk");
  expect(text).not.toContain(original.article_title);
  expect(text).not.toContain("uk_dbt_original_publisher");
 });
 it("rejects missing page proof, country mismatch and stale source clocks",async()=>{
  const noPage=vi.fn(async()=>({attempted:1,verified:0,verified_candidates:[]})) as never;
  expect(await answerFromCurrentOriginals("China latest lithium news",{now,discover,verifyPages:noPage})).toBeNull();
  const wrongCountry=vi.fn(async()=>({private_candidates:[{...original,country_iso3:"USA"}]})) as never;
  expect(await answerFromCurrentOriginals("China latest lithium news",{now,discover:wrongCountry,verifyPages})).toBeNull();
  const stale=vi.fn(async()=>({attempted:1,verified:1,verified_candidates:[
   {...original,publisher_article_page_date_verified:true,page_original_published_at:"2026-10-15T00:00:00.000Z"}
  ]})) as never;
  expect(await answerFromCurrentOriginals("China latest lithium news",{now,discover,verifyPages:stale})).toBeNull();
 });
 it("allows website and live API to use the same just-published original",async()=>{
  const recent=vi.fn(async()=>({attempted:1,verified:1,verified_candidates:[
   {...original,publisher_article_page_date_verified:true,page_original_published_at:"2026-10-17T11:58:00.000Z"}
  ]})) as never;
  expect(await answerFromCurrentOriginals("China latest lithium news",{now,discover,verifyPages:recent})).toMatchObject({latest_original_published_at:"2026-10-17T11:58:00.000Z",signed_gro_generated:false});
  expect(await answerFromCurrentOriginals("China latest lithium news",{now,discover,verifyPages:recent,websiteDelay:false}))
   .toMatchObject({latest_original_published_at:"2026-10-17T11:58:00.000Z",signed_gro_generated:false});
 });
 it("uses a verified matching Canada publication day only as unsigned day-precision observation",async()=>{
  const canadian={...original,country_iso3:"CAN",publisher_family:"canada_nrcan_original_publisher",
    article_title:"Canada announces lithium critical minerals investment",
    article_url:"https://www.canada.ca/en/natural-resources-canada/news/2026/10/canada-lithium-investment.html",
    feed_item_published_at:null,source_native_feed_publication_date_verified:false};
  const privateRead=vi.fn(async()=>({private_candidates:[canadian]})) as never;
  const calendarProof={publisher_family:"canada_nrcan_original_publisher",
    article_identity_sha256:canadian.article_identity_sha256,page_original_publication_day:"2026-10-14",
    original_clock_precision:"day",original_issuer_page_verified:true,
    article_commercial_rights_verified:false,signed_customer_answer_verified:false};
  const pageRead=vi.fn(async()=>({attempted:1,verified:0,verified_candidates:[],day_only_originals:[calendarProof]})) as never;
  const plan={country_iso3:"CAN",country_name:"Canada",categories:["rare_earth" as const],
    topics:["critical_minerals"],mineral:"lithium" as const,max_age_seconds:7*86400};
  const out=await answerFromOriginalPlan(plan,{now,discover:privateRead,verifyPages:pageRead,websiteDelay:false});
  expect(out).toMatchObject({latest_original_published_at:"2026-10-14",
    latest_original_date_precision:"day",signed_gro_generated:false,independent_same_event_verification:false});
  expect(out?.summary).toContain("publication time unavailable");
  expect(JSON.stringify(out)).not.toContain("2026-10-14T");
  expect(JSON.stringify(out)).not.toContain(canadian.article_title);
  expect(JSON.stringify(out)).not.toContain(canadian.article_url);
  for(const invalid of [
    {...calendarProof,article_identity_sha256:"b".repeat(64)},
    {...calendarProof,original_issuer_page_verified:false},
    {...calendarProof,page_original_publication_day:"2026-10-17"},
    {...calendarProof,page_original_publication_day:"2026-09-01"},
  ]){
    const invalidPage=vi.fn(async()=>({attempted:1,verified:0,verified_candidates:[],day_only_originals:[invalid]})) as never;
    expect(await answerFromOriginalPlan(plan,{now,discover:privateRead,verifyPages:invalidPage,websiteDelay:false})).toBeNull();
  }
 });
});
