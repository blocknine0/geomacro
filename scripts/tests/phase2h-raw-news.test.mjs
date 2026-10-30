import test from "node:test";
import assert from "node:assert/strict";
import {buildPhase2hPrivateRawRecords,postPhase2hPrivateRawRecords}
 from "../lib/phase2h-raw-original-records.mjs";
import {validPrivateRawNews,phase2hPrivateRawPut,phase2hPrivateRawGet,
 phase2hQuestionMatchesArchived,phase2hQuestionDirectAnswer}
 from "../../workers/control-plane/src/phase2h-private-raw-news.mjs";
import {buildPhase2hRawB2Plan,verifyPhase2hRawB2Restore,
 runPhase2hGovernedRawB2}
 from "../ops/phase2h-archive-private-raw-news.mjs";
import {verifyPhase2hProductionQuestionChain} from "../ops/phase2h-verify-private-question-delivery.mjs";
import {runPhase2hPermanentAcceptance} from "../ops/phase2h-permanent-production-acceptance.mjs";
const now=new Date("2026-10-30T06:07:00.000Z");
const candidates=[
 {category:"geopolitics",sourceId:"un_press",title:"UN security council discusses ceasefire proposal",
  publishedAt:"2026-10-30T03:00:00.000Z",articleUrl:"https://news.un.org/en/story/2026/10/123456",
  credit:null},
 {category:"macro",sourceId:"fed_press",title:"Federal Reserve announces monetary policy statement",
  publishedAt:"2026-10-30T02:00:00.000Z",articleUrl:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261030a.htm",
  credit:null},
 {category:"rare_earth",sourceId:"govuk_global_minerals",title:"UK announces new critical minerals processing grant",
  publishedAt:"2026-10-30T01:00:00.000Z",
  articleUrl:"https://www.gov.uk/government/news/critical-minerals-processing-grant",
  description:"Public release announcing a minerals processing grant programme.",
  credit:"Contains public sector information licensed under the Open Government Licence v3.0."},
];
const derive=(items)=>items.map((x,i)=>({
 category:x.category,published_at:x.publishedAt,
 topic:x.category==="macro"?"monetary policy rates":
  x.category==="rare_earth"?"critical minerals supply":"trade and security",
 what_changed:"Publisher release reports a distinct "+x.category+" event: "+x.sourceId,
 why_it_matters:"The described "+x.category+" event concerns "+x.sourceId+
  "; market effects remain unverified.",
}));
const data=()=>buildPhase2hPrivateRawRecords([...candidates,candidates[0]],{now,derive});
test("three distinct collected original categories, exact native date, one ID per repeated story",async()=>{
 const x=data();
 assert.deepEqual(x.counts,{geopolitics:1,macro:1,rare_earth:1});
 assert.equal(x.records.length,3);
 assert.equal(new Set(x.records.map(r=>r.record_id)).size,3);
 for(const r of x.records){
  assert.equal(r.original.original_published_at,
   candidates.find(x=>x.category===r.category).publishedAt);
  assert.equal(r.original.full_article_html_collected,false);
  assert.equal(r.commercial_rights_verified,false);
  assert.equal(r.analysis.evidence_and_confidence.paid_eligible,false);
  assert.deepEqual(Object.keys(r.analysis).sort(),
   ["schema","what_happened","why_it_matters",
    "market_relevance","what_to_watch","evidence_and_confidence"].sort());
  assert.match(r.analysis.what_happened.text,new RegExp(r.original.original_source_id));
  assert.equal(await validPrivateRawNews(r,now.getTime()),JSON.stringify(r));
 }
 const mineral=x.records.find(r=>r.category==="rare_earth");
 assert.match(mineral.original.original_content,/processing grant/);
 assert.equal(x.records.find(r=>r.category==="macro").original.original_content,null);
 assert.equal(data().records[0].raw_sha256,x.records[0].raw_sha256);
});
test("a date-only publisher keeps its native calendar day, never a fabricated midnight",async()=>{
 const single={...candidates[2],datePrecision:"day",publishedAt:"2026-10-29T00:00:00.000Z"};
 const result=buildPhase2hPrivateRawRecords([single],{now,derive});
 const record=result.records[0];
 assert.equal(record.original.original_published_at,"2026-10-29");
 assert.equal(record.original.date_precision,"day");
 assert.equal(record.analysis.evidence_and_confidence.source_published_at,"2026-10-29");
 assert.equal(await validPrivateRawNews(record,now.getTime()),JSON.stringify(record));
});
test("date-only RSS without an explicit precision hint stays a calendar day",async()=>{
 const source={...candidates[0],publishedAt:"2026-10-29",datePrecision:undefined};
 const plan=buildPhase2hPrivateRawRecords([source],{now,derive});
 assert.equal(plan.records[0].original.original_published_at,"2026-10-29");
 assert.equal(plan.records[0].original.date_precision,"day");
 assert.equal(await validPrivateRawNews(plan.records[0],now.getTime()),
  JSON.stringify(plan.records[0]));
});
test("changed original bytes with same URL/date fails closed, not a phantom new story",()=>{
 assert.throws(()=>buildPhase2hPrivateRawRecords([
  candidates[0],{...candidates[0],title:"A changed headline for same original date"}
 ],{now,derive}),/PHASE2H_SAME_ORIGINAL_ID_CHANGED_CONTENT/u);
});
test("unavailable original page body stays null, raw publisher article is never invented",()=>{
 const x=buildPhase2hPrivateRawRecords([candidates[1]],{
  now,derive:()=>[],
 });
 assert.equal(x.records[0].analysis.what_happened.text,null);
 assert.equal(x.records[0].analysis.why_it_matters.text,null);
 assert.equal(x.records[0].analysis.evidence_and_confidence.original_article_page_verified,false);
});
test("immutable per-ID compressed B2 plan restores exact source-native and five part JSON",()=>{
 const plan=buildPhase2hRawB2Plan(data().records,now);
 assert.equal(plan.record_count,3);
 assert.deepEqual(plan.counts,{geopolitics:1,macro:1,rare_earth:1});
 assert.match(plan.key,/^geomacro-evidence\/v1\/private\/phase2h-raw-news\/2026\/10\/30\/[a-f0-9]{64}\.json\.gz$/u);
 assert.equal(verifyPhase2hRawB2Restore(plan.compressed,plan),true);
 assert.throws(()=>verifyPhase2hRawB2Restore(Buffer.from("tamper"),plan),
   /PHASE2H_RAW_B2_COMPRESSED_SHA_MISMATCH/u);
});
test("real-shaped governed PUT, two independent B2 GETs and post-archive D1 exact readback required",async()=>{
 const items=data().records;
 let put=0,first=0,second=0,postRead=0,marked=0;
 const r=await runPhase2hGovernedRawB2({
  now,env:{GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
   GITHUB_REF:"refs/heads/main",GITHUB_RUN_ID:"123",
   B2_ACCOUNT_QUOTA_REQUIRED:"1",B2_ACCOUNT_QUOTA_WORKFLOW_ID:"derived_news_backup",
   B2_REQUEST_BUDGET:"12",GEOMACRO_COMMERCE_LEDGER_TOKEN:"x".repeat(42),
   B2_KEY_ID:"fake",B2_APPLICATION_KEY:"fake"},
  governorFactory:()=>({status:async()=>({ok:true,
    used:{total:3,GET:2,PUT:1,NATIVE_AUTH:0},
    limits:{total:100,GET:100,PUT:100,NATIVE_AUTH:100}})}),
  d1Factory:()=>({
   async readPending(){postRead++;return items;},
   async markArchived(rows,objectSha){
    marked++;assert.equal(rows.length,3);
    assert.match(objectSha,/^[a-f0-9]{64}$/u);
    return {archived:3,independent_d1_archive_ack_verified:true};
   }
  }),
  b2Factory:()=>({
   async putWithMetadataVerification(key,bytes,{verifyRestored}){
    put++;first++;
    assert.equal(verifyRestored(bytes),true);
    return {full_body_readback_verified:true,
     sha256:buildPhase2hRawB2Plan(items,now).compressed_sha256,
     bytes:bytes.length};
   },
   async get(){second++;return buildPhase2hRawB2Plan(items,now).compressed;}
  }),
 });
 assert.equal(r.storage_confirmed,true);
 assert.equal(r.rows_archived,3);
 assert.equal(r.b2_first_get_verified,true);
 assert.equal(r.b2_second_independent_get_verified,true);
 assert.equal(r.post_archive_d1_verified,true);
 assert.equal(put,1);assert.equal(first,1);assert.equal(second,1);
 assert.equal(postRead,2);assert.equal(marked,1);
 assert.equal(r.payments,0);
});
test("maintenance archive does not start out of existing 00/06/12/18 slots",async()=>{
 const r=await runPhase2hGovernedRawB2({
  now:new Date("2026-10-30T07:07:00.000Z"),
  env:{GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
   GITHUB_REF:"refs/heads/main",GITHUB_RUN_ID:"123",
   B2_ACCOUNT_QUOTA_REQUIRED:"1",B2_ACCOUNT_QUOTA_WORKFLOW_ID:"derived_news_backup",
   B2_REQUEST_BUDGET:"12"},
  b2Factory:()=>{throw Error("B2_MUST_NOT_OPEN")},
  fetchImpl:()=>{throw Error("NETWORK_MUST_NOT_RUN")},
 });
 assert.equal(r.storage_confirmed,false);
 assert.equal(r.object_sha256,null);
});
test("governor headroom hold never calls B2 or protected D1",async()=>{
 const r=await runPhase2hGovernedRawB2({
  now,env:{GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
   GITHUB_REF:"refs/heads/main",GITHUB_RUN_ID:"123",
   B2_ACCOUNT_QUOTA_REQUIRED:"1",B2_ACCOUNT_QUOTA_WORKFLOW_ID:"derived_news_backup",
   B2_REQUEST_BUDGET:"12",GEOMACRO_COMMERCE_LEDGER_TOKEN:"x".repeat(42)},
  governorFactory:()=>({status:async()=>({ok:true,
   used:{total:99,GET:90,PUT:90,NATIVE_AUTH:90},
   limits:{total:100,GET:100,PUT:100,NATIVE_AUTH:100}})}),
  b2Factory:()=>{throw Error("B2_FORBIDDEN")},
  d1Factory:()=>{throw Error("D1_PRIVATE_FORBIDDEN")},
 });
 assert.equal(r.status,"B2_ACCOUNT_HEADROOM_HELD");
 assert.equal(r.object_sha256,null);
});
test("raw D1 intake HTTP readback cannot be faked with an empty payload",async()=>{
 await assert.rejects(postPhase2hPrivateRawRecords({
  records:data().records,
  controlPlaneRoot:"https://geomacro-control-plane.daspallab202391.workers.dev",
  token:"a".repeat(64),
  fetchImpl:async()=>Response.json({
    ok:true,accepted:0,unchanged:0,d1_exact_readback_verified:true}),
 }),/PHASE2H_PRIVATE_D1_READBACK_MISMATCH/u);
});

