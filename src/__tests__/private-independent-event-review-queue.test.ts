import {describe,expect,it} from "vitest";
import {createHash} from "node:crypto";
import {clusterPrivateIndependentEventCandidates} from "../../scripts/lib/private-independent-event-review-queue.mjs";
import {sameEventClaimHash} from "../../scripts/lib/independent-same-event-qualification.mjs";

const now=new Date("2026-10-10T11:00:00.000Z");
const sha=(t:string)=>createHash("sha256").update(t).digest("hex");
const event={
  country_iso3:"USA",event_type:"central_bank_policy",
  actor_id:"federal_reserve",target_id:"us_rates",
  location_id:"washington_dc",occurred_at:"2026-10-10T09:55:00Z",
};
const sameHash=sameEventClaimHash("macro",event);
const fed={
  category:"macro",event,same_event_claim_sha256:sameHash,
  original_article_url:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010a.htm",
  publisher_host:"www.federalreserve.gov",
  publisher_organization_id:"federal_reserve",
  originating_reporting_organization_id:"federal_reserve",
  private_only:true,native_published_at_verified:true,
  original_article_content_verified:true,
  original_publisher_url_verified:true,
  independently_authored_reporting_verified:true,
  syndicated_from:null,commercial_eligible:false,
  original_article_sha256:sha("fed-original-article-body"),
  original_published_at:"2026-10-10T10:05:00Z",
};
const ecb={...fed,
  original_article_url:"https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp261010.en.html",
  publisher_host:"www.ecb.europa.eu",
  publisher_organization_id:"ecb",
  originating_reporting_organization_id:"ecb",
  original_article_sha256:sha("independently-authored-ecb-confirmation"),
  original_published_at:"2026-10-10T10:10:00Z",
};
const grouped=(candidates:unknown[])=>
  clusterPrivateIndependentEventCandidates({candidates,now});

describe("#1827 private source-native same-event candidate queue",()=>{
  it("groups exact same event across two genuine first-party organizations without raw publication",()=>{
    const receipt=grouped([fed,ecb]);
    expect(receipt.examined_original_candidates).toBe(2);
    expect(receipt.matched_event_claims).toBe(1);
    expect(receipt.review_candidates[0]).toMatchObject({
      event_claim_sha256:sameHash,category:"macro",
      independent_origin_count:2,distinct_article_hash_count:2,
      original_publication_spread_minutes:5,
      state:"MULTI_ORIGIN_REVIEW_REQUIRED",
      commercial_eligible:false,review_required:true,
    });
    expect(receipt.paid_data_eligible).toBe(false);
    expect(receipt.independent_human_or_trusted_review_completed).toBe(false);
    expect(receipt.original_legal_rights_proven).toBe(false);
    expect(receipt.d1_writes).toBe(0);
    expect(receipt.b2_requests).toBe(0);
    expect(receipt.external_payment_performed).toBe(false);
    const serialized=JSON.stringify(receipt);
    for(const privatePart of ["federalreserve.gov","ecb.europa.eu",
      "monetary20261010a","us_rates","washington_dc",
      "fed-original-article-body"]){
      expect(serialized).not.toContain(privatePart);
    }
    expect(receipt.receipt_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not inflate multi-source confidence from repeated same-author material",()=>{
    const duplicated=grouped([fed,fed,{...fed,
      original_article_url:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010b.htm",
      original_article_sha256:sha("different-institutional-page"),
    }]);
    expect(duplicated.examined_original_candidates).toBe(3);
    expect(duplicated.distinct_original_artifacts).toBe(2);
    expect(duplicated.review_candidates[0].state).toBe("SINGLE_ORIGIN");
    expect(duplicated.review_candidates[0].independent_origin_count).toBe(1);
    const copied=grouped([fed,{...ecb,original_article_sha256:fed.original_article_sha256}]);
    expect(copied.review_candidates[0].state).toBe("SAME_CONTENT");
    const tooSpread=grouped([fed,{...ecb,original_published_at:"2026-10-10T08:33:00Z"}]);
    expect(tooSpread.review_candidates[0].state).toBe("TEMPORAL_SPREAD");
  });
  it("holds one verified original or zero originals as UNQUALIFIED",()=>{
    expect(grouped([])).toMatchObject({matched_event_claims:0,paid_data_eligible:false});
    expect(grouped([fed]).review_candidates[0].state).toBe("SINGLE_ORIGIN");
  });
  it("blocks forged organizations, off-host URLs, index dates, syndication and false provenance",()=>{
    for(const invalid of [
      {...fed,publisher_organization_id:"ecb"},
      {...fed,originating_reporting_organization_id:"ecb"},
      {...fed,original_article_url:"https://www.federalreserve.gov.attacker.invalid/"},
      {...fed,original_article_url:"http://www.federalreserve.gov/newsevents"},
      {...fed,original_article_url:"https://www.federalreserve.gov/#fragment"},
      {...fed,native_published_at_verified:false},
      {...fed,original_article_content_verified:false},
      {...fed,original_publisher_url_verified:false},
      {...fed,independently_authored_reporting_verified:false},
      {...fed,syndicated_from:"some-other-wire"},
      {...fed,private_only:false},
      {...fed,commercial_eligible:true},
      {...fed,original_published_at:"2026-10-11T10:05:00Z"},
      {...fed,original_published_at:"2026-10-09T02:05:00Z"},
      {...fed,same_event_claim_sha256:sha("unrelated-event")},
      {...fed,category:"rare_earth",
        same_event_claim_sha256:sameEventClaimHash("rare_earth",event)},
      {...fed,event:{...event,country_iso3:"ZZZ"},
        same_event_claim_sha256:sameEventClaimHash("macro",{...event,country_iso3:"ZZZ"})},
    ])expect(()=>grouped([invalid])).toThrow("PRIVATE_EVENT_ORIGINAL_CANDIDATE_INVALID");
  });
});
