import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {auditEveryDerivedNewsOriginal} from "./all-news-original-evidence-audit.mjs";
import {verifyGeomacroUnclaimedOriginalPage} from "./geomacro-original-page-readback.mjs";

const now=new Date("2026-10-21T13:00:00Z");
const at="2026-10-21T12:05:00.000Z";
const url="https://www.federalreserve.gov/newsevents/pressreleases/monetary20261021a.htm";
const html='<html><head><meta property="article:published_time" content="'+at+'"></head><body>SIMULATED HTML FIXTURE ONLY, NOT GENUINE NEWS.</body></html>';
const digest=s=>createHash("sha256").update(s).digest("hex");
const signal=(id,category="macro",published_at=at,date_precision="exact")=>({
 id:category+"-"+id,category,published_at,date_precision,
 status:"official_release_observed_unscored",
});
const ref=(publishedAt=at,sourceId="fed_press",articleUrl=url)=>({
 category:"macro",sourceId,publishedAt,articleUrl,
 title:"TEST ONLY: no real source released for this fixture",
});
const actualPage=({original,now})=>verifyGeomacroUnclaimedOriginalPage({
 original,now,fetchImpl:async(actual,init)=>{
  assert.equal(actual,url);
  assert.equal(init.redirect,"error");
  return new Response(html,{status:200,headers:{"content-type":"text/html"}});
 },
});
test("real first-party HTTP HTML exact bytes/native time prove only original-page provenance",async()=>{
 const row=signal("aabbddee");
 const result=await auditEveryDerivedNewsOriginal({
  signals:[row],originalRefs:new Map([[row.id,ref()]]),now,verify:actualPage,
 });
 assert.equal(result.ingested_news_examined,1);
 assert.equal(result.verified_original_page_bytes_and_native_time,1);
 assert.equal(result.exact_page_byte_rereads_attempted,1);
 assert.equal(result.rows[0].original_page_evidence_status,
  "ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME_VERIFIED");
 assert.equal(result.rows[0].exact_original_page_html_readback,true);
 assert.equal(result.rows[0].source_rights_verified,false);
 assert.equal(result.rows[0].source_rights_next_action,
  "SOURCE_CONTRACT_UNREGISTERED_OR_OUT_OF_SCOPE");
 assert.equal(result.rights_remediation_actions.SOURCE_CONTRACT_UNREGISTERED_OR_OUT_OF_SCOPE,1);
 assert.equal(result.rows[0].signed_commercial_input,false);
 const out=JSON.stringify(result);
 for(const secret of [url,html,digest(html),"TEST ONLY","federal_reserve"]){
  assert.equal(out.includes(secret),false);
 }
});
test("ALL incoming news receive explicit status, even when per-category source proof unsupported",async()=>{
 const input=[signal("aaaaaaaa"),signal("bbbbbbbb","geopolitics"),
  signal("cccccccc","rare_earth")];
 const result=await auditEveryDerivedNewsOriginal({
  signals:input,originalRefs:new Map([[input[0].id,ref()]]),now,
  verify:actualPage,
 });
 assert.equal(result.ingested_news_examined,3);
 assert.equal(result.rows.length,3);
 assert.equal(result.categories.macro.original_bytes_verified,1);
 assert.equal(result.categories.geopolitics.pending_or_unverified,1);
 assert.equal(result.categories.rare_earth.pending_or_unverified,1);
 assert.equal(result.pending_or_unverified_news_count,2);
 assert.equal(result.full_195_country_news_coverage_claimed,false);
});
test("feed-only news, day-precision dates and old originals are NOT falsely byte-verified",async()=>{
 const dateOnly=signal("10101010","macro","2026-10-21","day");
 const stale=signal("20202020","macro","2026-10-20T14:59:00.000Z");
 const noOriginal=signal("30303030","macro");
 let calls=0;
 const refs=new Map([[dateOnly.id,ref("2026-10-21")],
  [stale.id,ref("2026-10-20T14:59:00.000Z")]]);
 const report=await auditEveryDerivedNewsOriginal({
  signals:[dateOnly,stale,noOriginal],originalRefs:refs,now,
  verify:async()=>{calls++;throw Error("UNEXPECTED_FETCH")},
 });
 assert.equal(calls,0);
 assert.equal(report.exact_page_byte_rereads_attempted,0);
 assert.equal(report.verified_original_page_bytes_and_native_time,0);
 assert.equal(report.rows.find(x=>x.id===dateOnly.id).original_page_evidence_status,
  "ORIGINAL_DAY_PRECISION_ONLY");
 assert.equal(report.rows.find(x=>x.id===stale.id).original_page_evidence_status,
  "OUTSIDE_TWENTY_TWO_HOUR_ORIGINAL_VERIFICATION_WINDOW");
 assert.equal(report.rows.find(x=>x.id===noOriginal.id).original_page_evidence_status,
  "PRIVATE_ORIGINAL_REFERENCE_NOT_AVAILABLE");
});
test("wrong official issuing organization, off-publisher host and other GOV departments never impersonate FCDO",async()=>{
 const a=signal("11111111"),b=signal("22222222");
 let calls=0;
 const result=await auditEveryDerivedNewsOriginal({
  signals:[a,b],
  originalRefs:new Map([
   [a.id,ref(at,"fed_press","https://www.federalreserve.gov.invalid/evil")],
   [b.id,ref(at,"uk_dbt","https://www.gov.uk/government/news/example-release")],
  ]),now,verify:async()=>{calls++;throw Error("NO_FETCH")},
 });
 assert.equal(calls,0);
 assert.equal(result.rows.every(r=>r.original_page_evidence_status===
  "ORIGINAL_ISSUER_NOT_REGISTERED_FOR_BYTE_RECHECK"),true);
});
test("identical official original is read once and reused for identical publication proof",async()=>{
 const rows=["11111111","22222222","33333333","44444444"].map(x=>signal(x));
 let physical=0;
 const report=await auditEveryDerivedNewsOriginal({
  signals:rows,originalRefs:new Map(rows.map(r=>[r.id,ref()])),
  now,maxReadbacks:2,maxPerCategory:2,
  verify:async(args)=>{physical++;return actualPage(args);},
 });
 assert.equal(physical,1);
 assert.equal(report.exact_page_byte_rereads_attempted,1);
 assert.equal(report.verified_original_page_bytes_and_native_time,4);
 assert.equal(report.rows.every(x=>x.exact_original_page_html_readback),true);
 assert.equal(report.x402_charges,0);
 assert.equal(report.d1_writes,0);
 assert.equal(report.signed_commercial_intelligence_created,false);
});
test("different articles from one publisher share a hard per-run host cap",async()=>{
 const rows=["11111111","22222222","33333333"].map(x=>signal(x));
 const refs=new Map(rows.map((r,i)=>[r.id,
  ref(at,"fed_press","https://www.federalreserve.gov/newsevents/pressreleases/monetary20261021"+
    String.fromCharCode(97+i)+".htm")]));
 let physical=0;
 const proof={schema:"geomacro.private-unclaimed-original-pre-review.v1",
   accepted:true,status:"ORIGINAL_BYTES_AND_CLOCK_VERIFIED_REVIEW_PENDING",
   original_article_sha256:digest(html),original_native_published_at:at,
   source_article_rights_verified:false,facts_signature_verified:false,
   rights_signature_verified:false,signed_gro_created:false,payment_authorized:false};
 const report=await auditEveryDerivedNewsOriginal({
  signals:rows,originalRefs:refs,now,maxReadbacks:6,maxPerCategory:4,
  verify:async()=>{physical++;return proof;},
 });
 assert.equal(physical,1);
 assert.equal(report.verified_original_page_bytes_and_native_time,1);
 assert.equal(report.rows.filter(x=>x.original_page_evidence_status===
  "ORIGINAL_PAGE_READBACK_DEFERRED_QUOTA").length,2);
 assert.equal(report.bundled_source_quota.hard_ceiling,6);
 assert.equal(report.bundled_source_quota.protected_unused_reserve,2);
 assert.equal(report.bundled_source_quota.normal_allowance,4);
 assert.equal(report.bundled_source_quota.reserve_touched,false);
});
test("a forged readback proof that claims rights or payment is rejected",async()=>{
 const row=signal("abcdefab");
 const result=await auditEveryDerivedNewsOriginal({
  signals:[row],originalRefs:new Map([[row.id,ref()]]),now,
  verify:async()=>({
   schema:"geomacro.private-unclaimed-original-pre-review.v1",
   status:"ORIGINAL_BYTES_AND_CLOCK_VERIFIED_REVIEW_PENDING",accepted:true,
   original_article_sha256:digest(html),
   original_native_published_at:at,
   source_article_rights_verified:true,
   facts_signature_verified:false,rights_signature_verified:false,
   signed_gro_created:false,payment_authorized:false,
  }),
 });
 assert.equal(result.verified_original_page_bytes_and_native_time,0);
 assert.equal(result.rows[0].original_page_evidence_status,
  "ORIGINAL_BYTES_OR_NATIVE_CLOCK_UNVERIFIED");
});
test("duplicate IDs and invalid category cannot silently mask a news record",async()=>{
 const row=signal("aabbccdd");
 await assert.rejects(auditEveryDerivedNewsOriginal({
  signals:[row,row],originalRefs:new Map(),now,
 }),/ALL_NEWS_EVIDENCE_INPUT_INVALID/);
 await assert.rejects(auditEveryDerivedNewsOriginal({
  signals:[{...row,category:"rare_earth"}],originalRefs:new Map(),now,
 }),/ALL_NEWS_EVIDENCE_INPUT_INVALID/);
});