test("question matching is event-specific rather than one incidental word",()=>{
 const rows=data().records;
 const macro=rows.find(r=>r.category==="macro");
 const mineral=rows.find(r=>r.category==="rare_earth");
 assert.equal(phase2hQuestionMatchesArchived(macro,
  "Why does monetary policy rates matter?"),true);
 assert.equal(phase2hQuestionMatchesArchived(macro,
  "Why does lithium policy matter?"),false);
 assert.equal(phase2hQuestionMatchesArchived(mineral,
  "Why does lithium policy matter?"),false);
 assert.equal(phase2hQuestionMatchesArchived(macro,
  "what happened?"),false);
 const focused=phase2hQuestionDirectAnswer(
  "Why does monetary policy matter?",macro.analysis);
 assert.equal(focused.focus,"why_it_matters");
 assert.equal(focused.direct_answer,macro.analysis.why_it_matters.text);
});
test("only B2-acknowledged records enter the protected exact-question JSON",async()=>{
 const macro=data().records.find(r=>r.category==="macro");
 const statement=[];
 const db={prepare(sql){
  statement.push(sql);
  const rows=sql.includes("b2_object_sha256 IS NOT NULL")?
   [{record_id:macro.record_id,category:macro.category,
     raw_sha256:macro.raw_sha256,raw_json:JSON.stringify(macro),
     b2_object_sha256:"a".repeat(64)}]:[];
  return {
   all:async()=>({results:rows}),
   bind(){return {all:async()=>({results:rows})};},
  };
 }};
 const q=new URLSearchParams({record_id:macro.record_id,
  question:"Why does monetary policy matter?"});
 const r=await phase2hPrivateRawGet({DB:db},q,now.getTime());
 assert.equal(r.status,200);
 const body=await r.json();
 assert.equal(body.question_matches.length,1);
 assert.equal(body.question_matches[0].record_id,macro.record_id);
 assert.equal(body.question_matches[0].focus,"why_it_matters");
 assert.equal(body.question_matches[0].five_part.why_it_matters.text,
  macro.analysis.why_it_matters.text);
 assert.equal(body.question_matches[0].archive_d1_ack_present,true);
 assert.equal(body.chargeable,false);
 assert.equal(body.raw_original_not_delivered,true);
 assert.equal(JSON.stringify(body).includes(macro.original.original_url),false);
 assert.equal(statement.length,1);
 assert.match(statement[0],/b2_object_sha256 IS NOT NULL/u);
 const miss=await phase2hPrivateRawGet({DB:{prepare:()=>({
   bind:()=>({all:async()=>({results:[]})})
 })}},q,now.getTime());
 assert.equal((await miss.json()).question_matches.length,0);
});

