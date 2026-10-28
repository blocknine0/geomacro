import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {generateKeyPairSync} from 'node:crypto';
import {signAutomatedIntelligenceInput} from '../lib/risk-object-signing.server';
import {automatedInputId,verifyAutomatedInput,type AutomatedInputPayload} from '../lib/automated-intelligence-input';
import {publishAutomatedIntelligenceInputs,safeAutomatedInputPublicationFailure} from '../../scripts/ops/publish-automated-intelligence-inputs';
import {putAutomatedInputs,getAutomatedInputs} from '../../workers/control-plane/src/automated-intelligence-inputs';
// @ts-expect-error The existing JavaScript Worker entry has no declaration file.
import worker from '../../workers/control-plane/src/index.mjs';
const NOW=Date.parse('2026-10-21T12:00:00.000Z');
const pair=generateKeyPairSync('ed25519');
const pub=pair.publicKey.export({format:'der',type:'spki'}).toString('base64');
const material={key_id:'test-issuer',public_key_spki_b64:pub,
 private_key_pkcs8_b64:pair.privateKey.export({format:'der',type:'pkcs8'}).toString('base64')};
const keys={[material.key_id]:{public_key_spki_b64:pub,status:'active' as const}};
const signal=(category='macro',i=1)=>({id:category+'-'+i.toString(16).padStart(8,'0'),category,
 title:'Geomacro finds official policy developments affecting trade conditions',
 what_changed:'An official publisher issued an original-dated policy release concerning trade conditions.',
 why_it_matters:'Official policy developments can affect trade conditions; implementation needs separate verification.',
 topic:'trade and economic relations',geography:null,development_type:'policy release',
 published_at:new Date(NOW-3600_000-i*1000).toISOString(),date_precision:'exact',
 observed_release_count:1,sources_credited:[],status:'official_release_observed_unscored',
 same_event_corrob_verified:false,severity:null}) as any;
const payload=(s=signal()):AutomatedInputPayload=>({schema:'geomacro.automated-intelligence-input.v1',
 approval_mode:'AUTOMATED_INGESTION',approved_for:'derived_intelligence_input',generated_at:new Date(NOW).toISOString(),
 expires_at:new Date(Date.parse(s.published_at)+72*3600_000).toISOString(),
 source_run_id:'1234',source_sha:'a'.repeat(40),signal:s,
 independent_reviewed:false,commercial_rights_attested:false,scored:false});
