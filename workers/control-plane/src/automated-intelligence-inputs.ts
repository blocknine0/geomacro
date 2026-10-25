import {automatedInputId,verifyAutomatedInput,type AutomatedInputEnvelope} from '../../../src/lib/automated-intelligence-input.ts';
import {checkedDerivedNews} from '../../../src/lib/public-derived-news-client.ts';
const PREFIX='automated_input_v1:';
type Env={DB:any;AUTOMATED_FINDS_VERIFY_KEYS_JSON?:string};
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const keys=(env:Env)=>JSON.parse(env.AUTOMATED_FINDS_VERIFY_KEYS_JSON||'{}');
async function currentJournalInputIds(env:Env,now:number):Promise<Set<string>>{
 const result=await env.DB.prepare(
  "SELECT id, story_json FROM website_derived_intelligence WHERE published_at>=? AND first_seen_at>=? ORDER BY published_at DESC,id DESC LIMIT 600"
 ).bind(new Date(now-72*3600_000).toISOString().slice(0,10),
  new Date(now-72*3600_000).toISOString()).all();
 if(result.success===false||!Array.isArray(result.results)||result.results.length>600)
  throw Error('AUTOMATED_INPUT_CURRENT_JOURNAL_UNAVAILABLE');
 const ids=new Set<string>();
 for(const row of result.results){
  let signal:any;
  try{signal=JSON.parse(row.story_json);}catch{continue;}
  const checked=checkedDerivedNews({
   ok:true,schema:'geomacro.website-derived-news-feed.v1',
   original_release_delay_minutes:0,retention_days:3,retention_hours:72,
   delivery_scope:'free_website_only',signals:[signal],
  },now);
  if(checked.length!==1||checked[0].id!==row.id)continue;
  ids.add(await automatedInputId(checked[0]));
 }
 return ids;
}
export async function putAutomatedInputs(env:Env,body:{schema:string;items:AutomatedInputEnvelope[]},now=Date.now()){
 try{
  if(!body||Object.keys(body).sort().join(',')!=='items,schema'||
   body.schema!=='geomacro.automated-intelligence-input-batch.v1'||!Array.isArray(body.items)||
   body.items.length<1||body.items.length>40)throw Error('SHAPE');
  const registry=keys(env),unique=new Map<string,AutomatedInputEnvelope>();
  const currentIds=await currentJournalInputIds(env,now);
  for(const e of body.items){
   await verifyAutomatedInput(e,registry,now);
   const id=await automatedInputId(e.payload.signal);
   if(!currentIds.has(id))throw Error('AUTOMATED_INPUT_NOT_CURRENT_DERIVED_ROW');
   unique.set(id,e);
  }
  // The journal replaces an item when its content is revised, while signed
  // input identity is content-hash based. Remove superseded signatures before
  // inserting current ones, so old revisions cannot crowd out current IDs.
  const index=await env.DB.prepare("SELECT key FROM control_state WHERE key GLOB ? LIMIT 1000")
   .bind(PREFIX+'*').all();
  if(index.success===false||!Array.isArray(index.results)||index.results.length>=1000)
   throw Error('AUTOMATED_INPUT_STORED_INDEX_UNAVAILABLE');
  const staleKeys=index.results.map((r:any)=>String(r.key)).filter((key:string)=>
   key.startsWith(PREFIX)&&!currentIds.has(key.slice(PREFIX.length)));
  const statements:any[]=[];
  for(let i=0;i<staleKeys.length;i+=80){
   const chunk=staleKeys.slice(i,i+80);
   if(chunk.length)statements.push(env.DB.prepare(
    "DELETE FROM control_state WHERE key IN ("+chunk.map(()=>"?").join(",")+")"
   ).bind(...chunk));
  }
  statements.push(...[...unique].map(([id,e])=>env.DB.prepare(`INSERT INTO control_state(key,value_json,version,updated_at)
   VALUES (?,?,1,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,
   version=control_state.version+1,updated_at=excluded.updated_at
   WHERE json_extract(control_state.value_json,'$.integrity.signing_key_id')!=
    json_extract(excluded.value_json,'$.integrity.signing_key_id') AND excluded.updated_at>control_state.updated_at`)
   .bind(PREFIX+id,JSON.stringify(e),e.payload.generated_at)));
  statements.push(env.DB.prepare("DELETE FROM control_state WHERE key GLOB ? AND json_extract(value_json,'$.payload.expires_at')<=?")
   .bind(PREFIX+'*',new Date(now).toISOString()));
  // The signed-input store remains a projection of current retained D1 rows,
  // with the same bounded 600-record cap and no archive of obsolete revisions.
  statements.push(env.DB.prepare(`DELETE FROM control_state WHERE key IN
   (SELECT key FROM control_state WHERE key GLOB ? ORDER BY
    json_extract(value_json,'$.payload.signal.published_at') DESC,key LIMIT -1 OFFSET 600)`)
   .bind(PREFIX+'*'));
  const result=await env.DB.batch(statements);
  if(result.some((r:any)=>r.success===false))throw Error('WRITE');
  return json({ok:true,schema:'geomacro.automated-intelligence-input-ack.v1',
   accepted_ids:[...unique.keys()],unique_inputs:unique.size,
   inserted_or_resigned:result.slice(0,unique.size).reduce((n:number,r:any)=>n+Number(r.meta?.changes??0),0),
   manual_approval_required:false,independent_reviewed:false,commercial_rights_attested:false});
 }catch(error){
  // Authenticated admin endpoint only. Publish a narrow allowlisted reason code
  // without returning exception text, payloads, signatures, keys or stored bytes.
  const message=error instanceof Error?error.message:'';
  const reason_code=/^(?:SHAPE|WRITE|AUTOMATED_INPUT_[A-Z0-9_]{1,72})$/u.test(message)
   ?message:'UNCLASSIFIED_VALIDATION_OR_STORE_FAILURE';
  return json({ok:false,error:'AUTOMATED_INPUT_NOT_ACCEPTED',reason_code},400);
 }
}
export async function getAutomatedInputs(env:Env,params:URLSearchParams,now=Date.now()){
 const view=params.get('view'),offset=Number(params.get('offset')??0);
 if([...params.keys()].some(k=>!['view','offset'].includes(k))||
  (view!==null&&!['ids','handoff-ids'].includes(view))||!Number.isSafeInteger(offset)||offset<0||offset>600||
  params.getAll('view').length>1||params.getAll('offset').length>1||view!==null&&params.has('offset'))
  return json({ok:false,error:'AUTOMATED_INPUT_QUERY_INVALID'},400);
 try{
  const index=view!==null,limit=index?600:40;
  const fields=index?"key,json_extract(value_json,'$.integrity.signing_key_id') AS signing_key_id,json_extract(value_json,'$.payload.signal.id') AS signal_id":'key,value_json';
  const r=await env.DB.prepare(`SELECT ${fields} FROM control_state WHERE key GLOB ?
   AND json_extract(value_json,'$.payload.expires_at')>? ORDER BY key LIMIT ? OFFSET ?`)
   .bind(PREFIX+'*',new Date(now).toISOString(),limit,offset).all();
  if(r.success===false||!Array.isArray(r.results))throw Error('READ');
  const registry=keys(env),items:AutomatedInputEnvelope[]=[],ids:string[]=[],handoffs:{input_id:string;signal_id:string}[]=[];
  for(const row of r.results){
   // Index reads avoid up to 600 crypto operations per five-minute run.
   // Each stored input passed signature verification at PUT; consumers verify
   // actual envelopes through bounded 40-item reads, not this ID inventory.
   if(index){
    const raw=Object.prototype.hasOwnProperty.call(registry,row.signing_key_id)?registry[row.signing_key_id]:null;
    if(!raw||typeof raw!=='string'&&![undefined,'active','retired'].includes(raw.status))continue;
    const id=String(row.key).slice(PREFIX.length);
    if(!String(row.key).startsWith(PREFIX)||!/^[a-f0-9]{64}$/.test(id))throw Error('IDENTITY');
    ids.push(id);
    if(view==='handoff-ids'){
     if(typeof row.signal_id!=='string'||!/^(geopolitics|macro|rare_earth)-[a-f0-9]{8}$/.test(row.signal_id))throw Error('IDENTITY');
     handoffs.push({input_id:id,signal_id:row.signal_id});
    }
    continue;
   }
   const e=JSON.parse(row.value_json);await verifyAutomatedInput(e,registry,now);
   const id=await automatedInputId(e.payload.signal);
   if(row.key!==PREFIX+id)throw Error('IDENTITY');
   ids.push(id);if(view!=='ids')items.push(e);
  }
  return json({ok:true,schema:'geomacro.automated-intelligence-input-feed.v1',
   ...(view==='ids'?{ids}:view==='handoff-ids'?{handoffs}:{items,offset,next_offset:r.results.length===40&&offset+40<600?offset+40:null}),
   retention_hours:72,retained_capacity:600,manual_approval_required:false,
   verification_scope:index?'ACCEPTED_INPUT_ID_INVENTORY':'ED25519_ENVELOPES',
   independent_reviewed:false,commercial_rights_attested:false,scored:false});
 }catch{return json({ok:false,error:'AUTOMATED_INPUT_READBACK_UNVERIFIED'},503);}
}
