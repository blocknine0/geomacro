import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {sameEventClaimHash} from "./independent-same-event-qualification.mjs";
import {verifyMachineOriginalReadbacks} from "./geomacro-machine-original-readback.mjs";

const sha=s=>createHash("sha256").update(s).digest("hex");
const now=new Date("2026-10-10T11:00:00.000Z");
const event={country_iso3:"USA",event_type:"central_bank_policy",
  actor_id:"federal_reserve",target_id:"us_rates",
  location_id:"washington_dc",occurred_at:"2026-10-10T09:55:00Z"};
const hash=sameEventClaimHash("macro",event);
const fedHtml='<html><head><meta property="article:published_time" '+
  'content="2026-10-10T10:05:00Z"></head><body><h1>Monetary Policy Update</h1></body></html>';
const ecbHtml='<html><head><meta property="article:published_time" '+
  'content="2026-10-10T10:10:00Z"></head><body><h1>Policy Update</h1></body></html>';
const fed={category:"macro",event,same_event_claim_sha256:hash,
  original_article_url:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010a.htm",
  publisher_host:"www.federalreserve.gov",publisher_organization_id:"federal_reserve",
  originating_reporting_organization_id:"federal_reserve",
  private_only:true,native_published_at_verified:true,
  original_article_content_verified:true,original_publisher_url_verified:true,
  independently_authored_reporting_verified:true,syndicated_from:null,
  commercial_eligible:false,reporting_position:"confirms",
  original_article_sha256:sha(fedHtml),original_published_at:"2026-10-10T10:05:00Z"};
const ecb={...fed,
  original_article_url:"https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp261010.en.html",
  publisher_host:"www.ecb.europa.eu",publisher_organization_id:"ecb",
  originating_reporting_organization_id:"ecb",
  original_article_sha256:sha(ecbHtml),
  original_published_at:"2026-10-10T10:10:00Z"};
function mockFetch(url){
  const content=url===fed.original_article_url?fedHtml:ecbHtml;
  return Promise.resolve(new Response(content,{status:200,
    headers:{"content-type":"text/html;charset=utf-8"}}));
}

test("two exact original bytes plus issuer clocks verify, but never permit billing",async()=>{
  const result=await verifyMachineOriginalReadbacks({
    candidates:[fed,ecb],now,fetchImpl:mockFetch});
  assert.equal(result.structurally_matched_claim_count,1);
  assert.equal(result.article_checks_attempted,2);
  assert.equal(result.article_exact_bytes_verified,2);
  assert.equal(result.article_native_clock_verified,2);
  assert.equal(result.independent_original_organizations_readback,2);
  assert.equal(result.publisher_article_readback_verified,true);
  for(const k of ["event_semantics_independently_verified",
    "legal_commercial_use_verified","external_reviewer_attested",
    "machine_signed_gro_created","commercial_eligible","x402_payment_authorized"])
    assert.equal(result[k],false);
  assert.equal(result.raw_upstream_disclosed,false);
  assert.equal(result.payments,0);
  const output=JSON.stringify(result);
  for(const privateText of ["federalreserve.gov","ecb.europa.eu",
    "monetary20261010","us_rates","Monetary Policy Update"])
    assert.equal(output.includes(privateText),false);
});

test("source hash mismatch or changed original publication metadata fails closed",async()=>{
  const mismatch=await verifyMachineOriginalReadbacks({
    candidates:[fed,ecb],now,
    fetchImpl:(url)=>Promise.resolve(new Response(
      url===fed.original_article_url?fedHtml:"<h1>Changed publisher content</h1>",
      {status:200,headers:{"content-type":"text/html"}})),
  });
  assert.equal(mismatch.publisher_article_readback_verified,false);
  assert.equal(mismatch.independent_original_organizations_readback,0);
  const edited=ecbHtml.replace("10:10:00Z","10:15:00Z");
  const changedDate=await verifyMachineOriginalReadbacks({
    candidates:[fed,{...ecb,original_article_sha256:sha(edited)}],now,
    fetchImpl:(url)=>Promise.resolve(new Response(
      url===fed.original_article_url?fedHtml:edited,
      {status:200,headers:{"content-type":"text/html"}})),
  });
  assert.equal(changedDate.article_exact_bytes_verified,2);
  assert.equal(changedDate.article_native_clock_verified,1);
  assert.equal(changedDate.publisher_article_readback_verified,false);
});

test("single issuer, forged host, stale clock, and same-author copies cannot fetch",async()=>{
  let attempts=0;
  const forbidden=()=>{attempts++;throw Error("NETWORK_MUST_NOT_BE_TOUCHED");};
  const single=await verifyMachineOriginalReadbacks({candidates:[fed],now,fetchImpl:forbidden});
  assert.equal(single.article_checks_attempted,0);
  const spoof={...ecb,original_article_url:"https://ecb.europa.eu.attacker.invalid/press/pr/date/2026/html/a.html",
    publisher_host:"ecb.europa.eu.attacker.invalid"};
  assert.rejects(()=>verifyMachineOriginalReadbacks({
    candidates:[fed,spoof],now,fetchImpl:forbidden}));
  assert.equal(attempts,0);
  assert.rejects(()=>verifyMachineOriginalReadbacks({
    candidates:[fed,{...ecb,original_published_at:"2026-10-08T10:10:00Z"}],
    now,fetchImpl:forbidden}));
});

test("HTTP redirection, unsupported mime, or rate limiting cannot admit evidence",async()=>{
  for(const response of [
    new Response("",{status:302,headers:{location:"https://example.invalid/"}}),
    new Response("{}",{status:200,headers:{"content-type":"application/json"}}),
    new Response("blocked",{status:429,headers:{"content-type":"text/html"}}),
  ]){
    const r=await verifyMachineOriginalReadbacks({
      candidates:[fed,ecb],now,fetchImpl:async()=>response.clone()});
    assert.equal(r.publisher_article_readback_verified,false);
    assert.equal(r.x402_payment_authorized,false);
  }
});
