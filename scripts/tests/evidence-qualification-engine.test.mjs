import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign as nodeSign} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {canonicalJcs,sha256,simhash,simhashDistance,normalizeUnqualifiedEvidence,
 analyzeDeficits,signEvidence,verifyEvidence,DEFICITS}
 from '../../workers/control-plane/src/evidence-qualification-core.mjs';
import {ingestEvidence,recoverDueEvidence,qualifyAndPublishEvidence,deliverVerifiedEvidence}
 from '../../workers/control-plane/src/evidence-qualification-runtime.mjs';
import {mintCanonicalCustomerPaidKey}
 from '../../workers/control-plane/src/customer-paid-ledger.mjs';
const hex=x=>createHash('sha256').update(x).digest('hex');
function pair(){
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 return {privateKey,privatePkcs8B64:privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),
  publicSpkiB64:publicKey.export({format:'der',type:'spki'}).toString('base64')};
}
const signer=pair(),reviewer=pair(),now=()=>Date.now();
const clock=n=>new Date(n).toISOString();
const approvals={'news.un.org':{organization_id:'un_news'},'www.federalreserve.gov':{organization_id:'fed'}};
async function fixtureItem(){
 const at=now();
 const raw={channel:'rss',category:'geopolitics',country_iso3:'USA',
  article_url:'https://news.un.org/en/story/2026/11/test',
  canonical_url:'https://news.un.org/en/story/2026/11/test',
  title:'Illustrative verified official event',
  body:'Independent report regarding a test international trade policy event with verified original.',
  observed_at:clock(at),claimed_published_at:clock(at-120000)};
 const item=await normalizeUnqualifiedEvidence(raw);
 const claim=hex('same-event-20261108-1');
 const proof={item_id:item.id,original_url:item.article_url,originating_org:'un_news',
  original_publisher_verified:true,original_published_at:raw.claimed_published_at,
  native_publication_metadata_verified:true,original_content_sha256:item.content_sha256,
  original_content_verified:true,same_event_claim_sha256:claim,
  reviewed_at:clock(at),proof_expires_at:clock(at+2*3600000),
  commercial_derived_use_rights_verified:true,rights_receipt_sha256:hex('legal-grant-receipt'),
  customer_full_text_distribution_rights_verified:true,
  customer_distribution_rights_receipt_sha256:hex('test-customer-content-redistribution-rights'),
  rights_license_id:'test-rights-receipt-only',
  confirmations:[
   {url:item.article_url,originating_org:'un_news',
    original_content_sha256:hex('source-A-content'),same_event_claim_sha256:claim,
    independently_authored:true,syndicated_from:null,published_at:clock(at-120000)},
   {url:'https://www.federalreserve.gov/newsevents/pressreleases/test.htm',
    originating_org:'fed',original_content_sha256:hex('source-B-content'),
    same_event_claim_sha256:claim,independently_authored:true,syndicated_from:null,
    published_at:clock(at-90000)}]};
 return {raw,item,proof};
}
function attest(proof,privateKey=reviewer.privateKey){
 return {proof,signature_base64:nodeSign(null,Buffer.from(canonicalJcs(proof)),privateKey).toString('base64')};
}
const evalGate=(item,a,options={})=>analyzeDeficits(item,a,{
 reviewerPublicSpkiB64:reviewer.publicSpkiB64,approvedOrigins:approvals,...options});
