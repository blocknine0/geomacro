import {automatedInputId,verifyAutomatedInput,type AutomatedInputEnvelope} from '../../../src/lib/automated-intelligence-input.ts';
const PREFIX='automated_input_v1:';
type Env={DB:any;AUTOMATED_FINDS_VERIFY_KEYS_JSON?:string};
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const keys=(env:Env)=>JSON.parse(env.AUTOMATED_FINDS_VERIFY_KEYS_JSON||'{}');
export async function putAutomatedInputs(env:Env,body:{schema:string;items:AutomatedInputEnvelope[]},now=Date.now()){
 try{
  if(!body||Object.keys(body).sort().join(',')!=='items,schema'||
   body.schema!=='geomacro.automated-intelligence-input-batch.v1'||!Array.isArray(body.items)||
   body.items.length<1||body.items.length>40)throw Error('SHAPE');
  const registry=keys(env),unique=new Map<string,AutomatedInputEnvelope>();
  for(const e of body.items){await verifyAutomatedInput(e,registry,now);unique.set(await automatedInputId(e.payload.signal),e);}
  const statements=[...unique].map(([id,e])=>env.DB.prepare(`INSERT INTO control_state(key,value_json,version,updated_at)
   VALUES (?,?,1,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,
   version=control_state.version+1,updated_at=excluded.updated_at
   WHERE json_extract(control_state.value_json,'$.integrity.signing_key_id')!=
    json_extract(excluded.value_json,'$.integrity.signing_key_id') AND excluded.updated_at>control_state.updated_at`)
   .bind(PREFIX+id,JSON.stringify(e),e.payload.generated_at));
  statements.push(env.DB.prepare("DELETE FROM control_state WHERE key GLOB ? AND json_extract(value_json,'$.payload.expires_at')<=?")
   .bind(PREFIX+'*',new Date(now).toISOString()));
  // Same retained capacity as the existing public journal; expire by native
  // source time, never by signing time. One bounded atomic D1 batch per 40.
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
 }catch{return json({ok:false,error:'AUTOMATED_INPUT_NOT_ACCEPTED'},400);}
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
