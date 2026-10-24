import {describe,it,expect,vi} from "vitest";
import {
 discoverDirectPublisherForPrivateQualification,
 verifyOnDemandOriginalArticlePages
} from "./on-demand-global-discovery.server";
import {verifyGeomacroUnclaimedOriginalPage} from "../../scripts/lib/geomacro-original-page-readback.mjs";
import {preparePrivateOriginalSigningReview} from "../../scripts/lib/private-original-signing-review-intake.mjs";
const now=new Date("2026-10-24T11:00:00Z");
const uri="https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=65001";
const title="RBI Monetary Policy Liquidity Review for India";
const rbiRss='<?xml version="1.0"?><rss version="2.0"><channel>'+
 '<item><title>'+title+'</title><link>'+uri+'</link></item>'+
 '</channel></rss>';
const nativeClock="2026-10-24T10:30:00Z";
const originalHtml="<html><head>"+
 '<meta property=\"article:published_time\" content=\"'+nativeClock+'\"></head>'+
 '<body><h1>'+title+'</h1><p>Published by the Reserve Bank of India</p></body></html>';
const mockDiscovery=(rss=rbiRss)=>{
 const calls:string[]=[];
 const fetchImpl=vi.fn(async(input:RequestInfo|URL)=>{
  const url=String(input);calls.push(url);
  if(url==="https://api.worldbank.org/v2/country/IND?format=json")
   return Response.json([{page:1},[{id:"IND",name:"India"}]]);
  if(url==="https://www.rbi.org.in/pressreleases_rss.xml")
   return new Response(rss,{headers:{"content-type":"text/xml"}});
  // No synthetic extra first-party originals from other institutions.
  return new Response("source unavailable",{status:503});
 }) as unknown as typeof fetch;
 return {fetchImpl,calls};
};
describe("India RBI official original bridge — private provenance, no rights",()=>{
 it("passes exact registered RBI press RSS into the canonical private country-Macro discovery within the 12 GET cap",async()=>{
  const {fetchImpl,calls}=mockDiscovery();
  const x=await discoverDirectPublisherForPrivateQualification({
   country_iso3:"IND",categories:["geopolitics","macro","rare_earth"],
   max_age_seconds:22*3600,
  },{now,fetchImpl});
  expect(x.discovery.network_attempts).toBeLessThanOrEqual(12);
  expect(calls.filter(u=>u==="https://www.rbi.org.in/pressreleases_rss.xml")).toHaveLength(1);
  const item=x.private_original_review_candidates.find(
   c=>c.publisher_family==="rbi_india_original_macro_publisher");
  expect(item).toMatchObject({domain:"macro",country_iso3:"IND",
   article_url:uri,article_title:title,
   source_native_feed_publication_date_verified:false,
   feed_item_published_at:null,index_original_page_pending:true,
   publisher_article_page_date_verified:false,
   derived_commercial_rights_verified:false,signed_gro_verified:false,
   paid_delivery_allowed:false});
  expect(JSON.stringify(x.discovery)).not.toContain(uri);
  expect(JSON.stringify(x.discovery)).not.toContain(title);
  expect(x.discovery.payable).toBe(false);
  expect(x.discovery.b2_requests).toBe(0);
 });
 it("checks RBI original HTML H1 + precise original metadata before private byte reread; never signs",async()=>{
  const {fetchImpl}=mockDiscovery();
  const x=await discoverDirectPublisherForPrivateQualification({
   country_iso3:"IND",categories:["macro"],max_age_seconds:22*3600,
  },{now,fetchImpl});
  const p=vi.fn(async(input:RequestInfo|URL)=>{
   expect(String(input)).toBe(uri);
   return new Response(originalHtml,{headers:{"content-type":"text/html"}});
  }) as unknown as typeof fetch;
  const pages=await verifyOnDemandOriginalArticlePages(
   x.private_original_review_candidates,{now,maxAgeSeconds:22*3600,
    maxProbes:3,fetchImpl:p});
  expect(pages.verified_candidates.some(x=>
   x.publisher_family==="rbi_india_original_macro_publisher")).toBe(true);
  const proof=await verifyGeomacroUnclaimedOriginalPage({now,fetchImpl:p,original:{
   category:"macro",originating_reporting_organization_id:"rbi",
   original_article_url:uri,original_published_at:"2026-10-24T10:30:00.000Z"
  }});
  expect(proof).toMatchObject({accepted:true,source_article_rights_verified:false,
   facts_signature_verified:false,rights_signature_verified:false,
   payment_authorized:false});
  expect(proof.original_article_sha256).toMatch(/^[0-9a-f]{64}$/);
  const intake=await preparePrivateOriginalSigningReview({
   country_iso3:"IND",discovery:x,pages,now,maxRereads:2,
   readback:async({original})=>verifyGeomacroUnclaimedOriginalPage({original,now,fetchImpl:p}),
  });
  expect(intake.receipt.distinct_source_verified_pre_review_leads).toBe(1);
  expect(intake.receipt.article_specific_commercial_rights_verified).toBe(false);
  expect(intake.receipt.signed_machine_input_created).toBe(false);
  expect(intake.receipt.x402_payment_authorized).toBe(false);
 });
 it("rejects headline-mismatched or missing-original-clock RBI HTML, even when feed identifier matches",async()=>{
  const {fetchImpl}=mockDiscovery();
  const x=await discoverDirectPublisherForPrivateQualification({
   country_iso3:"IND",categories:["macro"],max_age_seconds:22*3600,
  },{now,fetchImpl});
  for(const html of [
   originalHtml.replace(title,"RBI announces unrelated fiscal policy"),
   '<html><head><meta property="article:modified_time" content="'+nativeClock+'"></head><body><h1>'+title+'</h1></body></html>',
   originalHtml.replace(nativeClock,"2026-10-12T10:30:00Z"),
  ]){
   const pages=await verifyOnDemandOriginalArticlePages(
    x.private_original_review_candidates,{now,maxAgeSeconds:22*3600,
     fetchImpl:async()=>new Response(html,{headers:{"content-type":"text/html"}})});
   expect(pages.verified_candidates).toHaveLength(0);
  }
 });
 it("does not accept hostile RBI-lookalike query parameters and has no unverified third-party country fallback",async()=>{
  const rss='<?xml version="1.0"?><rss><channel>'+
   '<item><title>'+title+'</title><link>'+uri+'&amp;updated=1</link></item>'+
   '<item><title>'+title+'</title><link>https://rbi.example.com/Scripts/BS_PressReleaseDisplay.aspx?prid=65001</link></item>'+
   '</channel></rss>';
  const {fetchImpl}=mockDiscovery(rss);
  const x=await discoverDirectPublisherForPrivateQualification({
   country_iso3:"IND",categories:["macro"],
  },{now,fetchImpl});
  expect(x.private_original_review_candidates.find(x=>
   x.publisher_family==="rbi_india_original_macro_publisher")).toBeUndefined();
  expect(x.discovery.payable).toBe(false);
 });
});
