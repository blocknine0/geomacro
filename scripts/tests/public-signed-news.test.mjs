import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {publicSignedNews} from '../../workers/control-plane/src/public-signed-news.mjs';
import {automatedInputSignable,automatedInputId,inputHash} from '../../src/lib/automated-intelligence-input.ts';
import {lowSourceReviewBytes} from '../../src/lib/low-authority-source-review.ts';
import {verifyAllNewsSignedPublications} from '../ops/verify-all-news-signed-publications.mjs';
const now=Date.parse('2026-10-22T12:00:00.000Z');
const issuer=generateKeyPairSync('ed25519'),reviewer=generateKeyPairSync('ed25519');
const pub=issuer.publicKey.export({format:'der',type:'spki'}).toString('base64');
const reviewPub=reviewer.publicKey.export({format:'der',type:'spki'});
const keys={issuer:{public_key_spki_b64:pub,status:'active'}};
function signal(i=1,age=30){return {id:'macro-'+i.toString(16).padStart(8,'0'),category:'macro',
 title:'Geomacro finds official policy developments affecting trade conditions',
 what_changed:'An official publisher issued an original-dated policy release concerning trade conditions.',
 why_it_matters:'Official policy developments can affect trade conditions; implementation needs separate verification.',
 topic:'trade and economic relations',geography:null,development_type:'policy release',
 published_at:new Date(now-age*60000-i).toISOString(),date_precision:'exact',
 observed_release_count:1,sources_credited:[],status:'official_release_observed_unscored',same_event_corrob_verified:false,severity:null};}
