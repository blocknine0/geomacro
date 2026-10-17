import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {evaluateGeomacroMachineCorroboration} from "./geomacro-machine-corroboration.mjs";
import {sameEventClaimHash} from "./independent-same-event-qualification.mjs";

const sha=s=>createHash("sha256").update(s).digest("hex");
const now=new Date("2026-10-10T11:00:00.000Z");
const event={
  country_iso3:"USA",event_type:"central_bank_policy",
  actor_id:"federal_reserve",target_id:"us_rates",
  location_id:"washington_dc",occurred_at:"2026-10-10T09:55:00Z",
};
const claim=sameEventClaimHash("macro",event);
const fed={
  category:"macro",event,same_event_claim_sha256:claim,
  original_article_url:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010a.htm",
  publisher_host:"www.federalreserve.gov",
  publisher_organization_id:"federal_reserve",
  originating_reporting_organization_id:"federal_reserve",
  private_only:true,native_published_at_verified:true,
  original_article_content_verified:true,
  original_publisher_url_verified:true,
  independently_authored_reporting_verified:true,
  syndicated_from:null,commercial_eligible:false,
  reporting_position:"confirms",
  original_article_sha256:sha("private-federal-reserve-article"),
  original_published_at:"2026-10-10T10:05:00Z",
};
const ecb={...fed,
  original_article_url:"https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp261010.en.html",
  publisher_host:"www.ecb.europa.eu",
  publisher_organization_id:"ecb",
  originating_reporting_organization_id:"ecb",
  original_article_sha256:sha("private-independent-ecb-original"),
  original_published_at:"2026-10-10T10:10:00Z",
};
const run=candidates=>evaluateGeomacroMachineCorroboration({candidates,now});

test("two independent original issuers produce only an internal no-reviewer machine candidate",()=>{
  const a=run([fed,ecb]),b=run([fed,ecb]);
  assert.equal(a.schema,"geomacro.private-automated-same-event-candidate.v1");
  assert.equal(a.multiple_original_machine_candidates,1);
  assert.equal(a.claims[0].candidate_status,
    "TWO_ORIGINAL_MACHINE_MATCH_REQUIRES_SOURCE_AUDIT");
  assert.equal(a.report_sha256,b.report_sha256);
  assert.equal(a.human_or_independent_external_review_required_to_observe,false);
  assert.equal(a.independent_external_review_completed,false);
  assert.equal(a.publisher_article_readback_verified,false);
  assert.equal(a.licensed_commercial_source_rights_verified,false);
  assert.equal(a.commercial_eligible,false);
  assert.equal(a.x402_payment_authorized,false);
  assert.equal(a.signed_gro_verified,undefined);
  assert.deepEqual([a.d1_writes,a.b2_requests,a.supabase_writes,a.payments],[0,0,0,0]);
  const text=JSON.stringify(a);
  for(const source of ["federalreserve.gov","ecb.europa.eu","us_rates",
    "washington_dc","monetary20261010","private-independent-ecb-original"]){
    assert.equal(text.includes(source),false);
  }
});

test("same issuer, syndicated copies or single originals never qualify",()=>{
  const single=run([fed]);
  assert.equal(single.multiple_original_machine_candidates,0);
  assert.equal(single.claims[0].rejection_code,"SINGLE_ORIGIN");
  const replay=run([fed,{...fed,
    original_article_url:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010b.htm",
    original_article_sha256:sha("another page but same organization"),
  }]);
  assert.equal(replay.multiple_original_machine_candidates,0);
  assert.equal(replay.claims[0].rejection_code,"SINGLE_ORIGIN");
  assert.throws(()=>run([fed,{...ecb,syndicated_from:fed.original_article_url}]),
    /PRIVATE_EVENT_ORIGINAL_CANDIDATE_INVALID/);
});

test("retraction, dispute and copied original bytes override two matching issuers",()=>{
  const copy=run([fed,{...ecb,original_article_sha256:fed.original_article_sha256}]);
  assert.equal(copy.multiple_original_machine_candidates,0);
  assert.equal(copy.claims[0].rejection_code,"SAME_CONTENT");
  const disputed=run([fed,{...ecb,reporting_position:"disputes"}]);
  assert.equal(disputed.multiple_original_machine_candidates,0);
  assert.equal(disputed.claims[0].rejection_code,"MATERIAL_CONTRADICTION");
  const retracted=run([fed,ecb,{...fed,
    original_article_url:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010b.htm",
    original_article_sha256:sha("real retraction, never hide"),
    reporting_position:"retracts",
  }]);
  assert.equal(retracted.multiple_original_machine_candidates,0);
  assert.equal(retracted.claims[0].rejection_code,"MATERIAL_CONTRADICTION");
  assert.equal(retracted.x402_payment_authorized,false);
});

test("fake organizations, stale dates, missing original verification fail closed",()=>{
  for(const forged of [
    {...fed,original_article_content_verified:false},
    {...fed,native_published_at_verified:false},
    {...fed,publisher_organization_id:"ecb"},
    {...fed,original_article_url:"https://fed-news.malicious.invalid/foo"},
    {...fed,original_published_at:"2026-10-08T10:05:00Z"},
    {...fed,commercial_eligible:true},
  ])assert.throws(()=>run([forged]),/PRIVATE_EVENT_ORIGINAL_CANDIDATE_INVALID/);
});
