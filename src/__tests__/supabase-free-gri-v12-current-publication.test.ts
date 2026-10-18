import { describe, expect, it } from "vitest";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  computeReviewedCurrentGlobalRisk, preflightReviewedCurrentGlobalRisk,
  REVIEWED_GRI_INPUT_SCHEMA,
} from "../../scripts/lib/supabase-free-gri-v12-current.mjs";
import {
  sameEventClaimHash, derivedCustomerRowSha256,
  qualificationReviewSigningBytes, SAME_EVENT_QUALIFICATION_SCHEMA,
} from "../../scripts/lib/independent-same-event-qualification.mjs";
import { assemblePublicGlobalRisk } from "../lib/global-risk-assemble";
import { validateGlobalRiskContinuity } from "../lib/global-risk-continuity";

const now = new Date("2026-10-15T10:35:00.000Z");
const sha = (s:string) => createHash("sha256").update(s).digest("hex");
const key = generateKeyPairSync("ed25519");
const pem = key.publicKey.export({ type:"spki", format:"pem" }).toString();
const time = (ago:number) => new Date(now.getTime()-ago*60000).toISOString();
const signJson = (value:any) => sign(null, Buffer.from(JSON.stringify(value)), key.privateKey).toString("base64");
const domains = [
  ["geopolitics","sanctions_policy",["news.un.org","un_news","/en/story/a"],["www.gov.uk","uk_fcdo","/government/news/b"]],
  ["macro","central_bank_policy",["www.federalreserve.gov","federal_reserve","/newsevents/pressreleases/a"],["www.ecb.europa.eu","ecb","/press/pr/date/2026/a"]],
  ["rare_earth","critical_mineral_supply",["www.usgs.gov","usgs","/news/a"],["www.canada.ca","natural_resources_canada","/en/natural-resources-canada/news/a"]],
] as const;
const hex = "a".repeat(64);

function sourcePackage(row:any,d:any) {
  const identity={country_iso3:"USA",event_type:d[1],actor_id:"original_actor",
    target_id:"original_target",location_id:"original_location",occurred_at:time(38)};
  const claim=sameEventClaimHash(d[0],identity);
  const candidate={
    schema:SAME_EVENT_QUALIFICATION_SCHEMA,event_id:row.id,category:row.category,
    event:identity,same_event_claim_sha256:claim,
    independent_same_event_review_verified:true,
    same_event_reviewer_receipt_sha256:sha("review"+row.id),
    reviewed_derived_row_sha256:derivedCustomerRowSha256(row),
    counterevidence_review:{independent_counterevidence_review_completed:true,
      review_receipt_sha256:sha("counter"+row.id),reviewed_at:time(12),
      sources_screened:4,material_conflicts_detected:0,material_conflicts_resolved:0,
      unresolved_material_conflicts:0,retractions_detected:0},
    evidence:[d[2],d[3]].map(([host,org,path],i)=>({
      url:"https://"+host+path,publisher_host:host,
      publisher_organization_id:org,originating_reporting_organization_id:org,
      original_article_sha256:sha(row.id+"bytes"+i),
      rights_receipt_sha256:sha(row.id+"rights"+i),
      independent_review_sha256:sha(row.id+"originalreview"+i),
      original_published_at:time(i===0?30:28),
      native_published_at_verified:true,original_article_content_verified:true,
      independently_authored_reporting_verified:true,
      commercial_derived_use_rights_verified:true,reporting_position:"confirms",
      syndicated_from:null,original_publisher_url_verified:true,
      same_event_claim_sha256:claim,
    })),
  };
  return {...candidate,review_signature_base64:sign(null,
    qualificationReviewSigningBytes(candidate),key.privateKey).toString("base64")};
}