async function fixture(signals=[signal()]){
 const rows=new Map();
 for(const s of signals){
  const id=await automatedInputId(s),payload={schema:'geomacro.automated-intelligence-input.v1',
   approval_mode:'AUTOMATED_INGESTION',approved_for:'derived_intelligence_input',generated_at:new Date(now-60000).toISOString(),
   expires_at:new Date(Date.parse(s.published_at)+72*3600000).toISOString(),source_run_id:'42',source_sha:'a'.repeat(40),
   independent_reviewed:false,commercial_rights_attested:false,scored:false,signal:s};
  const bytes=automatedInputSignable(payload);
  rows.set('automated_input_v1:'+id,JSON.stringify({payload,integrity:{signing_key_id:'issuer',signature_scheme:'ed25519',
   canonicalization:'geomacro-canonical-json-v1',payload_sha256:await inputHash(bytes),signature:sign(null,Buffer.from(bytes),issuer.privateKey).toString('base64')}}));
  const review={schema:'geomacro.internal-low-source-review.v1',authority:'GEOMACRO_INTERNAL_AUTOMATED_LOW_V1',
   scope:'ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME',input_id:id,category:s.category,source_published_at:s.published_at,
   reviewed_at:new Date(now-30000).toISOString(),expires_at:new Date(Date.parse(s.published_at)+72*3600000).toISOString(),
   verdict:'SOURCE_EVIDENCE_VERIFIED',reason:'ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME_VERIFIED',evidence_sha256:'f'.repeat(64),
   semantic_claims_verified:false,commercial_authorization:false,external_reviewer_attested:false};
  rows.set('low_source_review_v1:'+id,JSON.stringify({review,signature:sign(null,lowSourceReviewBytes(review),reviewer.privateKey).toString('base64')}));
 }
 const queries=[];
 const env={AUTOMATED_FINDS_VERIFY_KEYS_JSON:JSON.stringify(keys),
  GEOMACRO_LOW_REVIEW_PUBLIC_SPKI_B64:reviewPub.toString('base64'),
  GEOMACRO_LOW_REVIEW_PUBLIC_SHA256:createHash('sha256').update(reviewPub).digest('hex'),
  DB:{prepare:sql=>({bind:(...ids)=>({all:async()=>{queries.push(ids);return {success:true,
   results:ids.filter(id=>rows.has(id)).map(key=>({key,value_json:rows.get(key)}))};}})})}};
 const readStories=async(_env,_now,offset)=>Response.json({ok:true,schema:'geomacro.website-derived-news-feed.v1',
  delivery_scope:'free_website_only',retention_hours:72,retention_days:3,original_release_delay_minutes:0,
  page_offset:offset,page_size:250,has_more:offset+250<signals.length,
  next_offset:offset+250<signals.length?offset+250:null,signals:signals.slice(offset,offset+250)});
 const get=(query='')=>publicSignedNews(env,new URLSearchParams(query),now,{readStories});
 const fetchImpl=async url=>get(new URL(url).search.slice(1));
 return {rows,env,get,queries,fetchImpl};
}
test('each current signed item has a real registered signature and narrow original review, without raw source disclosure',async()=>{
 const f=await fixture(),response=await f.get(),doc=await response.json();
 assert.equal(response.status,200);assert.equal(doc.items[0].current_source_verified_signed,true);
 assert.equal(doc.items[0].signature_verified,true);assert.equal(doc.page_counts.original_pages_verified,1);
 assert.equal(doc.legacy_signed_hot_product_equivalent,false);
 assert.equal(JSON.stringify(doc).includes('evidence_sha256'),false);
 assert.equal(JSON.stringify(doc).includes('source-handoff'),false);
 const result=await verifyAllNewsSignedPublications({keys,now,fetchImpl:f.fetchImpl,readJournal:async()=>[signal()]});
 assert.equal(result.all_retained_unique_news_signature_verified,true);
 assert.equal(result.all_current_qualified_news_source_verified_signed,true);
 assert.equal(result.legacy_signed_hot_3_of_3_verified,false);
});
test('missing, tampered, unknown-key or swapped input is never signed publication',async()=>{
 for(const mutate of [
  (rows,id)=>rows.delete('automated_input_v1:'+id),
  (rows,id)=>{const key='automated_input_v1:'+id,e=JSON.parse(rows.get(key));e.payload.signal.what_changed+=' Altered.';rows.set(key,JSON.stringify(e));},
  (rows,id)=>{const key='automated_input_v1:'+id,e=JSON.parse(rows.get(key));e.integrity.signing_key_id='unknown';rows.set(key,JSON.stringify(e));},
 ]){
  const f=await fixture();mutate(f.rows,await automatedInputId(signal()));
  const d=await (await f.get()).json();assert.equal(d.items[0].signature_verified,false);
  assert.equal(d.items[0].current_source_verified_signed,false);assert.equal(d.items[0].proof,null);
  await assert.rejects(()=>verifyAllNewsSignedPublications({keys,now,fetchImpl:f.fetchImpl,readJournal:async()=>[signal()]}));
 }
});
test('a valid signature cannot manufacture absent or altered original evidence',async()=>{
 for(const mutation of ['missing','tamper']){
  const f=await fixture(),id=await automatedInputId(signal()),key='low_source_review_v1:'+id;
  if(mutation==='missing')f.rows.delete(key);else{const r=JSON.parse(f.rows.get(key));r.review.evidence_sha256='a'.repeat(64);f.rows.set(key,JSON.stringify(r));}
  const d=await (await f.get()).json();assert.equal(d.items[0].signature_verified,true);
  assert.equal(d.items[0].original_page_verified,false);assert.equal(d.items[0].current_source_verified_signed,false);
 }
});
test('all pages are checked against the independent journal inventory; aliases are deduplicated',async()=>{
 const signals=Array.from({length:45},(_,i)=>signal(i+1));signals.push({...signals[0],id:'macro-abcdef01'});
 const f=await fixture(signals),result=await verifyAllNewsSignedPublications({keys,now,fetchImpl:f.fetchImpl,readJournal:async()=>signals});
 assert.equal(result.exact_signed_inputs_independently_verified,45);assert.equal(result.journal_items,46);
 assert.equal(f.queries.length,2);assert.equal(f.queries.every(q=>q.length<=80),true);
});
test('old news stays dated rather than being made current by a recent signature',async()=>{
 const s=signal(1,120),f=await fixture([s]),d=await (await f.get()).json();
 assert.equal(d.items[0].signature_verified,true);assert.equal(d.items[0].source_current_under_60_minutes,false);
 assert.equal(d.items[0].current_source_verified_signed,false);assert.equal(d.items[0].original_published_at,s.published_at);
});
test('bad queries and unavailable state fail without returning private material',async()=>{
 const f=await fixture();for(const q of ['offset=1','offset=600','offset=-40','offset=0&offset=40','url=https://evil.test'])assert.equal((await f.get(q)).status,400);
 f.env.DB.prepare=()=>{throw Error('private detail');};
 const response=await f.get();assert.equal(response.status,503);assert.equal((await response.text()).includes('private detail'),false);
});
test('a self-supplied public key never replaces the independently registered signing pin',async()=>{
 const f=await fixture();const another=generateKeyPairSync('ed25519');
 await assert.rejects(()=>verifyAllNewsSignedPublications({keys:{issuer:another.publicKey.export({format:'der',type:'spki'}).toString('base64')},now,fetchImpl:f.fetchImpl,readJournal:async()=>[signal()]}));
});
test('revoked issuer and mismatched stored identities cannot qualify',async()=>{
 const f=await fixture(),id=await automatedInputId(signal());
 const revoked=JSON.parse(f.env.AUTOMATED_FINDS_VERIFY_KEYS_JSON);revoked.issuer.status='revoked';
 f.env.AUTOMATED_FINDS_VERIFY_KEYS_JSON=JSON.stringify(revoked);
 assert.equal((await (await f.get()).json()).items[0].signature_verified,false);
 const swapped=await fixture([signal(),signal(2)]);
 swapped.rows.set('automated_input_v1:'+id,swapped.rows.get('automated_input_v1:'+await automatedInputId(signal(2))));
 assert.equal((await (await swapped.get()).json()).items[0].signature_verified,false);
});
test('the all-news acceptance rejects omitted, duplicate and forged publication claims',async()=>{
 for(const mutation of [
  doc=>{doc.items=[];},
  doc=>{doc.items[0].commercial_rights_attested=true;},
  doc=>{doc.items[0].original_published_at=new Date(now).toISOString();},
  doc=>{doc.items[0].current_source_verified_signed=false;},
  doc=>{doc.next_offset=80;},
 ]){
  const f=await fixture();
  await assert.rejects(()=>verifyAllNewsSignedPublications({keys,now,readJournal:async()=>[signal()],fetchImpl:async url=>{
   const r=await f.fetchImpl(url),doc=await r.json();mutation(doc);return Response.json(doc);
  }}));
 }
});

