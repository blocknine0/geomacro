import {describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {
  buildAutoIngest72hStructuredDrafts,readAutoIngest72hStructuredDrafts,
} from "../lib/auto-ingest-72h-context.server";
import {checkedDerivedNews} from "../lib/public-derived-news-client";
import type {StatelessIntelligenceSignal} from "../lib/stateless-intelligence-model";
const NOW=Date.parse("2026-10-18T01:00:00.000Z");
const signal=(over:Partial<StatelessIntelligenceSignal>={}):StatelessIntelligenceSignal=>({
  id:"macro-a1b2c3d4",category:"macro",
  title:"Geomacro finds official update on international trade — India",
  what_changed:"An official publisher issued a policy update concerning international trade mentioning India.",
  why_it_matters:"Trade announcements may change international supply chains, but their effects require separate confirmation.",
  topic:"trade and economic relations",
  development_type:"policy update",geography:"India",observed_release_count:1,
  published_at:"2026-10-17T14:00:00.000Z",date_precision:"exact",
  sources_credited:[],status:"official_release_observed_unscored",
  same_event_corrob_verified:false,severity:null,...over,
});
describe("72h auto ingest -> own structured Intelligence and API research drafts",()=>{
  it("uses only own structured fields, exact country/category/date and NEVER grants payment eligibility",()=>{
    const rows=[signal(),signal(),signal({id:"macro-1234abcd",geography:"United Kingdom"}),
      signal({id:"rare_earth-1234abcd",category:"rare_earth",topic:"rare-earth supply",geography:"China"})];
    const drafts=buildAutoIngest72hStructuredDrafts(rows,"IND",["macro","rare_earth"],NOW);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toEqual({
      schema:"geomacro.auto-ingest-structured-draft.v1",derived_id:"macro-a1b2c3d4",
      category:"macro",subject_iso3:"IND",topic:"trade and economic relations",
      observed_original_publication:"2026-10-17T14:00:00.000Z",
      date_precision:"exact",what_changed:rows[0].what_changed,
      why_it_matters:rows[0].why_it_matters,
      evidence_status:"UNVERIFIED_DERIVED_RESEARCH_HINT",
      country_subject_verified:false,independent_same_event_verified:false,
      commercial_derived_rights_verified:false,signed_product_verified:false,
      payable:false,
    });
    const serialized=JSON.stringify(drafts);
    for(const forbidden of ["raw_feed","article_url","original_title","source_url",
      "publisher_id","evidence_html","commercial_rights_verified\":true"])
      expect(serialized).not.toContain(forbidden);
  });
  it("excludes original events >72h, future events, unscored violations and unknown countries",()=>{
    const rows=[signal({published_at:new Date(NOW-72*3_600_000-1).toISOString()}),
      signal({published_at:new Date(NOW+1).toISOString()}),
      signal({same_event_corrob_verified:true}),signal({severity:60}),
      signal({geography:null})];
    expect(buildAutoIngest72hStructuredDrafts(rows,"IND",["macro"],NOW)).toEqual([]);
    expect(buildAutoIngest72hStructuredDrafts([signal()],"ZZZ",["macro"],NOW)).toEqual([]);
    expect(buildAutoIngest72hStructuredDrafts([signal()],"IND",[],NOW)).toEqual([]);
  });
  it("reads the same public derived D1 contract and never accepts raw upstream material",async()=>{
    const doc={ok:true,schema:"geomacro.website-derived-news-feed.v1",
      checked_at:new Date(NOW).toISOString(),original_release_delay_minutes:15,
      retention_days:3,retention_hours:72,delivery_scope:"free_website_only",
      signals:[signal()]};
    const fetcher=vi.fn(async()=>Response.json(doc));
    expect(checkedDerivedNews(doc,NOW)).toHaveLength(1);
    expect(await readAutoIngest72hStructuredDrafts("IND",["macro"],fetcher as typeof fetch,NOW))
      .toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const privatePayload={...doc,signals:[{...signal(),raw_html:"publisher secret text"}]};
    expect(checkedDerivedNews(privatePayload,NOW)).toHaveLength(0);
    expect(await readAutoIngest72hStructuredDrafts("IND",["macro"],
      vi.fn(async()=>Response.json(privatePayload)) as typeof fetch,NOW)).toEqual([]);
  });
  it("keeps the canonical x402 eligibility/payment pipeline independent of auto-ingest hints",()=>{
    const code=readFileSync("src/lib/mainnet-intelligence-endpoint.server.ts","utf8");
    const start=code.indexOf("const autoIngestDrafts=");
    const verification=code.indexOf("const privateResult=await discoverOnDemandForPrivateQualification");
    expect(start).toBeGreaterThan(0);
    expect(verification).toBeGreaterThan(start);
    expect(code).toContain("auto_ingest_72h_drafts_commercially_eligible:false");
    expect(code).toContain('missing_proof_dimensions:[');
    expect(code).toContain('const finalConfig = resolveEligibleCoinbaseCapabilityConfig');
    expect(code).not.toContain("payment_required_now:autoIngestDrafts.length>0");
  });
});