test('JCS canonical bytes stable, unicode and RFC 8785 numeric normalization',async()=>{
 assert.equal(canonicalJcs({z:1,a:{b:2,a:-0}}),'{"a":{"a":0,"b":2},"z":1}');
 assert.equal(canonicalJcs({a:1,b:2}),canonicalJcs({b:2,a:1}));
 assert.equal(await sha256(canonicalJcs({b:2,a:1})),hex('{"a":1,"b":2}'));
 assert.throws(()=>canonicalJcs({a:Number.NaN}),/EQE_JCS_NUMBER/);
 assert.throws(()=>canonicalJcs({a:'\uD800'}),/EQE_JCS_INVALID_UNICODE/);
 assert.ok(simhashDistance(simhash('economic trade update'),simhash('economic trade update'))===0);
});
test('all mandatory checks pass ONLY for detached trusted review and distinct originals',async()=>{
 const {item,proof}=await fixtureItem();
 assert.equal((await evalGate(item,attest(proof))).qualified,true);
 const noReview=await evalGate(item,{proof,signature_base64:'invalid'});
 assert.deepEqual(noReview.deficits,[DEFICITS.REVIEW]);
 const uncorroborated=await evalGate(item,attest({...proof,confirmations:[proof.confirmations[0]]}));
 assert.ok(uncorroborated.deficits.includes(DEFICITS.QUORUM));
 const syndicated=await evalGate(item,attest({...proof,confirmations:proof.confirmations.map(c=>({
   ...c,originating_org:'un_news',independently_authored:false
 }))}));
 assert.ok(syndicated.deficits.includes(DEFICITS.QUORUM));
 const rights=await evalGate(item,attest({...proof,commercial_derived_use_rights_verified:false}));
 assert.ok(rights.deficits.includes(DEFICITS.RIGHTS));
 const notRedistributable=await evalGate(item,attest({...proof,customer_full_text_distribution_rights_verified:false}));
 assert.ok(notRedistributable.deficits.includes(DEFICITS.RIGHTS));
 const time=await evalGate(item,attest({...proof,original_published_at:clock(now()-3600000)}));
 assert.ok(time.deficits.includes(DEFICITS.TIME));
 const corrupt=structuredClone(item);corrupt.body+='tampered';
 await assert.rejects(()=>evalGate(corrupt,attest(proof)),/EQE_ITEM_INTEGRITY_INVALID/);
});
test('Ed25519 JCS envelope is independently verifiable; signature, hash and payload tampering fail',async()=>{
 const {item,proof}=await fixtureItem(),review=attest(proof);
 const envelope=await signEvidence(item,review,{privatePkcs8B64:signer.privatePkcs8B64,
  publicSpkiB64:signer.publicSpkiB64,keyId:'test-evidence-1',
  reviewerPublicSpkiB64:reviewer.publicSpkiB64,approvedOrigins:approvals});
 const keys={'test-evidence-1':signer.publicSpkiB64};
 assert.equal(await verifyEvidence(envelope,keys),true);
 const bad=structuredClone(envelope);bad.payload.item.title+=' changed';
 assert.equal(await verifyEvidence(bad,keys),false);
 const s=structuredClone(envelope);s.integrity.signature_base64=
  (s.integrity.signature_base64.startsWith('A')?'B':'A')+s.integrity.signature_base64.slice(1);
 assert.equal(await verifyEvidence(s,keys),false);
 const h=structuredClone(envelope);h.integrity.sha256_checksum='a'.repeat(64);
 assert.equal(await verifyEvidence(h,keys),false);
 assert.equal(await verifyEvidence(envelope,{'test-evidence-1':reviewer.publicSpkiB64}),false);
});
const migrationNames=['0090_customer_canonical_d1.sql','0091_customer_canonical_integrity_triggers.sql',
 '0092_customer_resend_otp_sessions.sql','0093_customer_email_provider_quota.sql',
 '0094_customer_login_runtime.sql','0095_customer_grant_scoped_usage.sql',
 '0096_customer_prepaid_pack_spend.sql','0097_customer_paypal_checkout_intents.sql',
 '0212_evidence_qualification_hot_pointers.sql'];
