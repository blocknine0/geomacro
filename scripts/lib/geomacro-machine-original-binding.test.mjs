import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {verifyGeomacroTwoOriginalMachineBinding} from "./geomacro-machine-original-binding.mjs";
import {sameEventClaimHash} from "./independent-same-event-qualification.mjs";
const sha=value=>createHash("sha256").update(value).digest("hex");
const now=new Date("2026-10-10T11:00:00.000Z");
const claimIdentity={
  country_iso3:"USA",event_type:"central_bank_policy",
  actor_id:"federal_reserve",target_id:"us_rates",
  location_id:"washington_dc",occurred_at:"2026-10-10T09:55:00Z",
};
const claim=sameEventClaimHash("macro",claimIdentity);
const htmlAt=date=>`<!DOCTYPE html><html><head>
<meta property="article:published_time" content="${date}">
</head><body>Independent first-party article fixture, not actual news</body></html>`;
const fedHtml=htmlAt("2026-10-10T10:05:00Z");
const ecbHtml=htmlAt("2026-10-10T10:10:00Z");
const fed={
  category:"macro",event:claimIdentity,same_event_claim_sha256:claim,
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
  original_article_sha256:sha(fedHtml),
  original_published_at:"2026-10-10T10:05:00Z",
};
const ecb={...fed,
  original_article_url:"https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp261010.en.html",
  publisher_host:"www.ecb.europa.eu",
  publisher_organization_id:"ecb",
  originating_reporting_organization_id:"ecb",
  original_article_sha256:sha(ecbHtml),
  original_published_at:"2026-10-10T10:10:00Z",
};
const fetched=[];
const fetchImpl=async(url,options)=>{
  fetched.push({url,method:options.method,redirect:options.redirect});
  return new Response(url===fed.original_article_url?fedHtml:ecbHtml,{
    status:200,headers:{"content-type":"text/html"}});
};
const run=(candidates,fetcher=fetchImpl)=>
  verifyGeomacroTwoOriginalMachineBinding({candidates,now,fetchImpl:fetcher});
test("two genuine byte-readback fixtures bind hash/clock to one private claim, no paid GRO",async()=>{
  fetched.length=0;
  const report=await run([fed,ecb]);
  assert.equal(report.accepted,true);
  assert.equal(report.status,"TWO_ORIGINAL_BYTES_BOUND_SEMANTIC_AND_RIGHTS_PENDING");
  assert.equal(report.independently_reread_original_count,2);
  assert.equal(report.observed_claim_sha256,claim);
  assert.match(report.exact_original_evidence_set_sha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(fetched.map(x=>[x.method,x.redirect]),[
    ["GET","error"],["GET","error"]]);
  assert.equal(report.semantic_same_event_claim_verified,false);
  assert.equal(report.source_derived_commercial_rights_verified,false);
  assert.equal(report.signed_commercial_gro,false);
  assert.equal(report.payment_authorized,false);
  assert.deepEqual([report.b2_requests,report.d1_writes,report.supabase_requests,report.payments],
    [0,0,0,0]);
  const publicLeak=JSON.stringify(report);
  for(const secret of ["federalreserve.gov","ecb.europa.eu","us_rates",
      "Independent first-party article fixture"])
    assert.equal(publicLeak.includes(secret),false);
});
test("URL identity hashes, tampered original bytes and fake paper confirmation do not pass binding",async()=>{
  const urlFingerprint={...fed,original_article_sha256:sha(fed.original_article_url)};
  const fakeContent={...fed,original_article_sha256:sha("made-up-HTML")};
  for(const bad of [urlFingerprint,fakeContent]){
    const receipt=await run([bad,ecb]);
    assert.equal(receipt.accepted,false);
    assert.equal(receipt.status,"ORIGINAL_READBACK_NOT_PROVEN");
    assert.equal(receipt.signed_commercial_gro,false);
    assert.equal(receipt.payment_authorized,false);
  }
});
test("single issuer, syndicated repost, stale native date and contradictory issuer are never admitted",async()=>{
  fetched.length=0;
  for(const rows of [
    [fed],
    [fed,{...fed,original_article_sha256:sha("second headline")}],
    [fed,{...ecb,syndicated_from:fed.original_article_url}],
    [fed,{...ecb,reporting_position:"disputes"}],
    [fed,{...ecb,original_published_at:"2026-10-09T04:00:00Z"}],
    [fed,{...ecb,same_event_claim_sha256:sha("unrelated event")}],
  ]){
    await assert.rejects(run(rows),/GEOMACRO_MACHINE_ORIGINAL_BINDING_REJECTED/);
  }
  assert.equal(fetched.length,0);
});
test("page native-clock drift, spoofed HTML meta, denial all fail without rights or settlement",async()=>{
  const bogus=[
    async(url)=>new Response(htmlAt("2026-10-10T05:30:00Z"),
      {status:200,headers:{"content-type":"text/html"}}),
    async(url)=>new Response("<html>modified yesterday but not original</html>",
      {status:200,headers:{"content-type":"text/html"}}),
    async(url)=>new Response("Denied",{status:403,
      headers:{"content-type":"text/html"}}),
  ];
  for(const fn of bogus){
    const out=await run([fed,ecb],fn);
    assert.equal(out.accepted,false);
    assert.equal(out.semantic_same_event_claim_verified,false);
    assert.equal(out.payment_authorized,false);
    assert.equal(out.signed_commercial_gro,false);
  }
});
