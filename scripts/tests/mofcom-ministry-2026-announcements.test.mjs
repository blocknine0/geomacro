import test from "node:test";
import assert from "node:assert/strict";
import {
 MOFCOM_MINISTRY_ANNOUNCEMENTS_2026,
 parseMofcomMinistryMineralAnnouncementIndex
} from "../lib/mofcom-ministry-2026-announcements.mjs";
import {observeExistingPrivateP0Sources} from "../ops/observe-p0-private-source-runtime.mjs";

const original="https://www.mofcom.gov.cn/zcfb/blgg/gg/2026/art/2026/art_0bfdf4e0a0f843b8841f2053c3f0a60a.html";
const html=(links)=>'<html><body>2026年商务部公告 商务部公告列表： '+
 links+'</body></html>';
const good='<a href="'+original+'">商务部公告2026年第26号 关于战略矿产两用物项出口管制举报工作</a>';
const now=new Date("2026-10-24T11:30:00Z");

test("one Ministry official mineral export control link is ONLY a first-party index lead",()=>{
 assert.equal(MOFCOM_MINISTRY_ANNOUNCEMENTS_2026,
  "https://www.mofcom.gov.cn/zcfb/blgg/gg/2026/index.html");
 const a=parseMofcomMinistryMineralAnnouncementIndex(html(good+good+
  '<a href="'+original+'?tracking=1">战略矿产出口管制</a>'+
  '<a href="/zcfb/blgg/gg/2026/art/2026/art_92d6cb97a5de472d8ffeaf93be12a30f.html">双用途出口管制办理</a>'));
 assert.equal(a.mineral_export_control_original_article_lead_count,1);
 assert.equal(a.original_article_first_published_clock_verified,false);
 assert.equal(a.original_exportcontrol_homepage_restored,false);
 assert.equal(a.article_specific_commercial_rights_verified,false);
 assert.equal(a.facts_and_rights_signed,false);
 assert.equal(a.independent_gri_signed,false);
 assert.equal(a.x402_payable,false);
 assert.doesNotMatch(JSON.stringify(a),/0bfdf4e0|出口管制|mofcom\.gov\.cn/);
});
test("reject page without actual ministerial index shape, official link, or mineral-specific export control",()=>{
 for(const bad of [
  "<html>success</html>",
  html('<a href="https://evil.example/zcfb/blgg/gg/2026/art/2026/art_0bfdf4e0a0f843b8841f2053c3f0a60a.html">战略矿产出口管制</a>'),
  html('<a href="'+original+'">常规双用途出口管制</a>'),
  html('<a href="'+original+'">战略矿产政策综述</a>'),
  html('<a href="'+original+'#fragment">战略矿产出口管制</a>'),
  html('<a href="'+original+'?fake_date=2026">战略矿产出口管制</a>'),
  '<html><!DOCTYPE html [<!ENTITY bad SYSTEM "file:///etc/passwd">]>2026年商务部公告'+good+'</html>',
 ])assert.throws(()=>parseMofcomMinistryMineralAnnouncementIndex(bad),/MOFCOM_MINISTRY_INDEX_/);
});

test("one exact same-Ministry GET after primary timeout; keep exportcontrol.gov.cn failed separately",async()=>{
 const requested=[];
 const receipt=await observeExistingPrivateP0Sources({now,fetchImpl:async(url,options)=>{
  requested.push(String(url));
  assert.equal(options.redirect,"error");
  assert.equal(options.method,"GET");
  if(url==="https://exportcontrol.mofcom.gov.cn/")
   throw new DOMException("private-network-access","TimeoutError");
  if(url===MOFCOM_MINISTRY_ANNOUNCEMENTS_2026)
   return new Response(html(good),{headers:{"content-type":"text/html"}});
  return new Response("denied",{status:403});
 }});
 const row=receipt.results.find(x=>x.source_id==="china_mofcom_trade_controls");
 assert.equal(requested.length,11);
 assert.equal(receipt.http_requests,11);
 assert.equal(requested.filter(x=>x===MOFCOM_MINISTRY_ANNOUNCEMENTS_2026).length,1);
 assert.equal(row.status,"RELATED_MINISTRY_INDEX_REFERENCE_ONLY");
 assert.equal(row.primary_endpoint_still_unavailable,true);
 assert.equal(row.related_ministry_original_index_leads,1);
 assert.equal(row.current_original_publication_verified,false);
 assert.equal(row.commercial_eligible,false);
 assert.equal(receipt.related_index_reference_is_not_primary_source_restoration,true);
 assert.equal(receipt.signed_intelligence_published,false);
 assert.equal(receipt.payments,0);
 assert.doesNotMatch(JSON.stringify(receipt),/private-network-access|0bfdf4e0|战略矿产/);
});
test("never use other issuer host after explicit 401/403/429, malformed primary or expired transport shape",async()=>{
 for(const mode of [401,403,429,"malformed"]){
  let total=0,alternate=0;
  const receipt=await observeExistingPrivateP0Sources({now,fetchImpl:async url=>{
   total++;
   if(url===MOFCOM_MINISTRY_ANNOUNCEMENTS_2026)alternate++;
   if(url==="https://exportcontrol.mofcom.gov.cn/"){
    if(mode==="malformed")return new Response('<html>bad parser</html>',{headers:{"content-type":"text/html"}});
    return new Response("denied",{status:mode});
   }
   return new Response("denied",{status:403});
  }});
  assert.equal(total,10);assert.equal(alternate,0);assert.equal(receipt.http_requests,10);
  const r=receipt.results.find(x=>x.source_id==="china_mofcom_trade_controls");
  assert.equal(r.status,"UNAVAILABLE");
  assert.equal(r.reason,mode==="malformed"?"PARSER_NOT_VERIFIED":"HTTP_"+mode);
 }
});
test("fallback 200 login/bad HTML doesn't become a false source success",async()=>{
 const receipt=await observeExistingPrivateP0Sources({now,fetchImpl:async(url)=>{
  if(url==="https://exportcontrol.mofcom.gov.cn/")return new Response("bad",{status:503});
  if(url===MOFCOM_MINISTRY_ANNOUNCEMENTS_2026)
   return new Response("<html>Login to continue</html>",{headers:{"content-type":"text/html"}});
  return new Response("denied",{status:403});
 }});
 const row=receipt.results.find(x=>x.source_id==="china_mofcom_trade_controls");
 assert.equal(row.status,"UNAVAILABLE");
 assert.equal(row.reason,"HTTP_503");
 assert.equal(row.related_ministry_reference_unavailable,true);
 assert.equal(receipt.http_requests,11);
});