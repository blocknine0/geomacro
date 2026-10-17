import {describe,expect,it} from "vitest";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {gzipSync} from "node:zlib";
import {
  sameEventClaimHash,derivedCustomerRowSha256,
  qualificationReviewSigningBytes,SAME_EVENT_QUALIFICATION_SCHEMA,
} from "../../scripts/lib/independent-same-event-qualification.mjs";
import {verifyThreeDomainReviewerHandoff}
  from "../../scripts/lib/three-domain-reviewed-handoff.mjs";

// Synthetic fixtures ONLY; no production issuer facts, rights, or reviewer
// approvals are asserted by these unit tests.
const NOW=new Date("2026-10-15T07:00:00.000Z");
const {privateKey,publicKey}=generateKeyPairSync("ed25519");
const pem=publicKey.export({type:"spki",format:"pem"}).toString();
const time=n=>new Date(NOW.getTime()-n*60000).toISOString();
const hash=v=>createHash("sha256").update(v).digest("hex");
const signed=input=>({signed_input:input,
  review_signature_base64:sign(null,Buffer.from(JSON.stringify(input)),privateKey).toString("base64")});
const sources=[
  ["geopolitics","sanctions_policy",
    ["news.un.org","un_news","un_news_security_original_rss_review","/en/story/2026/10/example"],
    ["www.gov.uk","uk_fcdo","uk_fcdo_original_foreign_policy_atom_review","/government/news/example"]],
  ["macro","central_bank_policy",
    ["www.federalreserve.gov","federal_reserve","fed_monetary_original_press_rss_review","/newsevents/pressreleases/example"],
    ["www.ecb.europa.eu","ecb","ecb","/press/pr/date/2026/html/example.html"]],
  ["rare_earth","critical_mineral_supply",
    ["www.usgs.gov","usgs","usgs_minerals_original_news_rss_review","/news/example"],
    ["www.canada.ca","natural_resources_canada","nrcan_government_news_original_atom_review","/en/natural-resources-canada/news/example"]],
];
function fixture(){
  const rows=sources.map(([category],i)=>({
    id:"reviewed-fixture-"+i,category,public_status:"verified_b2",
    severity:50+i,delta:null,created_at:time(20),published_at:time(24),
    source_title:"Geomacro finds derived risk from independently verified "+category,
    summary:"Derived structural evidence about a specific independently reviewed event",
  }));
  const eventPackages=sources.map(([category,eventType,first,second],i)=>{
    const row=rows[i],claimEvent={country_iso3:"USA",event_type:eventType,
      actor_id:"issuer_one",target_id:"target_two",
      location_id:"event_site",occurred_at:time(30)};
    const claim=sameEventClaimHash(category,claimEvent);
    const base={schema:SAME_EVENT_QUALIFICATION_SCHEMA,
      event_id:row.id,category,event:claimEvent,
      same_event_claim_sha256:claim,
      independent_same_event_review_verified:true,
      same_event_reviewer_receipt_sha256:hash("signed reviewer receipt "+i),
      reviewed_derived_row_sha256:derivedCustomerRowSha256(row),
      counterevidence_review:{
        independent_counterevidence_review_completed:true,
        review_receipt_sha256:hash("independent conflict screening "+i),
        reviewed_at:time(15),sources_screened:4,
        material_conflicts_detected:0,material_conflicts_resolved:0,
        unresolved_material_conflicts:0,retractions_detected:0,
      },
      evidence:[first,second].map(([host,org,id,path],j)=>({
        url:"https://"+host+path,publisher_host:host,
        publisher_organization_id:org,
        originating_reporting_organization_id:org,
        source_registry_id:id,
        native_published_at_verified:true,
        original_published_at:time(j===0?24:23),
        original_article_content_verified:true,
        original_article_sha256:hash("original bytes "+i+j),
        independent_review_sha256:hash("article review "+i+j),
        rights_receipt_sha256:hash("approved commercial rights "+i+j),
        commercial_derived_use_rights_verified:true,
        independently_authored_reporting_verified:true,
        reporting_position:"confirms",syndicated_from:null,
        original_publisher_url_verified:true,
        same_event_claim_sha256:claim,
      })),
    };
    return {...base,review_signature_base64:sign(null,
      qualificationReviewSigningBytes(base),privateKey).toString("base64")};
  });
  const events=rows.map((r,i)=>({
    id:r.id,category:r.category,severity:r.severity,confidence:80,
    published_at:r.published_at,created_at:r.created_at,
    story_cluster_id:"approved-cross-run-"+i,
  }));
  const old=[
    {id:"11111111-1111-4111-8111-111111111111",as_of:time(45),
      verification_status:"verified"},
    {id:"11111111-1111-4111-8111-111111111112",as_of:time(160),
      verification_status:"verified"},
  ];
  const history={
    schema:"geomacro.public-global-risk-history.v1",
    methodology_version:"gri-v1.2.0",
    verified_snapshot_rows:old,snapshot_as_of:old[0].as_of,
  };
  const compressed=gzipSync(Buffer.from(JSON.stringify(history)));
  const signedGri={
    schema:"geomacro.gri-v12-reviewed-current-input.v1",
    private_only:false,publication_review_authorized:true,
    original_sources_independently_verified:true,
    canonical_scoring_and_story_reviewed:true,
    commercial_derived_rights_verified:true,
    historical_lineage_reviewed:true,
    as_of:time(10),reviewed_at:time(8),
    customerRows:rows,eventPackages,events,
    history_b2_key:"geomacro-evidence/v1/history/global-risk/gri-v1.2.0/11111111-1111-4111-8111-111111111111.json.gz",
    history_b2_sha256:hash(compressed),
  };
  const certs=sources.map(([category,,a,b])=>signed({
    schema:"geomacro.current-country-category-certification.v1",
    country_iso3:"USA",category,
    source_ids:[a[2],b[2]],
    certification_state:"CERTIFIED",
    country_specific_original_evidence_verified:true,
    original_publisher_rights_verified:true,
    independent_same_event_review_verified:true,
    source_runtime_verified:true,
    certification_hash:hash("source cert "+category),
    verified_at:time(9),
  }));
  return {intelligence:{rows,eventPackages},reviewedGri:signed(signedGri),
    countryCategoryCertificates:certs,
    historicalB2Bytes:compressed,trustedReviewerPublicKeyPem:pem,now:NOW};
}