test("production acceptance links verified B2 hash, canonical ID and HTTP five-part JSON",async()=>{
 const row=buildPhase2hPrivateRawRecords([candidates[1]],{now,
  derive:items=>items.map(item=>({
   category:item.category,published_at:item.publishedAt,
   topic:"monetary policy rates",
   what_changed:"A monetary policy statement was issued on the reported native publication date.",
   why_it_matters:"The monetary policy release is relevant to rate expectations; an actual market response remains unverified.",
  })),
 }).records[0];
 const digest="c".repeat(64);
 let providerReads=0,httpReads=0;
 const receipt={schema:"geomacro.phase2h.private-raw-b2-acceptance.v1",
  status:"B2_PUT_TWO_INDEPENDENT_GET_SHA_AND_D1_VERIFIED",
  storage_confirmed:true,rows_archived:1,category_counts:{geopolitics:0,macro:1,rare_earth:0},
  b2_first_get_verified:true,
  b2_second_independent_get_verified:true,post_archive_d1_verified:true,
  object_sha256:digest};
 const env={GITHUB_REPOSITORY:"blocknine0/geomacro",GITHUB_REF:"refs/heads/main",
  GITHUB_ACTIONS:"true",CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
  D1_DATABASE_ID:"d".repeat(36),CLOUDFLARE_API_TOKEN:"token".repeat(10),
  GEOMACRO_COMMERCE_LEDGER_TOKEN:"root".repeat(12)};
 const fetchImpl=async(url,init)=>{
  const parsedUrl=new URL(url);
  if(parsedUrl.origin==="https://api.cloudflare.com"){
   providerReads++;
   const sql=JSON.parse(init.body).sql;
   const results=sql.startsWith("SELECT record_id")?
    [{record_id:row.record_id,category:row.category,raw_sha256:row.raw_sha256,
     raw_json:JSON.stringify(row),b2_object_sha256:digest,
     b2_archived_at:now.toISOString()}]:[{has_pending:0}];
   return Response.json({success:true,result:[{success:true,results}]});
  }
  httpReads++;
  assert.match(String(url),/\/v1\/internal\/phase2h-raw-news\?/u);
  assert.ok(String(url).includes(row.record_id));
  assert.ok(init.headers.Authorization.startsWith("Bearer "));
  const question=parsedUrl.searchParams.get("question");
  const focus=question.startsWith("Why")?"why_it_matters":"what_happened";
  return Response.json({ok:true,schema:"geomacro.phase2h.private-question-fivepart.v1",
   source:"B2_ACKNOWLEDGED_PRIVATE_ORIGINAL_D1",
   chargeable:false,paid_eligible:false,raw_original_not_delivered:true,
   question_matches:[{record_id:row.record_id,category:row.category,
    original_published_at:row.original.original_published_at,
    archive_d1_ack_present:true,focus,
    direct_answer:row.analysis[focus].text,five_part:row.analysis}]});
 };
 const proof=await verifyPhase2hProductionQuestionChain({
  now:now.getTime(),env,receipt,fetchImpl});
 assert.equal(proof.entire_admitted_raw_backlog_verified,true);

 assert.equal(proof.per_record_five_part_exact,true);
 assert.equal(providerReads,2);assert.equal(httpReads,2);
 assert.equal(proof.question_variants_verified,2);
 assert.equal(proof.what_and_why_change_with_question,true);
 await assert.rejects(verifyPhase2hProductionQuestionChain({
  now:now.getTime(),env,receipt:{...receipt,b2_second_independent_get_verified:false},
  fetchImpl}),/PHASE2H_QUESTION_CHAIN_B2_POSITIVE_EXACT_READBACK_RECEIPT_REQUIRED/u);
});

