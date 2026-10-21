import {test,expect,afterEach} from 'bun:test';
import {Database} from 'bun:sqlite';
import {readFileSync,mkdtempSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {deriveStatelessSignals} from '../../src/lib/stateless-intelligence-model.ts';
import {automatedInputId} from '../../src/lib/automated-intelligence-input.ts';
import {canonicalizePrivateOriginalSourceClock} from '../../src/lib/private-source-handoff.ts';
import {signAutomatedIntelligenceInput} from '../../src/lib/risk-object-signing.server.ts';
import {putAutomatedInputs,getAutomatedInputs} from '../../workers/control-plane/src/automated-intelligence-inputs.ts';
import {handlePrivateSourceHandoffs,safePrivateHandoffRejection} from '../../workers/control-plane/src/private-source-handoffs.ts';
import {handleLowSourceReviews,lowReviewToken} from '../../workers/control-plane/src/low-source-reviews.ts';
import {persistPrivateSourceHandoffs,readPrivateSourceRefs} from '../ops/persist-private-source-handoffs.ts';
import {readPrivateSourceHandoffs} from '../ops/read-private-source-handoffs.ts';
import {reviewDerivedInputs} from '../ops/review-derived-inputs-low-authority.ts';
import {verifyGeomacroUnclaimedOriginalPage} from '../lib/geomacro-original-page-readback.mjs';
import worker from '../../workers/control-plane/src/index.mjs';

// Real SQLite + actual repository migration SQL, not a mock SQL interpreter.
// All original pages, keys and signatures in this test are synthetic fixtures.
const now=new Date(),nowMs=now.getTime();
const issuer=generateKeyPairSync('ed25519'),reviewer=generateKeyPairSync('ed25519');
const publicB64=issuer.publicKey.export({format:'der',type:'spki'}).toString('base64');
const material={key_id:'handoff-test',public_key_spki_b64:publicB64,
 private_key_pkcs8_b64:issuer.privateKey.export({format:'der',type:'pkcs8'}).toString('base64')};
const keys={[material.key_id]:{public_key_spki_b64:publicB64,status:'active' as const}};
const reviewDer=reviewer.publicKey.export({format:'der',type:'spki'});
const trust={public_spki_b64:reviewDer.toString('base64'),public_sha256:createHash('sha256').update(reviewDer).digest('hex'),
 issuer_public_keys_b64:[publicB64]};
const reviewerEnv={GEOMACRO_LOW_REVIEW_PRIVATE_PKCS8_B64:reviewer.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),
 GEOMACRO_LOW_REVIEW_PUBLIC_PEM:reviewer.publicKey.export({format:'pem',type:'spki'}).toString(),
 GEOMACRO_LOW_REVIEW_PUBLIC_SHA256:trust.public_sha256,
 GEOMACRO_LOW_REVIEW_ISSUER_PUBLIC_KEYS_JSON:JSON.stringify([publicB64])};
