import test from "node:test";
import assert from "node:assert/strict";
import {
  inspectFirstEarningJourney,verifyLatestObservation,verifyPublicBuild,
} from "./verify-first-earning-separate-live.mjs";

const sha="a".repeat(40);
const now=new Date("2026-10-13T16:00:00.000Z");
const categories=["geopolitics","macro-fx","critical-minerals"];
const safeMarker=()=>({
  schema_version:"geomacro.deployment-build.v1",
  canonical_repository:"blocknine0/geomacro",
  canonical_main_sha:sha,production_activation_performed:false,
});
const safeObservation=(category, findings=[])=>({
  schema_version:"geomacro.category-live-official-observation.v1",
  ok:true,category,checked_at:now.toISOString(),
  observation_mode:"UNSCORED_OFFICIAL_RELEASES",
  status:findings.length?"CURRENT_OFFICIAL_OBSERVATIONS_AVAILABLE":
    "NO_QUALIFYING_ORIGINAL_RELEASE_IN_24H",
  latest_original_published_at:findings[0]?.published_at??null,
  max_original_age_hours:24,publication_delay_minutes:15,findings,
  licensed_source_credits:[],
  source_identity_disclosed_for_mandatory_credit_only:false,
  source_urls_disclosed:false,raw_publisher_content_delivered:false,
  current_signed_risk_intelligence_verified:false,
  independent_same_event_verification:false,
  signed_gro_generated:false,x402_payment_required:false,
  paid_delivery_authorized_by_observations:false,
  production_paid_result_verified:false,durable_storage_written:false,
});
const recent={
  id:"safe-original-01",topic:"foreign-policy monitoring",
  what_changed:"A first-party official publisher issued a dated policy update.",
  why_it_matters:"The original may alter monitoring priorities; no scored risk was inferred.",
  published_at:"2026-10-13T14:20:00.000Z",date_precision:"exact",
  evidence_class:"original_publisher_release_unscored",
  same_event_corroborated:false,risk_score:null,
};
const mockFetch=(options={})=>async(url,init)=>{
  assert.equal(init.method,"GET");
  assert.equal(init.redirect,"error");
  assert.equal(new Headers(init.headers).has("payment-signature"),false);
  assert.equal(new Headers(init.headers).has("authorization"),false);
  const path=new URL(String(url)).pathname;
  let value;
  if(path==="/.well-known/geomacro-build.json")value=safeMarker();
  else {
    const category=categories.find(c=>path.endsWith("/"+c));
    assert.ok(category,"Unrecognized outward request");
    value=safeObservation(category,
      category==="geopolitics"?[recent]:[]);
  }
  if(options.mutate)value=options.mutate(path,value);
  return Response.json(value,{status:options.status?.(path)??200});
};

test("published exact-main plus three source-free GET category observations are read-only",async()=>{
  const checks=[];
  const result=await inspectFirstEarningJourney({
    expectedSha:sha,now,fetchImpl:async(url,init)=>{
      checks.push({url:String(url),method:init.method,headers:init.headers});
      return mockFetch()(url,init);
    },
  });
  assert.equal(checks.length,4);
  assert.deepEqual(checks.map(x=>x.method),["GET","GET","GET","GET"]);
  assert.equal(result.exact_main_published,true);
  assert.equal(result.free_category_contracts_verified,3);
  assert.equal(result.free_category_healthy_count,3);
  assert.equal(result.free_category_live_findings,1);
  assert.equal(result.first_real_earning_ready,false);
  assert.equal(result.payment_signature_sent,false);
  assert.equal(result.settlement_or_charge_attempted,false);
  assert.equal(result.raw_publisher_data_logged,false);
  assert.equal(JSON.stringify(result).includes("https://"),false);
});

test("actual available publishers but no new releases NEVER constitute paid intelligence",async()=>{
  const result=await inspectFirstEarningJourney({
    expectedSha:sha,now,fetchImpl:mockFetch(),
  });
  assert.equal(result.free_category_live_findings,1);
  assert.equal(result.paid_signed_gro_verified,false);
  assert.equal(result.mainnet_payment_configured_proven,false);
  assert.equal(result.first_real_earning_ready,false);
});

test("rejects false risk score, fake signed GRO, source URLs and unembargoed article",()=>{
  const cases=[
    {...safeObservation("geopolitics",[recent]),signed_gro_generated:true},
    {...safeObservation("geopolitics",[recent]),x402_payment_required:true},
    {...safeObservation("geopolitics",[recent]),raw_publisher_content_delivered:true},
    safeObservation("geopolitics",[{...recent,risk_score:50}]),
    safeObservation("geopolitics",[{...recent,what_changed:"https://publisher.invalid/raw"}]),
    safeObservation("geopolitics",[{...recent,published_at:"2026-10-13T15:55:00Z"}]),
    safeObservation("geopolitics",[{...recent,published_at:"2026-10-11T12:00:00Z"}]),
    safeObservation("geopolitics",[{...recent,date_precision:"day",published_at:"2026-10-13"}]),
  ];
  for(const payload of cases)
    assert.throws(()=>verifyLatestObservation(payload,"geopolitics",now.getTime()));
});

test("rejects false source-credit metadata and wrong category",()=>{
  const cases=[
    {...safeObservation("macro-fx"),licensed_source_credits:["https://secret.example/raw"]},
    {...safeObservation("macro-fx"),source_identity_disclosed_for_mandatory_credit_only:true},
    {...safeObservation("macro-fx"),latest_original_published_at:"2026-10-13T14:20:00Z"},
    {...safeObservation("macro-fx",[recent]),status:"NO_QUALIFYING_ORIGINAL_RELEASE_IN_24H"},
  ];
  for(const p of cases)
    assert.throws(()=>verifyLatestObservation(p,"macro-fx",now.getTime()));
  assert.throws(()=>verifyLatestObservation(safeObservation("macro-fx"),"critical-minerals",now.getTime()));
});

test("old or unpublished main is a visible blocker, without interpreting free discovery as earning",async()=>{
  assert.throws(()=>verifyPublicBuild(safeMarker(),"b".repeat(40)));
  const result=await inspectFirstEarningJourney({
    expectedSha:"b".repeat(40),now,fetchImpl:mockFetch(),
  });
  assert.equal(result.exact_main_published,false);
  assert.equal(result.deployment_failure_code,"EXACT_MAIN_PUBLICATION_NOT_VERIFIED");
  assert.equal(result.free_category_contracts_verified,0);
  assert.equal(result.first_real_earning_ready,false);
});

test("one unavailable category must not hide other categories or trigger paid fallback",async()=>{
  const result=await inspectFirstEarningJourney({
    expectedSha:sha,now,fetchImpl:mockFetch({
      status:path=>path.endsWith("/macro-fx")?503:200,
    }),
  });
  assert.equal(result.exact_main_published,true);
  assert.equal(result.free_category_contracts_verified,2);
  assert.equal(result.category_checks[1].contract_verified,false);
  assert.equal(result.first_real_earning_ready,false);
  assert.equal(result.payment_signature_sent,false);
});
