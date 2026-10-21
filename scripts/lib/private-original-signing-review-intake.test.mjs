import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {preparePrivateOriginalSigningReview}
 from "./private-original-signing-review-intake.mjs";
import {verifyGeomacroUnclaimedOriginalPage}
 from "./geomacro-original-page-readback.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex");
const NOW=new Date("2026-10-21T13:00:00Z");
const URL="https://www.federalreserve.gov/newsevents/pressreleases/monetary20261021a.htm";
const AT="2026-10-21T12:05:00.000Z";
const HTML='<html><head><meta property="article:published_time" content="'+AT+'"></head>'+
 '<body>TEST FIXTURE ONLY; no real event, licensing or signing authority</body></html>';
const item={
 country_iso3:"USA",domain:"macro",publisher_family:"us_federal_reserve_original_publisher",
 article_url:URL,article_title:"Synthetic monetary release for contract testing only",
 article_identity_sha256:sha("us_federal_reserve_original_publisher|"+URL),
 feed_item_published_at:AT,first_party_article_url_verified:true,
 source_native_feed_publication_date_verified:true,
 publisher_article_page_date_verified:false,
 derived_commercial_rights_verified:false,signed_gro_verified:false,
};
const verified={...item,publisher_article_page_date_verified:true,
 page_original_published_at:AT};
const discovery={discovery:{country_iso3:"USA",network_attempts:4},
 private_original_review_candidates:[item]};
const pages={attempted:1,verified_candidates:[verified]};
const genuine=async({original,now})=>verifyGeomacroUnclaimedOriginalPage({
 original,now,fetchImpl:async(url,opts)=>{
  assert.equal(url,URL);assert.equal(opts.redirect,"error");
  assert.equal(opts.method,"GET");
  return new Response(HTML,{status:200,headers:{"content-type":"text/html"}});
 },
});
test("actual exact issuer HTML byte hash and original native clock prepare a review lead ONLY",async()=>{
 const r=await preparePrivateOriginalSigningReview({
  country_iso3:"USA",discovery,pages,now:NOW,readback:genuine,
 });
 assert.equal(r.leads.length,1);
 assert.equal(r.leads[0].original_html_sha256,sha(HTML));
 assert.equal(r.leads[0].native_original_publication_at,AT);
 assert.equal(r.leads[0].original_article_url,URL);
 assert.equal(r.leads[0].semantic_event_claim_verified,false);
 assert.equal(r.leads[0].facts_signature,null);
 assert.equal(r.leads[0].rights_signature,null);
 assert.equal(r.receipt.distinct_source_verified_pre_review_leads,1);
 assert.equal(r.receipt.signed_machine_input_created,false);
 assert.equal(r.receipt.article_specific_commercial_rights_verified,false);
 assert.equal(r.receipt.x402_payment_authorized,false);
 const publicReceipt=JSON.stringify(r.receipt);
 for(const secret of [URL,"Synthetic monetary",sha(HTML),"federal_reserve"])
  assert.equal(publicReceipt.includes(secret),false);
});
test("the production exact HTML-byte verifier needs a pinned official original and native date",async()=>{
 const proof=await verifyGeomacroUnclaimedOriginalPage({original:{
  category:"macro",originating_reporting_organization_id:"federal_reserve",
  original_article_url:URL,original_published_at:AT,
 },now:NOW,fetchImpl:async()=>new Response(HTML,{status:200,
  headers:{"content-type":"text/html"}})});
 assert.equal(proof.accepted,true);
 assert.equal(proof.original_article_sha256,sha(HTML));
 assert.equal(proof.semantic_claim_reviewed,false);
 assert.equal(proof.source_article_rights_verified,false);
 assert.equal(proof.signed_gro_created,false);
});
test("no source rerun accepted when HTTP denied, no publisher clock or wrong identity",async()=>{
 for(const body of [
  {status:403,content:HTML},
  {status:200,content:"<html><body>No original page clock whatsoever, test only</body></html>"},
 ]){
  const r=await preparePrivateOriginalSigningReview({
   country_iso3:"USA",discovery,pages,now:NOW,
   readback:({original,now})=>verifyGeomacroUnclaimedOriginalPage({original,now,
    fetchImpl:async()=>new Response(body.content,{status:body.status,
     headers:{"content-type":"text/html"}})}),
  });
  assert.equal(r.leads.length,0);
  assert.equal(r.receipt.signed_machine_input_created,false);
 }
 const spoof={...verified,article_url:"https://www.federalreserve.gov.attacker.invalid/a"};
 const r=await preparePrivateOriginalSigningReview({
  country_iso3:"USA",discovery,pages:{...pages,verified_candidates:[spoof]},now:NOW,
  readback:async()=>{throw Error("UNREACHABLE");},
 });
 assert.equal(r.receipt.byte_exact_rereads_attempted,0);
});
test("wrong country, forged source, day-only and stale native article cannot qualify",async()=>{
 for(const candidate of [
  {...verified,country_iso3:"GBR"},
  {...verified,article_identity_sha256:sha("untrusted")},
  {...verified,source_native_feed_publication_date_verified:false,
   page_original_published_at:"2026-10-21"},
  {...verified,page_original_published_at:"2026-10-21T05:00:00.000Z"},
 ]){
  const r=await preparePrivateOriginalSigningReview({
   country_iso3:"USA",discovery,
   pages:{...pages,verified_candidates:[candidate]},now:NOW,
   readback:async()=>{throw Error("SHOULD_NOT_FETCH");},
  });
  assert.equal(r.leads.length,0);
 }
 await assert.rejects(preparePrivateOriginalSigningReview({
  country_iso3:"GBR",discovery,pages,now:NOW}),/INPUT_INVALID/);
});
test("bounded reread budget and same original cannot be duplicated",async()=>{
 const r=await preparePrivateOriginalSigningReview({
  country_iso3:"USA",discovery,
  pages:{...pages,verified_candidates:[verified,verified,verified,verified]},
  now:NOW,readback:genuine,
 });
 assert.equal(r.receipt.byte_exact_rereads_attempted,1);
 assert.equal(r.leads.length,1);
});
test("rejects spoofed publisher organization, old 6h clock and misdated HTML before commercial claims",async()=>{
 const original={category:"macro",originating_reporting_organization_id:"federal_reserve",
  original_article_url:URL,original_published_at:AT};
 for(const bad of [
  {...original,originating_reporting_organization_id:"ecb"},
  {...original,original_article_url:URL+"?redirect=1"},
  {...original,original_published_at:"2026-10-21T06:00:00Z"},
 ]){
  await assert.rejects(verifyGeomacroUnclaimedOriginalPage({
   original:bad,now:NOW,fetchImpl:async()=>{throw Error("SHOULD_NOT_FETCH")},
  }),/INPUT_INVALID/);
 }
 const mismatched=await verifyGeomacroUnclaimedOriginalPage({
  original,now:NOW,fetchImpl:async()=>new Response(
   HTML.replace(AT,"2026-10-21T10:00:00Z"),{
    status:200,headers:{"content-type":"text/html"},
   }),
 });
 assert.equal(mismatched.accepted,false);
 assert.equal(mismatched.status,"ORIGINAL_CLOCK_CONFLICT");
});