test("native clock failure is quarantined with a redacted remediation class",async()=>{
 const row=signal("ddeeaaaa");
 const report=await auditEveryDerivedNewsOriginal({
  signals:[row],originalRefs:new Map([[row.id,ref()]]),now,
  verify:async()=>({schema:"geomacro.private-unclaimed-original-pre-review.v1",
   accepted:false,status:"ORIGINAL_NATIVE_CLOCK_NOT_PROVEN"}),
 });
 assert.equal(report.verified_original_page_bytes_and_native_time,0);
 assert.equal(report.rows[0].original_page_evidence_status,
  "ORIGINAL_BYTES_OR_NATIVE_CLOCK_UNVERIFIED");
 assert.equal(report.rows[0].original_readback_failure_class,"NATIVE_CLOCK");
 assert.equal(report.signed_commercial_intelligence_created,false);
 assert.equal(JSON.stringify(report).includes(url),false);
});
test("untrusted readback exceptions never escape into reviewer output",async()=>{
 const row=signal("eeeedddd");
 const report=await auditEveryDerivedNewsOriginal({
  signals:[row],originalRefs:new Map([[row.id,ref()]]),now,
  verify:async()=>{throw Error("PRIVATE_UPSTREAM_URL_OR_KEY_DO_NOT_LOG");},
 });
 assert.equal(report.rows[0].original_readback_failure_class,"UNKNOWN_OR_UNTRUSTED_PROOF");
 assert.equal(JSON.stringify(report).includes("PRIVATE_UPSTREAM_URL_OR_KEY"),false);
});