function inMemorySql(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const name of migrationNames)sql.exec(readFileSync('workers/control-plane/migrations/'+name,'utf8'));
 const db={prepare:q=>({bind(...args){const stmt=sql.prepare(q);
  return {first:async()=>stmt.get(...args)??null,
   all:async()=>({results:stmt.all(...args)}),
   run:async()=>{try{return {meta:{changes:Number(stmt.run(...args).changes)}};}catch(e){if(q.includes('eqe_delivery_receipts'))console.error('EQE_SQL_TEST_ONLY',e.message);throw e;}}};}})};
 return {sql,db};
}
function r2(){
 const objects=new Map();
 return {objects,async put(k,bytes){objects.set(k,Buffer.from(bytes));},
  async get(k){const b=objects.get(k);return b?{arrayBuffer:async()=>Uint8Array.from(b).buffer}:null;}};
}
function envWith(db,store){
 return {DB:db,EVIDENCE_PRIVATE_R2:store,
  GEOMACRO_EVIDENCE_ORIGINS_JSON:JSON.stringify(approvals),
  GEOMACRO_EVIDENCE_REVIEW_PUBLIC_SPKI_B64:reviewer.publicSpkiB64,
  GEOMACRO_EVIDENCE_ED25519_PUBLIC_SPKI_B64:signer.publicSpkiB64,
  GEOMACRO_EVIDENCE_ED25519_PRIVATE_PKCS8_B64:signer.privatePkcs8B64,
  GEOMACRO_EVIDENCE_ED25519_KEY_ID:'test-evidence-1',
  GEOMACRO_CUSTOMER_PAID_RUNTIME_ACCEPTANCE:'ACCEPTED_CANONICAL_D1_PAID_RUNTIME',
  GEOMACRO_EVIDENCE_PAID_DELIVERY_ACCEPTANCE:'ACCEPTED_VERIFIED_EQE_DELIVERY',
  GEOMACRO_EVIDENCE_DELIVERY_CAPABILITY:'intelligence_query',
  GEOMACRO_EVIDENCE_DELIVERY_WINDOW_SECONDS:'10800',
  GEOMACRO_API_CREDENTIAL_PEPPER:'evidence-unit-test-private-key-pepper-isolated',
 };
}
function fundedUser(sql){
 const at=clock(now()),start=clock(now()-60000),end=clock(now()+86400000);
 const id='eqe-customer-test-user-00000001',receipt='eqe-test-receipt-0001';
 sql.prepare('INSERT INTO users(id,email,email_verified_at) VALUES(?,?,?)')
  .run(id,'eqe-test@example.org',at);
 sql.prepare("INSERT INTO customer_payment_receipts(receipt_id,user_id,provider,environment,provider_event_id,sku,amount_minor_units,currency,settled_at,verified_at,verification_sha256) VALUES(?,?,'paypal','live',?,'starter_dev',900,'USD',?,?,?)")
  .run(receipt,id,'eqe-test-provider-event-1',at,at,'a'.repeat(64));
 sql.prepare("INSERT INTO customer_entitlement_grants(grant_id,user_id,receipt_id,tier,contract_version,starts_at,expires_at,status) VALUES(?,?,?,'starter_dev','credits-v1.1.0',?,?,'active')")
  .run('eqe-test-grant-01',id,receipt,start,end);
 sql.prepare("INSERT INTO credit_ledger(event_id,user_id,event_type,delta_credits,receipt_id) VALUES(?,?,'funding',3,?)")
  .run('eqe-test-funding-01',id,receipt);
 return id;
}
test('RSS unqualified -> bounded recovery -> signed review -> R2 byte readback -> D1 hot -> exactly-once debit',async()=>{
 const {sql,db}=inMemorySql(),store=r2(),env=envWith(db,store),{raw,item,proof}=await fixtureItem();
 const ingested=await ingestEvidence(env,raw);
 assert.equal(ingested.state,'QUARANTINED');
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM eqe_qualified').get().n,0);
 const recovered=await recoverDueEvidence(env,{fetchImpl:async()=>new Response(
  '<meta property="article:published_time" content="'+raw.claimed_published_at+'">',
  {headers:{'content-type':'text/html'}})});
 assert.equal(recovered.processed,1);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM eqe_qualified').get().n,0);
 const rejected=await qualifyAndPublishEvidence(env,{item_id:item.id,
  attestation:attest({...proof,commercial_derived_use_rights_verified:false})});
 assert.equal(rejected.state,'QUARANTINED');
 assert.ok(rejected.deficits.includes(DEFICITS.RIGHTS));
 const published=await qualifyAndPublishEvidence(env,{item_id:item.id,attestation:attest(proof)});
 assert.equal(published.state,'QUALIFIED');
 assert.equal(published.archive_byte_readback_verified,true);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM eqe_qualified').get().n,1);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM eqe_pending').get().n,0);
 // The new pointer table must not contain raw article text.
 const columns=sql.prepare('PRAGMA table_info(eqe_qualified)').all().map(r=>r.name);
 for(const k of ['body','raw_json','payload_json','unqualified_payload'])
  assert.ok(!columns.includes(k));
 const id=fundedUser(sql);
 const key=await mintCanonicalCustomerPaidKey(db,env,id);
 const initial=await deliverVerifiedEvidence(env,{apiKey:key.api_key,itemId:item.id});
 assert.equal(initial.status,200);
 assert.equal(initial.headers.get('X-GeoMacro-Credits-Charged'),'1');
 const replay=await deliverVerifiedEvidence(env,{apiKey:key.api_key,itemId:item.id});
 assert.equal(replay.headers.get('X-GeoMacro-Credits-Charged'),'0');
 assert.equal(await initial.text(),await replay.text());
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM credit_ledger WHERE event_type='debit'").get().n,1);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM eqe_delivery_receipts').get().n,1);
 assert.equal(sql.prepare('SELECT SUM(delta_credits) n FROM credit_ledger').get().n,2);
 const live=sql.prepare('SELECT b2_key FROM eqe_qualified').get();
 store.objects.set(live.b2_key,Buffer.from('{"corrupt":true}'));
 await assert.rejects(()=>deliverVerifiedEvidence(env,{apiKey:key.api_key,itemId:item.id}),
  /EQE_ARCHIVE_READBACK_HASH_MISMATCH/);
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM credit_ledger WHERE event_type='debit'").get().n,1);
 sql.close();
});
test('D1 unique claim prevents two distinct item IDs being published as one event',()=>{
 const {sql}=inMemorySql();
 const at=clock(now()),expires=clock(now()+2*3600000);
 const stmt=sql.prepare('INSERT INTO eqe_qualified(item_id,payload_sha256,envelope_sha256,envelope_length,b2_key,signature_ref,signing_key_id,review_sha256,claim_sha256,simhash,qualified_at,expires_at,tags) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
 const record=id=>[id,hex('payload'+id),hex('envelope'+id),512,
  'evidence/v1/2026/11/'+hex('envelope'+id)+'.json',
  'evidence/v1/2026/11/'+hex('signature'+id)+'.json',
  'test-evidence-1',hex('review'+id),hex('same-event'),hex('x').slice(0,16),
  at,expires,'["USA","geopolitics"]'];
 stmt.run(...record('a'.repeat(64)));
 assert.throws(()=>stmt.run(...record('b'.repeat(64))),/UNIQUE constraint failed: eqe_qualified.claim_sha256/);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM eqe_qualified').get().n,1);
 sql.close();
});
test('archive mutation/reviewer rejection must not create D1 qualified pointer or debit',async()=>{
 const {sql,db}=inMemorySql(),store=r2(),env=envWith(db,store),{raw,item,proof}=await fixtureItem();
 await ingestEvidence(env,raw);
 const invalid=await qualifyAndPublishEvidence(env,{item_id:item.id,
  attestation:attest(proof,signer.privateKey)});
 assert.equal(invalid.state,'QUARANTINED');
 assert.ok(invalid.deficits.includes(DEFICITS.REVIEW));
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM eqe_qualified').get().n,0);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM eqe_delivery_receipts').get().n,0);
 sql.close();
});