const root='b'.repeat(64),scoped=await lowReviewToken(root);
const databases:Database[]=[],dirs:string[]=[];
afterEach(()=>{for(const db of databases.splice(0))db.close();for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
function store(){
 const db=new Database(':memory:');databases.push(db);
 db.exec(readFileSync(new URL('../../workers/control-plane/migrations/0001_core.sql',import.meta.url),'utf8'));
 const env={CONTROL_PLANE_TOKEN:root,AUTOMATED_FINDS_VERIFY_KEYS_JSON:JSON.stringify(keys),
  GEOMACRO_LOW_REVIEW_PUBLIC_SPKI_B64:trust.public_spki_b64,GEOMACRO_LOW_REVIEW_PUBLIC_SHA256:trust.public_sha256,
  DB:{prepare:(sql:string)=>({bind:(...args:any[])=>({sql,args,
   first:async()=>db.query(sql).get(...args),
   all:async()=>({success:true,results:db.query(sql).all(...args)})})}),
   batch:async(statements:any[])=>db.transaction(()=>statements.map(s=>({success:true,meta:db.query(s.sql).run(...s.args)})))()}};
 return {db,env};
}
async function fixture(index=0,padding='',credit='Federal Reserve Board'){
 const publishedAt=new Date(nowMs-3600_000-index*1000).toISOString();
 const ref={sourceId:'fed_press',category:'macro' as const,
  title:'Federal Reserve announces discount rate monetary policy decision'+padding,
  articleUrl:'https://www.federalreserve.gov/newsevents/pressreleases/monetary'+String.fromCharCode(97+Math.floor(index/26))+String.fromCharCode(97+index%26)+publishedAt.slice(0,10).replaceAll('-','')+'a.htm',
  publishedAt,credit};
 const signal=deriveStatelessSignals([ref],nowMs)[0];
 const envelope=await signAutomatedIntelligenceInput({schema:'geomacro.automated-intelligence-input.v1',
  approval_mode:'AUTOMATED_INGESTION',approved_for:'derived_intelligence_input',generated_at:now.toISOString(),
  expires_at:new Date(Date.parse(publishedAt)+72*3600_000).toISOString(),source_run_id:'1234',source_sha:'a'.repeat(40),
  signal,independent_reviewed:false,commercial_rights_attested:false,scored:false},material);
 return {signal,ref,envelope,item:{input_id:await automatedInputId(signal),ref}};
}
async function seed(env:any,fixtures:Awaited<ReturnType<typeof fixture>>[]){
 for(let i=0;i<fixtures.length;i+=40){
  const response=await putAutomatedInputs(env,{schema:'geomacro.automated-intelligence-input-batch.v1',
   items:fixtures.slice(i,i+40).map(f=>f.envelope)},nowMs);
  expect(response.status).toBe(200);
 }
}
const request=(method='PUT',token=root,body?:unknown,query='')=>new Request('https://control.example/v1/internal/source-handoffs'+query,
 {method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});

test('private mapping survives a producer run, binds the actual issuer-signed journal ID and cannot leak publicly',async()=>{
 const {db,env}=store(),f=await fixture();await seed(env,[f]);
 const response=await handlePrivateSourceHandoffs(request('PUT',root,{items:[f.item]}),env,nowMs);
 expect(await response.json()).toEqual({ok:true,accepted_ids:[f.item.input_id]});
 const first=db.query('SELECT value_json,version FROM control_state WHERE key=?').get('automated_source_handoff_v1:'+f.item.input_id) as any;
 expect(first.value_json).toContain(f.ref.articleUrl);
 await handlePrivateSourceHandoffs(request('PUT',root,{items:[f.item]}),env,nowMs+60000);
 expect(db.query('SELECT value_json,version FROM control_state WHERE key=?').get('automated_source_handoff_v1:'+f.item.input_id)).toEqual(first);
 const read=await handlePrivateSourceHandoffs(request('GET',scoped),env,nowMs);
 expect(read.headers.get('cache-control')).toBe('private, no-store');
 expect((await read.json()).items[0].ref).toEqual(f.ref);
 for(const token of ['',root])expect((await handlePrivateSourceHandoffs(request('GET',token),env,nowMs)).status).toBe(401);
 expect((await handlePrivateSourceHandoffs(request('PUT',scoped,{items:[f.item]}),env,nowMs)).status).toBe(401);
 for(const path of ['/v1/public/source-handoffs','/v1/internal/source-handoffs']){
  const denied=await worker.fetch(new Request('https://control.example'+path),env);
  expect(denied.status).toBeGreaterThanOrEqual(400);expect(await denied.text()).not.toContain(f.ref.articleUrl);
 }
});
test('batch admission is atomic and refuses a source URL swap, fabricated title, expired/revoked input or missing signature',async()=>{
 const {db,env}=store(),f=await fixture(),other=await fixture(1);await seed(env,[f,other]);
 for(const patch of [{articleUrl:'https://www.federalreserve.gov/newsevents/pressreleases/monetary20990101a.htm'},
  {title:'Some unrelated sports and lifestyle original headline'}, {sourceId:'unregistered-secret'},
  {category:'geopolitics'}, {publishedAt:now.toISOString()}]){
  const result=await handlePrivateSourceHandoffs(request('PUT',root,{items:[f.item,
   {...other.item,ref:{...other.ref,...patch}}]}),env,nowMs);
  expect(result.status).toBe(400);
  expect((db.query("SELECT COUNT(*) AS n FROM control_state WHERE key GLOB 'automated_source_handoff_v1:*'").get() as any).n).toBe(0);
 }
 expect((await handlePrivateSourceHandoffs(request('PUT',root,{items:[f.item]}),env,nowMs+72*3600_000)).status).toBe(400);
 env.AUTOMATED_FINDS_VERIFY_KEYS_JSON=JSON.stringify({[material.key_id]:{public_key_spki_b64:publicB64,status:'revoked'}});
 expect((await handlePrivateSourceHandoffs(request('PUT',root,{items:[f.item]}),env,nowMs)).status).toBe(400);
 env.AUTOMATED_FINDS_VERIFY_KEYS_JSON=JSON.stringify(keys);
 expect((await handlePrivateSourceHandoffs(request('PUT',root,{items:[{...f.item,input_id:'c'.repeat(64)}]}),env,nowMs)).status).toBe(400);
});
test('producer/private reader paginate actual SQL, acknowledge exact IDs and hide source details in receipts',async()=>{
 const {env}=store(),fixtures=await Promise.all(Array.from({length:81},(_,i)=>fixture(i)));await seed(env,fixtures);
 const fetcher=async(url:any,options:any={})=>String(url).includes('/intelligence-inputs/automated')
  ?getAutomatedInputs(env,new URL(url).searchParams,nowMs)
  :handlePrivateSourceHandoffs(new Request(url,options),env,nowMs);
 // The producer token is derived from the owner secret; use a stand-in
 // authorization mapping only at this synthetic HTTP test boundary.
 const producerFetch=async(url:any,options:any={})=>fetcher(url,{...options,headers:{...options.headers,authorization:'Bearer '+root}});
 const receipt=await persistPrivateSourceHandoffs({refs:new Map(fixtures.map(f=>[f.signal.id,f.ref])),
  env:{GEOMACRO_COMMERCE_LEDGER_TOKEN:'fixture-owner-secret'.repeat(2)},now,
  readJournal:async()=>fixtures.map(f=>f.signal),fetchImpl:producerFetch as typeof fetch});
 expect(receipt.references_accepted).toBe(81);
 expect(JSON.stringify(receipt)).not.toContain(fixtures[0].ref.articleUrl);
 const read=await readPrivateSourceHandoffs({env:{GEOMACRO_LOW_REVIEW_TOKEN:scoped},keys,trust,now,fetchImpl:fetcher as typeof fetch});
 expect(read.originals.size).toBe(81);expect(read.previous.size).toBe(0);
 const stale=await handlePrivateSourceHandoffs(request('GET',scoped),env,nowMs+72*3600_000);
 expect((await stale.json()).items).toEqual([]);
 for(const query of ['?offset=-1','?offset=601','?offset=0&offset=1','?other=1'])
  expect((await handlePrivateSourceHandoffs(request('GET',scoped,undefined,query),env,nowMs)).status).toBe(400);
});
test('later runs check the next pending original, preserve actual HTML proof and back off rejected sources',async()=>{
 const {env}=store(),fixtures=await Promise.all([fixture(),fixture(1)]);await seed(env,fixtures);
 for(const f of fixtures)expect((await handlePrivateSourceHandoffs(request('PUT',root,{items:[f.item]}),env,nowMs)).status).toBe(200);
 let cursor=nowMs;
 const fetcher=(url:any,options:any={})=>handlePrivateSourceHandoffs(new Request(url,options),env,cursor);
 const read=()=>readPrivateSourceHandoffs({env:{GEOMACRO_LOW_REVIEW_TOKEN:scoped},keys,trust,now:new Date(cursor),fetchImpl:fetcher as typeof fetch});
 let pages=0;
 const verifyOriginal=(args:any)=>verifyGeomacroUnclaimedOriginalPage({...args,fetchImpl:async()=>{
  pages++;return new Response('<html><head><meta property="article:published_time" content="'+args.original.original_published_at+
   '"></head><body>Offline synthetic publisher response for this fixture.</body></html>',{headers:{'content-type':'text/html'}});
 }});
 const persist=async(items:any[])=>{
  const result=await handleLowSourceReviews(new Request('https://control.example/v1/internal/low-source-reviews',
   {method:'PUT',headers:{authorization:'Bearer '+scoped},body:JSON.stringify({items})}),env,cursor);
  expect(result.status).toBe(200);
 };
 const first=await read();
 const firstResult=await reviewDerivedInputs({signals:fixtures.map(f=>f.signal),
  originalRefs:new Map(fixtures.map(f=>[f.signal.id,f.ref])),previousReviews:first.previous,
  env:reviewerEnv,now,verifyOriginal,persist});
 expect(firstResult.source_verified_items).toBe(1);expect(pages).toBe(1);
 cursor+=5*60000;const second=await read();
 const secondResult=await reviewDerivedInputs({signals:fixtures.map(f=>f.signal),
  originalRefs:new Map(fixtures.map(f=>[f.signal.id,f.ref])),previousReviews:second.previous,
  env:reviewerEnv,now:new Date(cursor),verifyOriginal,persist});
 expect(secondResult.reused_current_verified_items).toBe(1);expect(secondResult.source_verified_items).toBe(1);expect(pages).toBe(2);
 cursor+=5*60000;const third=await read();
 const thirdResult=await reviewDerivedInputs({signals:fixtures.map(f=>f.signal),
  originalRefs:new Map(fixtures.map(f=>[f.signal.id,f.ref])),previousReviews:third.previous,
  env:reviewerEnv,now:new Date(cursor),verifyOriginal,persist});
 expect(thirdResult.reused_current_verified_items).toBe(2);expect(pages).toBe(2);
 expect(thirdResult.reviewed_items).toBe(0);
});
test('private IPC refuses symlinks and permissive files; missing producer IPC does not erase retained handoffs',()=>{
 const temp=mkdtempSync(join(tmpdir(),'geomacro-handoff-test-'));dirs.push(temp);
 const path=join(temp,'refs.json'),env={RUNNER_TEMP:temp,GEOMACRO_LOW_REVIEW_REFS_FILE:path};
 expect(readPrivateSourceRefs(env).size).toBe(0);
 writeFileSync(path,JSON.stringify({refs:[]}),{mode:0o600});expect(readPrivateSourceRefs(env).size).toBe(0);
 const link=join(temp,'link.json');symlinkSync(path,link);
 expect(()=>readPrivateSourceRefs({...env,GEOMACRO_LOW_REVIEW_REFS_FILE:link})).toThrow();
 writeFileSync(join(temp,'unsafe.json'),JSON.stringify({refs:[]}),{mode:0o644});
 expect(()=>readPrivateSourceRefs({...env,GEOMACRO_LOW_REVIEW_REFS_FILE:join(temp,'unsafe.json')})).toThrow();
});
test('failed original reads are signed rejected, not retried inside cooldown, and tampered prior state cannot suppress a new check',async()=>{
 const f=await fixture();let attempts=0;const saved:any[]=[];
 const originalRefs=new Map([[f.signal.id,f.ref]]);
 const options={signals:[f.signal],originalRefs,env:reviewerEnv,now,
  verifyOriginal:(args:any)=>verifyGeomacroUnclaimedOriginalPage({...args,fetchImpl:async()=>{attempts++;return new Response('',{status:403});}}),
  persist:async(items:any[])=>saved.push(...items)};
 const result=await reviewDerivedInputs(options);
 expect(result.source_verified_items).toBe(0);expect(attempts).toBe(1);
 expect(saved[0].review.verdict).toBe('SOURCE_EVIDENCE_REJECTED');
 const next=await reviewDerivedInputs({...options,now:new Date(nowMs+5*60000),
  previousReviews:new Map([[f.item.input_id,saved[0]]])});
 expect(next.source_retry_cooldown_items).toBe(1);expect(attempts).toBe(1);
 const forged=structuredClone(saved[0]);forged.review.verdict='SOURCE_EVIDENCE_VERIFIED';
 await reviewDerivedInputs({...options,now:new Date(nowMs+5*60000),previousReviews:new Map([[f.item.input_id,forged]])});
 expect(attempts).toBe(2);
 await reviewDerivedInputs({...options,now:new Date(nowMs+31*60000),previousReviews:new Map([[f.item.input_id,saved[0]]])});
 expect(attempts).toBe(3);
});
test('retention prunes only expired/orphan handoffs and never unrelated control namespaces',async()=>{
 const {db,env}=store(),f=await fixture();await seed(env,[f]);
 const insert=db.query('INSERT INTO control_state(key,value_json,version,updated_at) VALUES (?,?,1,?)');
 insert.run('automated_source_handoff_v1:'+'c'.repeat(64),JSON.stringify({expires_at:new Date(nowMs+1000).toISOString()}),now.toISOString());
 insert.run('automated_source_handoff_v1:'+'d'.repeat(64),JSON.stringify({expires_at:new Date(nowMs-1000).toISOString()}),now.toISOString());
 for(const key of ['automated_input_v1:unrelated','low_source_review_v1:unrelated','private_other_namespace'])
  insert.run(key,'{}',now.toISOString());
 expect((await handlePrivateSourceHandoffs(request('PUT',root,{items:[f.item]}),env,nowMs)).status).toBe(200);
 expect((db.query("SELECT COUNT(*) AS n FROM control_state WHERE key GLOB 'automated_source_handoff_v1:*'").get() as any).n).toBe(1);
 for(const key of ['automated_input_v1:unrelated','low_source_review_v1:unrelated','private_other_namespace'])
  expect(db.query('SELECT key FROM control_state WHERE key=?').get(key)).not.toBeNull();
});
test('UTF-8 heavy originals use bounded variable-size write and read pages',async()=>{
 const {env}=store(),fixtures=await Promise.all(Array.from({length:81},(_,i)=>fixture(i,'界'.repeat(1900),'界'.repeat(230))));
 await seed(env,fixtures);let puts=0,gets=0;const writes:number[]=[],reads:number[]=[];
 const fetcher=async(url:any,options:any={})=>{
  if(String(url).includes('/intelligence-inputs/automated'))return getAutomatedInputs(env,new URL(url).searchParams,nowMs);
  if(options.method==='PUT'){puts++;writes.push(JSON.parse(options.body).items.length);expect(new TextEncoder().encode(options.body).byteLength).toBeLessThanOrEqual(250000);}
  else gets++;
  const result=await handlePrivateSourceHandoffs(new Request(url,{...options,headers:{authorization:'Bearer '+(options.method==='PUT'?root:scoped)}}),env,nowMs);
  expect(new TextEncoder().encode(await result.clone().text()).byteLength).toBeLessThan(251000);
  if(options.method!=='PUT')reads.push((await result.clone().json()).items.length);
  return result;
 };
 await persistPrivateSourceHandoffs({refs:new Map(fixtures.map(f=>[f.signal.id,f.ref])),
  env:{GEOMACRO_COMMERCE_LEDGER_TOKEN:'fixture-owner-secret'.repeat(2)},now,
  readJournal:async()=>fixtures.map(f=>f.signal),fetchImpl:fetcher as typeof fetch});
 const result=await readPrivateSourceHandoffs({env:{GEOMACRO_LOW_REVIEW_TOKEN:scoped},keys,trust,now,fetchImpl:fetcher as typeof fetch});
 expect(result.originals.size).toBe(81);expect(puts).toBeGreaterThanOrEqual(3);expect(gets).toBeGreaterThanOrEqual(3);
 expect(writes[0]).toBeLessThan(40);expect(reads[0]).toBeLessThan(40);
});
test('continuation reviewer has no issuer, B2 or Cloudflare private capability and cannot upload source evidence',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/five-minute-original-news-fastlane.yml',import.meta.url),'utf8');
 const job=workflow.split('  continue-private-source-review:')[1].split('  fastlane-contract:')[0];
 for(const forbidden of ['RISK_OBJECT_SIGNING_PRIVATE_KEY','B2_APPLICATION_KEY','CLOUDFLARE_API_TOKEN','upload-artifact'])
  expect(job).not.toContain(forbidden);
 const step=job.split('      - name: Check retained originals with the independent low authority')[1].split('      - name:')[0];
 expect(step).not.toContain('GEOMACRO_COMMERCE_LEDGER_TOKEN');
 expect(step).toContain('GEOMACRO_LOW_REVIEW_PRIVATE_PKCS8_B64');
 expect(job).toContain('Remove private review results');
});

test('private handoff rejections are bounded classes without evidence text',()=>{
 expect(safePrivateHandoffRejection(new Error('SIGNED_INPUT_REQUIRED'))).toBe('SIGNED_INPUT_NOT_PRESENT');
 expect(safePrivateHandoffRejection(new Error('PRIVATE_SOURCE_HANDOFF_REFERENCE_INVALID'))).toBe('ORIGINAL_REFERENCE_FORMAT');
 expect(safePrivateHandoffRejection(new Error('PRIVATE_SOURCE_HANDOFF_BINDING_INVALID'))).toBe('SIGNED_SIGNAL_ORIGINAL_BINDING');
 expect(safePrivateHandoffRejection(new Error('AUTOMATED_INPUT_CLOCK_INVALID'))).toBe('SIGNED_INPUT_STALE_OR_CLOCK');
 expect(safePrivateHandoffRejection(new Error('WRITE'))).toBe('D1_WRITE');
 expect(safePrivateHandoffRejection(new Error('article title https://issuer.example/a?secret=1'))).toBe('UNCLASSIFIED_VALIDATION_OR_STORE');
 expect(safePrivateHandoffRejection({message:'SIGNED_INPUT_REQUIRED'})).toBe('UNCLASSIFIED_VALIDATION_OR_STORE');
});

test('native UTC-offset original clock is canonically stored only if identical to signed source moment',async()=>{
 const {db,env}=store(),f=await fixture();await seed(env,[f]);
 const offsetRef={...f.ref,publishedAt:f.ref.publishedAt.replace('Z','+00:00')};
 expect(offsetRef.publishedAt).not.toBe(f.signal.published_at);
 const canonical=canonicalizePrivateOriginalSourceClock(offsetRef,f.signal);
 expect(canonical.publishedAt).toBe(f.signal.published_at);
 expect(canonical.articleUrl).toBe(f.ref.articleUrl);
 expect(canonical.title).toBe(f.ref.title);
 const index=async(url:any,options:any={})=>String(url).includes('/intelligence-inputs/automated')
  ?getAutomatedInputs(env,new URL(url).searchParams,nowMs)
  :handlePrivateSourceHandoffs(new Request(url,{...options,headers:{...options.headers,authorization:'Bearer '+root}}),env,nowMs);
 const receipt=await persistPrivateSourceHandoffs({refs:new Map([[f.signal.id,offsetRef]]),
   env:{GEOMACRO_COMMERCE_LEDGER_TOKEN:'fixture-owner-secret'.repeat(2)},now,
   readJournal:async()=>[f.signal],fetchImpl:index as typeof fetch});
 expect(receipt.references_accepted).toBe(1);
 expect(receipt.equivalent_native_clock_representations_normalized).toBe(1);
 const saved=db.query('SELECT value_json FROM control_state WHERE key=?')
  .get('automated_source_handoff_v1:'+f.item.input_id) as any;
 expect(JSON.parse(saved.value_json).ref.publishedAt).toBe(f.signal.published_at);
 const mismatch={...offsetRef,publishedAt:new Date(Date.parse(f.signal.published_at)+60000).toISOString()};
 expect(canonicalizePrivateOriginalSourceClock(mismatch,f.signal)).toBe(mismatch);
 const daySignal={...f.signal,published_at:f.signal.published_at.slice(0,10),date_precision:'day'};
 expect(canonicalizePrivateOriginalSourceClock(offsetRef,daySignal)).toBe(offsetRef);
});
test('strict handoff rejects forged clock and unsafe URL with separate safe reasons',async()=>{
 const {env}=store(),f=await fixture();await seed(env,[f]);
 const forged={...f.item,ref:{...f.ref,publishedAt:new Date(Date.parse(f.ref.publishedAt)+60000).toISOString()}};
 const clock=await handlePrivateSourceHandoffs(request('PUT',root,{items:[forged]}),env,nowMs);
 expect(clock.status).toBe(400);
 expect((await clock.json()).reason_code).toBe('ORIGINAL_REFERENCE_CLOCK');
 const unsafe={...f.item,ref:{...f.ref,articleUrl:f.ref.articleUrl+'?tracking=1'}};
 const url=await handlePrivateSourceHandoffs(request('PUT',root,{items:[unsafe]}),env,nowMs);
 expect(url.status).toBe(400);
 expect((await url.json()).reason_code).toBe('ORIGINAL_REFERENCE_URL');
});

test('one genuine original clock mismatch cannot reject other independent signed D1 mappings',async()=>{
 const {db,env}=store(),a=await fixture(),b=await fixture(1);
 await seed(env,[a,b]);
 const bad={...a.ref,publishedAt:new Date(Date.parse(a.ref.publishedAt)+60_000).toISOString()};
 let putAttempts=0;
 const fetcher=async(url:any,options:any={})=>{
  if(String(url).includes('/intelligence-inputs/automated'))
   return getAutomatedInputs(env,new URL(url).searchParams,nowMs);
  if(options.method==='PUT')putAttempts++;
  return handlePrivateSourceHandoffs(new Request(url,{...options,headers:{...options.headers,
   authorization:'Bearer '+root}}),env,nowMs);
 };
 const receipt=await persistPrivateSourceHandoffs({
  refs:new Map([[a.signal.id,bad],[b.signal.id,b.ref]]),
  env:{GEOMACRO_COMMERCE_LEDGER_TOKEN:'fixture-owner-secret'.repeat(2)},
  now,readJournal:async()=>[a.signal,b.signal],fetchImpl:fetcher as typeof fetch});
 expect(receipt.references_accepted).toBe(1);
 expect(receipt.original_refs_deferred_clock_mismatch).toBe(1);
 expect(receipt.all_private_original_refs_qualified).toBe(false);
 expect(receipt.source_evidence_verified).toBe(false);
 expect(receipt.commercial_rights_attested).toBe(false);
 expect(putAttempts).toBe(1);
 expect(db.query('SELECT value_json FROM control_state WHERE key=?')
  .get('automated_source_handoff_v1:'+a.item.input_id)).toBeNull();
 expect(db.query('SELECT value_json FROM control_state WHERE key=?')
  .get('automated_source_handoff_v1:'+b.item.input_id)).not.toBeNull();
 expect(JSON.stringify(receipt)).not.toContain(b.ref.articleUrl);
});
test('invalid source URL is quarantined without D1 writes or fake original verification',async()=>{
 const {db,env}=store(),a=await fixture();await seed(env,[a]);
 const bad={...a.ref,articleUrl:a.ref.articleUrl+'?tracking=1'};
 let putAttempts=0;
 const fetcher=async(url:any,options:any={})=>{
  if(String(url).includes('/intelligence-inputs/automated'))
   return getAutomatedInputs(env,new URL(url).searchParams,nowMs);
  if(options.method==='PUT')putAttempts++;
  return handlePrivateSourceHandoffs(new Request(url,{...options,headers:{...options.headers,
   authorization:'Bearer '+root}}),env,nowMs);
 };
 const receipt=await persistPrivateSourceHandoffs({refs:new Map([[a.signal.id,bad]]),
  env:{GEOMACRO_COMMERCE_LEDGER_TOKEN:'fixture-owner-secret'.repeat(2)},
  now,readJournal:async()=>[a.signal],fetchImpl:fetcher as typeof fetch});
 expect(receipt.references_accepted).toBe(0);
 expect(receipt.original_refs_deferred_url).toBe(1);
 expect(receipt.all_private_original_refs_qualified).toBe(false);
 expect(putAttempts).toBe(0);
 expect((db.query("SELECT COUNT(*) AS n FROM control_state WHERE key GLOB 'automated_source_handoff_v1:*'").get() as any).n).toBe(0);
});
