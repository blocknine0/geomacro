import {describe,it,expect} from "vitest";
import {pairOnDemandOriginalsForIndependentReview,
  publicOnDemandReviewPairCount} from "./on-demand-official-source-pairs.server";
import type {QualifiedPrivateEvidence} from "./on-demand-evidence-qualification.server";

const hash=(c:string)=>c.repeat(64);
const source=(family:string,hex:string,day="2026-10-31T12:00:00Z")=>({
  category:"macro",source_family:family,
  subject_country_iso3:"USA",article_identity_sha256:hash(hex),
  original_published_at:day,original_clock_basis:"VERIFIED_ORIGINAL_PAGE",
  independent_same_event_verified:false,article_commercial_rights_verified:false,
});
const wrap=(originals:unknown[])=>({
  schema:"geomacro.on-demand-private-evidence-qualification.v1",
  country_iso3:"USA",originals,
}) as unknown as QualifiedPrivateEvidence;
describe("curated official pair lanes remain review-only",()=>{
  it("finds two distinct original issuers without granting same-event or rights",()=>{
    const pairs=pairOnDemandOriginalsForIndependentReview(wrap([
      source("us_bls_original_publisher","a"),
      source("us_federal_reserve_original_publisher","b"),
    ]));
    expect(pairs).toHaveLength(1);
    expect(pairs[0].verification).toBe("ORIGINALS_IDENTIFIED_SAME_EVENT_NOT_YET_VERIFIED");
    expect(pairs[0].item_commercial_rights_verified).toBe(false);
    expect(pairs[0].qualified_for_payment).toBe(false);
    expect(publicOnDemandReviewPairCount(pairs)).toMatchObject({
      independent_official_pair_candidates_for_review:1,
      independent_same_event_claims_verified:0,payment_eligible:false,
    });
  });
  it("rejects same issuer, cross-country and outside original date window",()=>{
    expect(pairOnDemandOriginalsForIndependentReview(wrap([
      source("us_bls_original_publisher","a"),
      source("us_bls_original_release","b"),
    ]))).toHaveLength(0);
    expect(pairOnDemandOriginalsForIndependentReview(wrap([
      source("us_bls_original_publisher","a"),
      {...source("us_federal_reserve_original_publisher","b"),subject_country_iso3:"CAN"},
    ]))).toHaveLength(0);
    expect(pairOnDemandOriginalsForIndependentReview(wrap([
      source("us_bls_original_publisher","a"),
      source("us_federal_reserve_original_publisher","b","2026-10-27T12:00:00Z"),
    ]))).toHaveLength(0);
  });
  it("does not accept claimed pre-verified private originals in a review-only engine",()=>{
    expect(pairOnDemandOriginalsForIndependentReview(wrap([
      source("us_bls_original_publisher","a"),
      {...source("us_federal_reserve_original_publisher","b"),
       independent_same_event_verified:true},
    ]))).toHaveLength(0);
  });
});