const sign=(p:AutomatedInputPayload)=>signAutomatedIntelligenceInput(p,material);
function store(){
 const rows=new Map<string,any>();
 const env={AUTOMATED_FINDS_VERIFY_KEYS_JSON:JSON.stringify(keys),DB:{
  prepare:(sql:string)=>({bind:(...args:any[])=>({sql,args,all:async()=>({success:true,
   results:[...rows].sort(([a],[b])=>a.localeCompare(b)).filter(([,r])=>JSON.parse(r.value_json).payload.expires_at>args[1])
    .slice(args[3],args[3]+args[2]).map(([key,r])=>({key,...r,signing_key_id:JSON.parse(r.value_json).integrity.signing_key_id}))})})}),
  batch:async(stmts:any[])=>stmts.map(s=>{
   if(s.sql.startsWith('DELETE FROM control_state WHERE key GLOB ?')&&s.sql.includes('json_each(?)')){
    const [glob,prefix,jsonIds]=s.args,keep=new Set(JSON.parse(jsonIds).map((id:string)=>prefix+id));
    let changes=0;for(const key of [...rows.keys()])if(key.startsWith(prefix)&&!keep.has(key)){rows.delete(key);changes++;}
    return {success:true,meta:{changes}};
   }
   if(s.sql.startsWith('INSERT')){const [key,value_json,updated_at]=s.args;
    const old=rows.get(key);let changes=0;
    if(!old||JSON.parse(old.value_json).integrity.signing_key_id!==JSON.parse(value_json).integrity.signing_key_id&&updated_at>old.updated_at){
     rows.set(key,{value_json,updated_at});changes=1;
    }return {success:true,meta:{changes}};
   }
   if(s.sql.startsWith("DELETE FROM control_state WHERE key GLOB ? AND json_extract(value_json,'$.payload.expires_at')<=")){
    return {success:true,meta:{changes:0}};
   }
   if(s.sql.includes('LIMIT -1 OFFSET 600'))return {success:true,meta:{changes:0}};
   return {success:true,meta:{changes:0}};
  }),
 }};
 return {env,rows};
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(NOW);});
afterEach(()=>{vi.useRealTimers();});
describe('automatic approval of all retained derived inputs',()=>{
 it('signs real bytes with the configured issuer and preserves original uncertainty',async()=>{
  const p=payload();p.signal.status='official_feed_candidate_unscored';
  p.signal.topic='macro publisher candidate';p.signal.development_type='unclassified publisher update';
  const e=await sign(p);await verifyAutomatedInput(e,keys,NOW);
  expect(e.payload.approval_mode).toBe('AUTOMATED_INGESTION');
  expect(e.payload.signal.status).toBe('official_feed_candidate_unscored');
  expect(e.payload.independent_reviewed).toBe(false);
  expect(e.payload.commercial_rights_attested).toBe(false);
 });
 it('rejects altered content, revoked keys, false review and expired originals',async()=>{
  const e=await sign(payload());const changed=structuredClone(e);changed.payload.signal.what_changed+=' changed';
  await expect(verifyAutomatedInput(changed,keys,NOW)).rejects.toThrow();
  await expect(verifyAutomatedInput(e,{[material.key_id]:{public_key_spki_b64:pub,status:'revoked'}},NOW)).rejects.toThrow();
  await expect(sign({...payload(),independent_reviewed:true} as any)).rejects.toThrow();
  await expect(verifyAutomatedInput(e,keys,NOW+72*3600_000)).rejects.toThrow();
 });
 it('deduplicates identical content under different journal IDs but retains revisions and categories',async()=>{
  const s=signal(),alias={...s,id:'macro-ffffffff'};
  expect(await automatedInputId(s)).toBe(await automatedInputId(alias));
  expect(await automatedInputId({...s,what_changed:s.what_changed+' Revised.'})).not.toBe(await automatedInputId(s));
  expect(await automatedInputId(signal('geopolitics'))).not.toBe(await automatedInputId(s));
 });
 it('atomically accepts one stored item on repeated signed delivery and verifies the readback',async()=>{
  const db=store(),e=await sign(payload()),id=await automatedInputId(e.payload.signal);
  const body={schema:'geomacro.automated-intelligence-input-batch.v1',retained_ids:[id],items:[e,e]};
  const first=await (await putAutomatedInputs(db.env,body,NOW)).json();
  const again=await (await putAutomatedInputs(db.env,body,NOW)).json();
  expect(first.inserted_or_resigned).toBe(1);expect(again.inserted_or_resigned).toBe(0);expect(db.rows.size).toBe(1);
  const read=await (await getAutomatedInputs(db.env,new URLSearchParams(),NOW)).json();
  expect(read.items).toEqual([e]);
  const bad=structuredClone(e);bad.payload.signal.title+=' modified';
  const rejected=await putAutomatedInputs(db.env,{...body,retained_ids:[id,await automatedInputId(bad.payload.signal)],items:[e,bad]},NOW);
  expect(rejected.status).toBe(400);
  expect((await rejected.json()).reason_code).toBe('AUTOMATED_INPUT_SIGNATURE_INVALID');
  expect(db.rows.size).toBe(1);
 });
 it('reconciles stale/orphan input revisions to the current journal before readback',async()=>{
  const db=store();
  const stale=await sign(payload(signal('macro',901))),staleId=await automatedInputId(stale.payload.signal);
  await putAutomatedInputs(db.env,{schema:'geomacro.automated-intelligence-input-batch.v1',retained_ids:[staleId],items:[stale]},NOW);
  const current=await sign(payload(signal('rare_earth',902))),currentId=await automatedInputId(current.payload.signal);
  const result=await putAutomatedInputs(db.env,{schema:'geomacro.automated-intelligence-input-batch.v1',
   retained_ids:[currentId],items:[current]},NOW);
  expect(result.status).toBe(200);
  const ids=await (await getAutomatedInputs(db.env,new URLSearchParams('view=ids'),NOW)).json();
  expect(ids.ids).toEqual([currentId]);
  expect(db.rows.size).toBe(1);
 });
 it('handles over 50 per category, all 600 journal items and reruns without another write',async()=>{
  const db=store();const retained=Array.from({length:600},(_,i)=>signal(['geopolitics','macro','rare_earth'][i%3],i+1));
  const fetchImpl=vi.fn(async(url:any,options:any)=>options.method==='PUT'
   ?putAutomatedInputs(db.env,JSON.parse(options.body),NOW)
   :getAutomatedInputs(db.env,new URL(String(url)).searchParams,NOW));
  const options={fetchImpl,env:{GEOMACRO_COMMERCE_LEDGER_TOKEN:'x'.repeat(32),GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'1234'},
   now:new Date(NOW),readJournal:async()=>retained,sign,keys,
   publishScores:async({signals}:any)=>({all_retained_inputs_signed_scored:true,
    unique_source_inputs:signals.length})};
  const first=await publishAutomatedIntelligenceInputs(options);
  expect(first.new_signed_inputs).toBe(600);expect(first.all_retained_unique_inputs_present).toBe(true);
  expect(db.rows.size).toBe(600);fetchImpl.mockClear();
  const again=await publishAutomatedIntelligenceInputs(options);
  expect(again.new_signed_inputs).toBe(0);expect(again.already_signed).toBe(600);
  const calls=fetchImpl.mock.calls.map(([,opt])=>opt.method);
  expect(calls.filter(method=>method==='PUT')).toHaveLength(1);
  expect(calls.filter(method=>method==='GET').length).toBeGreaterThanOrEqual(2);
  const reconcile=JSON.parse(fetchImpl.mock.calls.find(([,opt])=>opt.method==='PUT')![1].body);
  expect(reconcile.items).toEqual([]);
  expect(reconcile.retained_ids).toHaveLength(600);
 });
 it('does not expose the internal signed-input route to unauthenticated callers',async()=>{
  for(const method of ['GET','PUT']){
   const r=await worker.fetch(new Request('https://control.example/v1/intelligence-inputs/automated',{method}),{});
   expect(r.status).toBeGreaterThanOrEqual(400);
  }
 });
});


it('publishes only allowlisted automation failure codes, never raw exception detail',()=>{
 expect(safeAutomatedInputPublicationFailure(new Error('AUTOMATED_INPUT_REMOTE_HTTP_400_AUTOMATED_INPUT_SIGNATURE_INVALID')))
  .toBe('AUTOMATED_INPUT_REMOTE_HTTP_400_AUTOMATED_INPUT_SIGNATURE_INVALID');
 expect(safeAutomatedInputPublicationFailure(new Error('private source article URL and signing key')))
  .toBe('AUTOMATED_INPUT_UNCLASSIFIED_SIGNER_OR_TRANSPORT_FAILURE');
 expect(safeAutomatedInputPublicationFailure(new Error('Risk Object signing private key is not configured')))
  .toBe('AUTOMATED_INPUT_UNCLASSIFIED_SIGNER_OR_TRANSPORT_FAILURE');
});