test('public verification keys expose only explicitly public key fields',async()=>{
 const f=await fixture(),registry=JSON.parse(f.env.AUTOMATED_FINDS_VERIFY_KEYS_JSON);
 registry.issuer.private_operator_note='DO_NOT_DISCLOSE_INTERNAL_CONFIGURATION';
 f.env.AUTOMATED_FINDS_VERIFY_KEYS_JSON=JSON.stringify(registry);
 const d=await (await f.get()).json();
 assert.equal(d.items[0].signature_verified,true);
 assert.equal(JSON.stringify(d).includes('DO_NOT_DISCLOSE_INTERNAL_CONFIGURATION'),false);
 assert.deepEqual(Object.keys(d.items[0].verification_key).sort(),['not_after','not_before','public_key_spki_b64','status']);
});
test('22h source verification remains separate from 60-minute live release freshness',async()=>{
 const s=signal(1,21*60),f=await fixture([s]),doc=await (await f.get()).json();
 assert.equal(doc.original_verification_window_hours,22);
 assert.equal(doc.items[0].original_page_verified,true);
 assert.equal(doc.items[0].source_current_under_60_minutes,false);
 assert.equal(doc.items[0].current_source_verified_signed,false);
 const result=await verifyAllNewsSignedPublications({keys,now,fetchImpl:f.fetchImpl,readJournal:async()=>[s]});
 assert.equal(result.original_verification_window_hours,22);
 assert.equal(result.original_page_verified_reported,1);
});
