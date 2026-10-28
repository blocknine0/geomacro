/**
 * Only CONTROL_PLANE_TOKEN authenticated routes call these functions.
 * Existing D1 control_state stores compact domain-separated scores; no new
 * database, PREDGE read/write, source lookup or signed GRI promotion.
 */
import {automatedInputId,verifyAutomatedInput,
 type AutomatedInputEnvelope} from "../../../src/lib/automated-intelligence-input.ts";
import {verifyInternalNewsScore,
 type InternalNewsScoreEnvelope} from "../../../src/lib/internal-news-scoring.ts";
const PREFIX="internal_signed_news_score_v1:";
const SOURCE_PREFIX="automated_input_v1:";
const HASH=/^[a-f0-9]{64}$/u;
type Env={DB:any;AUTOMATED_FINDS_VERIFY_KEYS_JSON?:string};
const json=(value:unknown,status=200)=>Response.json(value,{status,
 headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
const keys=(env:Env)=>JSON.parse(env.AUTOMATED_FINDS_VERIFY_KEYS_JSON||"{}");
const exact=(actual:unknown,expected:string[])=>
 !!actual&&typeof actual==="object"&&!Array.isArray(actual)&&
 Object.keys(actual).sort().join(",")===expected.slice().sort().join(",");

export async function putInternalNewsScores(env:Env,body:{
 schema:string;retained_ids:string[];items:InternalNewsScoreEnvelope[]
},now=Date.now()){
 try{
  if(!exact(body,["schema","retained_ids","items"])||
   body.schema!=="geomacro.internal-signed-news-score-batch.v1"||
   !Array.isArray(body.retained_ids)||body.retained_ids.length>600||
   body.retained_ids.some(id=>typeof id!=="string"||!HASH.test(id))||
   new Set(body.retained_ids).size!==body.retained_ids.length||
   !Array.isArray(body.items)||body.items.length>40)
   throw Error("SCORE_BATCH_INVALID");
  const registry=keys(env),wanted=new Set(body.retained_ids);
  // Check the complete exact-current issuer input index; never accept a
  // caller-supplied truncated retained set that would delete signed scores.
  const index=await env.DB.prepare("SELECT key FROM control_state WHERE key GLOB ? AND json_extract(value_json,'$.payload.expires_at')>? ORDER BY key LIMIT 601")
    .bind(SOURCE_PREFIX+"*",new Date(now).toISOString()).all();
  if(index.success===false||!Array.isArray(index.results)||index.results.length>600)
   throw Error("SCORE_SOURCE_INDEX_UNAVAILABLE");
  const sourceIds=index.results.map((row:any)=>String(row.key).slice(SOURCE_PREFIX.length));
  if(sourceIds.some((id:string)=>!HASH.test(id))||
    sourceIds.length!==wanted.size||sourceIds.some((id:string)=>!wanted.has(id)))
   throw Error("SCORE_RETAINED_SOURCE_INDEX_MISMATCH");
  const ids=body.items.map(e=>e?.payload?.input_id);
  if(ids.some(id=>typeof id!=="string"||!HASH.test(id)||!wanted.has(id))||
    new Set(ids).size!==ids.length)throw Error("SCORE_BATCH_DUPLICATE_OR_ORPHAN");
  const originals=new Map<string,AutomatedInputEnvelope>();
  if(ids.length){
   const source=await env.DB.prepare("SELECT key,value_json FROM control_state WHERE key IN ("+
     ids.map(()=>"?").join(",")+")")
    .bind(...ids.map(id=>SOURCE_PREFIX+id)).all();
   if(source.success===false||!Array.isArray(source.results)||source.results.length!==ids.length)
    throw Error("SCORE_SOURCE_NOT_SIGNED");
   for(const row of source.results){
    const sourceEnvelope=JSON.parse(row.value_json);
    await verifyAutomatedInput(sourceEnvelope,registry,now);
    const id=await automatedInputId(sourceEnvelope.payload.signal);
    if(row.key!==SOURCE_PREFIX+id||originals.has(id))throw Error("SCORE_SOURCE_IDENTITY_INVALID");
    originals.set(id,sourceEnvelope);
   }
  }
  const accepted:string[]=[];
  for(const e of body.items){
   const id=e.payload.input_id,original=originals.get(id);
   if(!original)throw Error("SCORE_SOURCE_NOT_SIGNED");
   await verifyInternalNewsScore(e,registry,now,original.payload.signal);
   // Both issuer signatures independently verify against governed keys.
   // Normal key rotation may change the active issuer between those events.
   accepted.push(id);
  }
  // One bounded atomic batch: prune orphan IDs, insert absent scores, prune
  // expirations. Retries do not re-write previously persisted signed bytes.
  const statements=[env.DB.prepare("DELETE FROM control_state WHERE key GLOB ? AND key NOT IN (SELECT ? || value FROM json_each(?))")
    .bind(PREFIX+"*",PREFIX,JSON.stringify(body.retained_ids)),
   ...body.items.map(e=>env.DB.prepare("INSERT INTO control_state(key,value_json,version,updated_at) VALUES(?,?,1,?) ON CONFLICT(key) DO NOTHING")
     .bind(PREFIX+e.payload.input_id,JSON.stringify(e),e.payload.generated_at)),
   env.DB.prepare("DELETE FROM control_state WHERE key GLOB ? AND json_extract(value_json,'$.payload.expires_at')<=?")
     .bind(PREFIX+"*",new Date(now).toISOString())];
  const writes=await env.DB.batch(statements);
  if(writes.some((r:any)=>r.success===false))throw Error("SCORE_STORE_FAILURE");
  return json({ok:true,schema:"geomacro.internal-signed-news-score-ack.v1",
   accepted_ids:accepted,retained_sources_matched:true,
   newly_inserted:writes.slice(1,1+body.items.length).reduce((n:number,r:any)=>
    n+Number(r.meta?.changes??0),0),
   private_only:true,independent_reviewed:false,
   current_gri_updated:false,customer_eligible:false,payments:0});
 }catch(error){
  const code=error instanceof Error?error.message:"";
  return json({ok:false,error:"INTERNAL_NEWS_SCORE_NOT_ACCEPTED",
   reason_code:/^(?:SCORE_[A-Z0-9_]+|INTERNAL_NEWS_SCORE_[A-Z0-9_]+|AUTOMATED_INPUT_[A-Z0-9_]+)$/.test(code)
    ?code:"SCORE_UNKNOWN_VERIFICATION_FAILURE"},400);
 }
}
export async function getInternalNewsScores(env:Env,params:URLSearchParams,now=Date.now()){
 const view=params.get("view"),offset=Number(params.get("offset")??0);
 if([...params.keys()].some(k=>!["view","offset"].includes(k))||
  (view!==null&&view!=="ids")||params.getAll("view").length>1||
  params.getAll("offset").length>1||!Number.isSafeInteger(offset)||
  offset<0||offset>600||view!==null&&params.has("offset"))
  return json({ok:false,error:"SCORE_QUERY_INVALID"},400);
 try{
  const indexed=view==="ids";
  const result=await env.DB.prepare("SELECT "+(indexed?"key":"key,value_json")+
   " FROM control_state WHERE key GLOB ? AND json_extract(value_json,'$.payload.expires_at')>? ORDER BY key LIMIT ? OFFSET ?")
   .bind(PREFIX+"*",new Date(now).toISOString(),indexed?601:40,indexed?0:offset).all();
  if(result.success===false||!Array.isArray(result.results)||
    indexed&&result.results.length>600)throw Error("SCORE_READ_INVALID");
  const out:InternalNewsScoreEnvelope[]=[],ids:string[]=[],registry=keys(env);
  for(const row of result.results){
   const id=String(row.key).slice(PREFIX.length);
   if(!HASH.test(id)||row.key!==PREFIX+id)throw Error("SCORE_ROW_ID_INVALID");
   ids.push(id);
   if(!indexed){
    const e=JSON.parse(row.value_json) as InternalNewsScoreEnvelope;
    if(e.payload.input_id!==id)throw Error("SCORE_ROW_ID_INVALID");
    await verifyInternalNewsScore(e,registry,now);
    out.push(e);
   }
  }
  return json({ok:true,schema:"geomacro.internal-signed-news-score-feed.v1",
   ...(indexed?{ids}:{items:out,offset,next_offset:out.length===40&&offset+40<600?offset+40:null}),
   internal_only:true,scored:true,score_kind:"RESEARCH_TRIAGE_PRIORITY",
   independent_reviewed:false,current_signed_gri_verified:false,customer_eligible:false});
 }catch{return json({ok:false,error:"SCORE_READBACK_NOT_VERIFIED"},503);}
}