function historicalSnapshot(i:number,ago:number):any {
  return {
    id:"11111111-1111-4111-8111-11111111111"+i,as_of:time(ago),
    methodology_version:"gri-v1.2.0",methodology_hash:hex,input_hash:hex,
    evidence_hash:hex,calculation_hash:hex,disposition_hash:hex,
    proof_hash:hex,proof_version:"gri-proof-v1.2.0",
    verification_status:"verified",candidate_event_count:3,
    reconciliation_residual:0,change_residual:0,
    raw_score:40+i,display_score:40+i,coverage:1,weighted_confidence:75,
    active_categories:domains.map(d=>d[0]),event_count:3,source_count:3,
    independent_story_count:3,
    story_correlation_version:"story-correlation-v1.0.0",
    story_correlation_prompt_version:"story-match-title-v1.0.0",
    category_breakdown:domains.map(d=>({category:d[0],score:40+i,
      confidence:75,sourceCount:1,eventCount:1,storyCount:1,
      baseWeight:1/3,normalizedWeight:1/3,contributionPoints:(40+i)/3})),
    previous_as_of:null,previous_raw_score:null,previous_display_score:null,
    change_points:null,change_hash:null,change_attribution:null,
    explanation:null,status:"published",
  };
}

function fixture() {
  const old=[historicalSnapshot(2,90),historicalSnapshot(1,150)];
  const data=assemblePublicGlobalRisk(old,[],Date.parse(old[0].as_of));
  const history={schema:"geomacro.public-global-risk-history.v1",
    source_project:"ldpwajisioljyjtojvfx",
    methodology_version:"gri-v1.2.0",snapshot_id:old[0].id,
    snapshot_as_of:old[0].as_of,verified_snapshot_rows:old,data};
  const customerRows=domains.map((d,i)=>({
    id:"reviewed-event-"+i,category:d[0],
    source_title:"Geomacro finds verified risk in "+d[0]+" original developments",
    summary:"Independently reviewed original reporting reveals material global risk",
    severity:51+i,delta:null,created_at:time(20),published_at:time(30),
    public_status:"verified_b2",
  }));
  const events=customerRows.map((row,i)=>({
    id:row.id,category:row.category,severity:row.severity,confidence:88,
    created_at:row.created_at,published_at:row.published_at,
    source_name:"Original confidential publisher "+i,
    source_domain:domains[i][2][0],
    source_url:"https://"+domains[i][2][0]+domains[i][2][2],
    source_title:"Private original first-party article "+i,
    summary:"Privately reviewed original article with valid scoring model output",
    classification_provider:"groq",classification_model:"reviewed-classifier",
    classification_version:"event-severity-v1.0.5",
    classification_prompt_version:"risk-desk-filter-v1.0.5",
    classification_scored_at:time(16),classification_input_hash:sha("class"+i),
    story_cluster_id:"approved-cluster-"+i,
    story_canonical_label:"Reviewed separate development "+i,
    story_assignment_decision:"anchor",story_match_confidence:100,
    story_decision_rationale:"Genuinely verified independent story grouping",
    story_clustering_provider:"deterministic",story_clustering_model:"reviewed",
    story_clustering_version:"story-correlation-v1.0.0",
    story_clustering_prompt_version:"story-match-title-v1.0.0",
    story_clustering_scored_at:time(15),story_clustering_input_hash:sha("story"+i),
  }));
  const signed_input={
    schema:REVIEWED_GRI_INPUT_SCHEMA,private_only:false,
    publication_review_authorized:true,
    original_sources_independently_verified:true,
    canonical_scoring_and_story_reviewed:true,
    commercial_derived_rights_verified:true,
    historical_lineage_reviewed:true,
    as_of:time(10),reviewed_at:time(9),
    history_b2_key:"geomacro-evidence/v1/history/global-risk/gri-v1.2.0/"+old[0].id+".json.gz",
    history_b2_sha256:sha("exact historical B2 readback"),
    customerRows,events,
    eventPackages:customerRows.map((row,i)=>sourcePackage(row,domains[i])),
  };
  return {reviewed:{signed_input,review_signature_base64:signJson(signed_input)},history};
}
const run=(f:ReturnType<typeof fixture>,historySha=f.reviewed.signed_input.history_b2_sha256)=>
  computeReviewedCurrentGlobalRisk({reviewed:f.reviewed,history:f.history,
    verifiedHistoryB2Sha256:historySha,trustedReviewerPublicKeyPem:pem,now});