test("bounded two-batch real-shaped archive drains and verifies exact production JSON",async()=>{
 const env={GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
  GITHUB_REF:"refs/heads/main",GITHUB_RUN_ID:"12345",
  B2_ACCOUNT_QUOTA_REQUIRED:"1",B2_ACCOUNT_QUOTA_WORKFLOW_ID:"derived_news_backup",
  B2_REQUEST_BUDGET:"12",CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
  D1_DATABASE_ID:"a".repeat(8)+"-"+"a".repeat(4)+"-"+"a".repeat(4)+
   "-"+"a".repeat(4)+"-"+"a".repeat(12),
  CLOUDFLARE_API_TOKEN:"a".repeat(40),GEOMACRO_COMMERCE_LEDGER_TOKEN:"b".repeat(40),
  GITHUB_SHA:"1".repeat(40)};
 let archived=0,checked=0;
 const proof=await runPhase2hPermanentAcceptance({env,now,
  archive:async()=>{archived++;return {
   schema:"geomacro.phase2h.private-raw-b2-acceptance.v1",
   status:"B2_PUT_TWO_INDEPENDENT_GET_SHA_AND_D1_VERIFIED",
   storage_confirmed:true,rows_archived:archived===1?300:15,
   category_counts:{geopolitics:1,macro:1,rare_earth:archived===1?298:13},
   object_sha256:(archived===1?"a":"b").repeat(64),
   b2_first_get_verified:true,b2_second_independent_get_verified:true,
   post_archive_d1_verified:true};},
  verify:async()=>{checked++;return {
   same_b2_object_and_d1_original:true,per_record_five_part_exact:true,
   deployed_authenticated_http_200:true,
   b2_two_get_verified_in_preceding_step:true,
   production_question_readback_categories:3,
   unarchived_backlog_present:checked===1,
   entire_admitted_raw_backlog_verified:checked===2};},
  readCensus:async()=>({staged_total:315,archived_total:315,pending_total:0,
   category_counts:{geopolitics:{staged:2,archived:2,pending:0},
    macro:{staged:2,archived:2,pending:0},
    rare_earth:{staged:311,archived:311,pending:0}}}),
  verifyExisting:()=>{throw Error("NO_FALLBACK_FOR_NEW_ARCHIVE")}})
 assert.equal(archived,2);assert.equal(checked,2);
 assert.equal(proof.status,"PASS_REAL_B2_TO_EXACT_QUESTION");
 assert.equal(proof.archived_records_this_run,315);
 assert.equal(proof.canonical_d1_staged_total,315);
 assert.equal(proof.canonical_d1_pending_total,0);
 assert.equal(proof.three_categories_have_archived_originals,true);
 assert.deepEqual(proof.verified_b2_object_sha256,["a".repeat(64),"b".repeat(64)]);
 assert.equal(proof.entire_admitted_raw_backlog_verified,true);
 assert.equal(proof.payments,0);
});
test("governor-held archive never receives a false full-chain PASS",async()=>{
 const env={GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
  GITHUB_REF:"refs/heads/main",GITHUB_RUN_ID:"12345",
  B2_ACCOUNT_QUOTA_REQUIRED:"1",B2_ACCOUNT_QUOTA_WORKFLOW_ID:"derived_news_backup",
  B2_REQUEST_BUDGET:"12",CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
  D1_DATABASE_ID:"a".repeat(8)+"-"+"a".repeat(4)+"-"+"a".repeat(4)+
   "-"+"a".repeat(4)+"-"+"a".repeat(12),
  CLOUDFLARE_API_TOKEN:"a".repeat(40),GEOMACRO_COMMERCE_LEDGER_TOKEN:"b".repeat(40)};
 await assert.rejects(runPhase2hPermanentAcceptance({env,now,
  archive:async()=>({storage_confirmed:false,status:"B2_ACCOUNT_HEADROOM_HELD"}),
  verify:()=>{throw Error("SHOULD_NOT_VERIFY")}}),
  /PHASE2H_PERMANENT_B2_ARCHIVE_HELD_OR_FAILED/u);
});
test("even trusted main-push B2 bootstrap cannot bypass six-hour maintenance slot",async()=>{
 const env={GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
  GITHUB_REF:"refs/heads/main",GITHUB_RUN_ID:"123",
  B2_ACCOUNT_QUOTA_REQUIRED:"1",B2_ACCOUNT_QUOTA_WORKFLOW_ID:"derived_news_backup",
  B2_REQUEST_BUDGET:"12",PHASE2H_BOOTSTRAP_ON_MAIN_PUSH:"1",
  GITHUB_EVENT_NAME:"push",
  GITHUB_WORKFLOW_REF:"blocknine0/geomacro/.github/workflows/phase2h-private-raw-archive.yml@refs/heads/main"};
 const r=await runPhase2hGovernedRawB2({env,now:new Date("2026-10-30T08:25:00Z"),
  b2Factory:()=>{throw Error("UNSAFE_B2")},
  governorFactory:()=>{throw Error("UNSAFE_GOVERNOR")}});
 assert.equal(r.storage_confirmed,false);
 assert.equal(r.status,"SKIPPED_OUTSIDE_EXISTING_ARCHIVE_SLOT");
});