describe("strict independently reviewer-signed dual publisher handoff",()=>{
  it("verifies exact immutable current evidence and external historical B2 pin",()=>{
    const out=verifyThreeDomainReviewerHandoff(fixture());
    expect(out.receipt.qualified_event_count).toBe(3);
    expect(out.receipt.signed_country_category_cells).toBe(3);
    expect(out.receipt.historical_b2_bytes_verified).toBe(true);
    expect(out.receipt.payments_executed).toBe(0);
    expect(out.receipt.intelligence_input_sha256).toBe(hash(out.intelligenceInput));
    const intelligence=JSON.parse(out.intelligenceInput.toString());
    const gri=JSON.parse(out.reviewedGriInput.toString());
    expect(Object.keys(intelligence)).toEqual(["rows","eventPackages"]);
    expect(gri.signed_input.schema).toBe("geomacro.gri-v12-reviewed-current-input.v1");
    expect(gri.signed_input.history_b2_sha256).toBe(out.receipt.historical_b2_sha256);
    expect(JSON.stringify(out.receipt)).not.toContain("federalreserve.gov");
    expect(JSON.stringify(out.receipt)).not.toContain("example.html");
  });
  it("never self-signs, self-certifies, promotes private-only data or trusts forged historical SHA",()=>{
    const unsigned=fixture();
    unsigned.reviewedGri.review_signature_base64="A".repeat(86)+"==";
    expect(()=>verifyThreeDomainReviewerHandoff(unsigned)).toThrow(/REVIEW_SIGNATURE_INVALID/);
    const privateInput=fixture();
    privateInput.reviewedGri.signed_input.private_only=true;
    privateInput.reviewedGri=signed(privateInput.reviewedGri.signed_input);
    expect(()=>verifyThreeDomainReviewerHandoff(privateInput)).toThrow(/GRI_REVIEWED_CONTRACT_MISMATCH/);
    const uncertified=fixture();
    uncertified.countryCategoryCertificates[0].signed_input.certification_state="FALLBACK_ELIGIBLE";
    uncertified.countryCategoryCertificates[0]=signed(uncertified.countryCategoryCertificates[0].signed_input);
    expect(()=>verifyThreeDomainReviewerHandoff(uncertified)).toThrow(/COUNTRY_CATEGORY_UNCERTIFIED_OR_STALE/);
    const wrongBytes=fixture();
    wrongBytes.historicalB2Bytes=Buffer.from("not the signed compressed history");
    expect(()=>verifyThreeDomainReviewerHandoff(wrongBytes)).toThrow(/HISTORICAL_B2_EXACT_READBACK_HASH_MISMATCH/);
  });
  it("rejects signed country mismatches, source registry gaps and old original clocks",()=>{
    const noSource=fixture();
    delete noSource.intelligence.eventPackages[0].evidence[0].source_registry_id;
    expect(()=>verifyThreeDomainReviewerHandoff(noSource)).toThrow();
    const stale=fixture();
    stale.intelligence.rows[0].published_at=time(400);
    expect(()=>verifyThreeDomainReviewerHandoff(stale)).toThrow();
    const missing=fixture();
    missing.countryCategoryCertificates.pop();
    expect(()=>verifyThreeDomainReviewerHandoff(missing)).toThrow(/COUNTRY_CATEGORY_CERTIFICATION_MISSING/);
  });
});