describe("Supabase-free Global Risk GRI v1.2 signed hot publisher",()=>{
  it("uses canonical scoring + real historical continuity, excludes private evidence from public B2/D1",()=>{
    const f=fixture();
    expect(validateGlobalRiskContinuity(f.history.data,Date.parse(f.history.snapshot_as_of)).ok).toBe(true);
    expect(preflightReviewedCurrentGlobalRisk({
      reviewed:f.reviewed,trustedReviewerPublicKeyPem:pem,now,
    }).qualified_receipt_sha256).toMatch(/^[a-f0-9]{64}$/);
    const result=run(f);
    expect(result.liveValue.data.verificationStatus).toBe("verified");
    expect(result.liveValue.data.methodologyVersion).toBe("gri-v1.2.0");
    expect(result.liveValue.data.coverage).toBe(1);
    // The independently pinned historical B2 anchor is a REAL numeric
    // comparison, never a fabricated current news score or event attribution.
    expect(result.liveValue.data.previousRaw).toBe(42);
    expect(result.liveValue.data.previous).toBe(42);
    expect(result.liveValue.data.rawScore).toBeGreaterThan(42);
    expect(result.historyValue.verified_snapshot_rows[0].previous_as_of)
      .toBe(f.history.snapshot_as_of);
    expect(result.historyValue.verified_snapshot_rows[0].previous_raw_score).toBe(42);
    expect(result.historyValue.verified_snapshot_rows[0].change_points)
      .toBeCloseTo(result.liveValue.data.rawScore - 42,10);
    expect(result.historyValue.verified_snapshot_rows[0].change_hash).toBeNull();
    expect(result.historyValue.verified_snapshot_rows[0].change_attribution).toBeNull();
    expect(result.reviewProof.historical_numeric_comparison)
      .toBe("VERIFIED_HISTORICAL_RAW_SCORE_DIFFERENCE_ONLY");
    expect(result.reviewProof.numerical_change_not_event_attribution).toBe(true);

    expect(result.liveValue.data.domainIndices.macro.series["7D"].buckets.length).toBeGreaterThanOrEqual(2);
    expect(result.reviewProof.portable_proof_hash).toBe(result.liveValue.data.proofHash);
    expect(result.liveValue.data.recentEvents).toEqual([]);
    expect(JSON.stringify(result.liveValue)).not.toContain("Private original");
    expect(JSON.stringify(result.liveValue)).not.toContain("federalreserve.gov");
    expect(result.historyValue.verified_snapshot_rows.length).toBe(3);
  });
  it("rejects signed private-only stages, stale originals and re-signed GRI-only score laundering",()=>{
    const privateOnly=fixture();
    privateOnly.reviewed.signed_input.private_only=true;
    privateOnly.reviewed.review_signature_base64=signJson(privateOnly.reviewed.signed_input);
    expect(()=>run(privateOnly)).toThrow("GRI_PUBLIC_REVIEWED_CURRENT_INPUT_REQUIRED");
    const stale=fixture();
    stale.reviewed.signed_input.events[0].published_at=time(125);
    stale.reviewed.review_signature_base64=signJson(stale.reviewed.signed_input);
    expect(()=>run(stale)).toThrow("GRI_PUBLIC_EVENT_ORIGINAL_TIME_STALE_OR_INVALID");
    const changed=fixture();
    changed.reviewed.signed_input.events[1].severity=95;
    changed.reviewed.review_signature_base64=signJson(changed.reviewed.signed_input);
    expect(()=>run(changed)).toThrow("GRI_PUBLIC_SIGNED_CUSTOMER_ROW_TO_CANONICAL_SCORE_MISMATCH");
  });
  it("rejects forged reviewer signatures, private singleton clusters and unverified archive bytes",()=>{
    const forged=fixture();
    forged.reviewed.signed_input.events[0].severity=60;
    expect(()=>run(forged)).toThrow("GRI_PUBLIC_REVIEW_SIGNATURE_INVALID");
    const singleton=fixture();
    singleton.reviewed.signed_input.events[0].story_cluster_id="private-singleton:fake";
    singleton.reviewed.review_signature_base64=signJson(singleton.reviewed.signed_input);
    expect(()=>run(singleton)).toThrow("GRI_PUBLIC_UNREVIEWED_EVENT_OR_PRIVATE_SINGLETON");
    expect(()=>run(fixture(),"0".repeat(64))).toThrow("GRI_PUBLIC_HISTORY_SIGNED_B2_READBACK_HASH_MISMATCH");
    const missing=fixture();
    missing.history.verified_snapshot_rows.pop();
    expect(()=>run(missing)).toThrow("GRI_PUBLIC_HISTORY_ARCHIVE_CONTRACT_INVALID");
  });
});