test("earlier archived objects remain valid when no-new-data slot verifies latest object",async()=>{
 const env={GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
  GITHUB_REF:"refs/heads/main",GITHUB_RUN_ID:"12345",
  B2_ACCOUNT_QUOTA_REQUIRED:"1",B2_ACCOUNT_QUOTA_WORKFLOW_ID:"derived_news_backup",
  B2_REQUEST_BUDGET:"12",CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
  D1_DATABASE_ID:"a".repeat(8)+"-"+"a".repeat(4)+"-"+"a".repeat(4)+
   "-"+"a".repeat(4)+"-"+"a".repeat(12),
  CLOUDFLARE_API_TOKEN:"a".repeat(40),GEOMACRO_COMMERCE_LEDGER_TOKEN:"b".repeat(40)};
 const result=await runPhase2hPermanentAcceptance({env,now,
  archive:async()=>({storage_confirmed:true,rows_archived:0,
   status:"NO_PENDING_PRIVATE_RAW_ROWS"}),
  verifyExisting:async()=>({
   same_b2_object_and_d1_original:true,per_record_five_part_exact:true,
   deployed_authenticated_http_200:true,
   b2_two_get_verified_in_preceding_step:true,
   existing_archived_object_two_get_restored:true,
   existing_object_sha256:"d".repeat(64),
   verified_category_counts:{geopolitics:20,macro:70,rare_earth:210},
   verified_b2_batch_rows:300,
   production_question_readback_categories:3,
   unarchived_backlog_present:false,
   entire_admitted_raw_backlog_verified:true}),
  readCensus:async()=>({staged_total:315,archived_total:315,pending_total:0,
   category_counts:{geopolitics:{staged:20,archived:20,pending:0},
    macro:{staged:75,archived:75,pending:0},
    rare_earth:{staged:220,archived:220,pending:0}}})});
 assert.equal(result.status,"PASS_REAL_B2_TO_EXACT_QUESTION");
 assert.equal(result.all_current_staged_rows_have_b2_archive_ack,true);
 assert.equal(result.entire_staged_set_independently_verified,false);
 assert.equal(result.all_historical_b2_objects_independently_refetched_this_run,false);
 assert.equal(result.existing_archived_object_verified,true);
 assert.equal(result.archived_records_this_run,0);
});
