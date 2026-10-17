import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {auditFirstMineralsLeads,probeOneOfficialOriginal,
 firstEventOfficialLeads,assertNotSameIndependentEvent}
 from "./audit-first-real-minerals-evidence.mjs";
const sha=v=>createHash("sha256").update(v).digest("hex");
const now=new Date("2026-10-17T11:45:00.000Z");
const source="<html><head><meta property=\"article:published_time\" content=\"2026-10-17T09:00:00Z\"></head><body>"+
 "This is a purely synthetic official-source test article with adequate bytes, not a genuine published event.</body></html>";
const accepted=async()=>new Response(source,{status:200,headers:{"content-type":"text/html"}});
test("two actual leads belong to two distinct events, NEVER same-event qualifying",()=>{
 const rows=firstEventOfficialLeads();
 assert.equal(rows.length,2);
 assertNotSameIndependentEvent(rows);
 assert.notEqual(rows[0].claim,rows[1].claim);
 assert.notEqual(rows[0].issuer,rows[1].issuer);
 assert.throws(()=>assertNotSameIndependentEvent([rows[0],rows[0]]),
   /FIRST_EVENT_PROBE_INPUT_INVALID/);
});
test("original HTML byte SHA and source-native clock recorded, commercial always blocked",async()=>{
 const a=await probeOneOfficialOriginal(firstEventOfficialLeads()[0],{fetchImpl:accepted,now});
 assert.equal(a.exact_html_sha256,sha(source));
 assert.equal(a.source_native_publication_at,"2026-10-17T09:00:00.000Z");
 assert.equal(a.status,"ORIGINAL_HTML_AND_NATIVE_CLOCK_OBSERVED_REVIEW_REQUIRED");
 assert.equal(a.no_attribution_commercial_permission_verified,false);
 assert.equal(a.signed_gro_verified,false);
 assert.equal(a.payments,0);
 assert.equal(a.public_hot_published,false);
 assert.equal(JSON.stringify(a).includes(source),false);
});
test("HTML hash without issuer-native clock is NOT a certified original",async()=>{
 const html="<html><head><title>Unknown native date</title></head><body>"+
 "Any article text cannot establish an original release time even if it was retrieved today.</body></html>";
 const r=await probeOneOfficialOriginal(firstEventOfficialLeads()[1],{
   fetchImpl:async()=>new Response(html,{status:200,headers:{"content-type":"text/html"}}),now,
 });
 assert.equal(r.exact_html_sha256,sha(html));
 assert.equal(r.source_native_publication_at,null);
 assert.equal(r.status,"ORIGINAL_HTML_HASHED_NATIVE_CLOCK_UNVERIFIED");
});
test("redirect, foreign URL, wrong MIME, oversized body and HTTP errors deny",async()=>{
 const row=firstEventOfficialLeads()[1];
 const variants=[
  new Response("Redirected",{status:302,headers:{location:"https://invalid.example/evil"}}),
  new Response("not html",{status:200,headers:{"content-type":"application/json"}}),
  new Response("Denied",{status:403,headers:{"content-type":"text/html"}}),
  new Response("Too big",{status:200,headers:{"content-type":"text/html","content-length":"350000"}}),
 ];
 for(const value of variants){
  const got=await probeOneOfficialOriginal(row,{fetchImpl:async(_url,opts)=>{
   assert.equal(opts.redirect,"manual");
   assert.equal(opts.method,"GET");
   return value;
  },now});
  assert.equal(got.exact_html_sha256,null);
  assert.equal(got.b2_writes,0);
 }
});
test("unsupported arbitrary remote URLs and forged sources denied before network",async()=>{
 const source=firstEventOfficialLeads()[0];
 let fetches=0;
 await assert.rejects(probeOneOfficialOriginal({...source,url:"https://evil.test/news"},{
   fetchImpl:async()=>{fetches++;return accepted()},now,
 }),/FIRST_EVENT_PROBE_INPUT_INVALID/);
 assert.equal(fetches,0);
});
test("audit receipt NEVER falsely says eligible when both bytes verify",async()=>{
 let calls=0;
 const receipt=await auditFirstMineralsLeads({now,fetchImpl:async()=>{
   calls++;return accepted();
 }});
 assert.equal(calls,2);
 assert.equal(receipt.original_html_exact_sha_observed_count,2);
 assert.equal(receipt.same_event_independent_original_count,0);
 assert.equal(receipt.article_specific_commercial_rights_approved,0);
 assert.equal(receipt.licensed_signed_commercial_gro,false);
 assert.equal(receipt.b2_publication_verified,false);
 assert.equal(receipt.d1_current_hot_verified,false);
 assert.equal(receipt.payments,0);
 assert.equal(receipt.supabase_writes,0);
 const encoded=JSON.stringify(receipt);
 assert.equal(encoded.includes(source),false);
});
