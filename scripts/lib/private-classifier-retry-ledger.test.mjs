import test from "node:test";
import assert from "node:assert/strict";
import {
 PRIVATE_SCORING_ATTEMPTS_SCHEMA,
 pickPrivateClassifierWork,claimPrivateClassifierWork,
 acknowledgePrivateClassifierWork,validateClaimForPrivateScorer,
} from "./private-classifier-retry-ledger.mjs";
const SHA="a".repeat(64),OTHER="b".repeat(64);
const origin="2026-10-14T10:00:00.000Z";
const at="2026-10-14T10:05:00.000Z",later="2026-10-14T10:36:00.000Z";
const candidate=(sha=SHA,clock=origin)=>({
 original_article_sha256:sha,native_published_at:clock,
});
const pulse=(domain="macro",checked=at,novel=[SHA],hash=SHA,clock=origin)=>({
 last_attempt_at:checked,
 payload:{
  schema:"geomacro.private-source-pulse-checkpoint.v1",domain,
  checked_at:checked,commercial_eligible:false,
  original_review_claims_verified:false,original_publisher_date_observed:true,
  new_private_article_fingerprint_count:novel.length,
  newly_seen_private_article_refs:novel,
  recent_private_article_fingerprints:[{domain,article_sha256:hash,native_published_at:clock}],
  private_original_review_refs:[{domain,article_sha256:hash,
   native_published_at:clock,review_status:"UNVERIFIED",payment_eligible:false}],
  private_classifier_work_refs:[hash],
 }
});
const ledger=(state)=>({payload:state});
const find=(source,old=null,now=at,candidates=[candidate()])=>
 pickPrivateClassifierWork({domain:"macro",source,ledger:old,now:Date.parse(now),
 currentCandidates:candidates});
test("new original fails before ack, next pulse can retry only once",()=>{
 const first=find(pulse());
 assert.equal(first.length,1);
 assert.equal(first[0].next_attempts,1);
 const claim1=claimPrivateClassifierWork({domain:"macro",work:first[0],now:at,runId:"100"});
 assert.equal(find(pulse("macro",at),ledger(claim1),at).length,0);
 const second=find(pulse("macro",later,[]),ledger(claim1),later);
 assert.equal(second.length,1);
 assert.equal(second[0].next_attempts,2);
 const claim2=claimPrivateClassifierWork({
  domain:"macro",ledger:ledger(claim1),work:second[0],now:later,runId:"101",
 });
 const terminal=acknowledgePrivateClassifierWork({
  domain:"macro",ledger:ledger(claim2),now:later,runId:"101",
  attempted:[],returned:[],
 });
 assert.equal(terminal.records[0].status,"EXHAUSTED");
 assert.deepEqual(find(pulse("macro",later,[]),ledger(terminal),later),[]);
});
test("successful classifier return is durably acked and prevents duplicate scoring",()=>{
 const p=pulse(),w=find(p);
 const first=claimPrivateClassifierWork({domain:"macro",work:w[0],now:at,runId:"100"});
 const stored={...p,payload:{...p.payload,private_classifier_work_refs:[SHA]}};
 assert.deepEqual([...validateClaimForPrivateScorer(stored,ledger(first),
   "macro","100",Date.parse(at))],[SHA]);
 const ack=acknowledgePrivateClassifierWork({
  domain:"macro",ledger:ledger(first),now:at,runId:"100",
  attempted:[SHA],returned:[SHA],
 });
 assert.equal(ack.records[0].status,"ACKED_CLASSIFIED");
 assert.equal(ack.records[0].acknowledged_at,at);
 assert.deepEqual(find(pulse("macro",later,[]),ledger(ack),later),[]);
 assert.throws(()=>acknowledgePrivateClassifierWork({
  domain:"macro",ledger:ledger(ack),now:later,runId:"100",
  attempted:[SHA],returned:[SHA],
 }),/PRIVATE_CLASSIFIER_ATTEMPT_LEDGER_INVALID/);
});
test("unprocessed old D1 original gets only one bounded recovery",()=>{
 const pending=pulse("macro",at,[]);
 const w=find(pending);
 assert.equal(w[0].next_attempts,2);
 assert.equal(w[0].retry,true);
 const claimed=claimPrivateClassifierWork({
  domain:"macro",work:w[0],now:at,runId:"50",
 });
 assert.deepEqual(find(pulse("macro",later,[]),ledger(claimed),later),[]);
});
test("original clock/SHA changes, expiration, source absence all refuse unsafe retry",()=>{
 const old=claimPrivateClassifierWork({
  domain:"macro",work:find(pulse())[0],now:at,runId:"100",
 });
 assert.throws(()=>find(pulse("macro",later,[],SHA,
   "2026-10-14T10:00:01.000Z"),ledger(old),later,
   [candidate(SHA,"2026-10-14T10:00:01.000Z")]),
 /PRIVATE_CLASSIFIER_ATTEMPT_LEDGER_INVALID/);
 assert.deepEqual(find(pulse("macro",later,[],OTHER),ledger(old),later,
    [candidate(OTHER)]),[]); // source itself no matching reviewed SHA
 assert.deepEqual(find(pulse("macro",later,[]),ledger(old),later,[]),[]);
 const expired="2026-10-12T08:00:00.000Z";
 assert.deepEqual(find(pulse("macro",later,[],SHA,expired),null,later,
   [candidate(SHA,expired)]),[]);
});
test("wrong domain, wrong run, missing D1 ack and forged returned hash fail closed",()=>{
 const p=pulse(),one=claimPrivateClassifierWork({
  domain:"macro",work:find(p)[0],now:at,runId:"100",
 });
 assert.throws(()=>validateClaimForPrivateScorer(p,null,"macro","100",Date.parse(at)));
 assert.throws(()=>validateClaimForPrivateScorer(p,ledger(one),"macro","101",Date.parse(at)));
 assert.throws(()=>validateClaimForPrivateScorer(p,ledger(one),"rare_earth","100",Date.parse(at)));
 assert.throws(()=>acknowledgePrivateClassifierWork({
  domain:"macro",ledger:ledger(one),now:at,runId:"100",
  attempted:[],returned:[SHA],
 }));
 assert.throws(()=>acknowledgePrivateClassifierWork({
  domain:"macro",ledger:ledger(one),now:at,runId:"100",
  attempted:[OTHER],returned:[],
 }));
 assert.throws(()=>pickPrivateClassifierWork({
  domain:"rare_earth",source:p,ledger:null,now:Date.parse(at),
  currentCandidates:[candidate()],
 }));
});
test("quiet pulse has zero model work; premature retry forbidden",()=>{
 const p=pulse(),first=claimPrivateClassifierWork({
  domain:"macro",work:find(p)[0],now:at,runId:"100",
 });
 assert.deepEqual(find(pulse("macro",at,[]),ledger(first),at),[]);
 assert.deepEqual(find(pulse("macro",later,[]),ledger(first),later,[]),[]);
});
