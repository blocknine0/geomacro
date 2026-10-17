import { canonicalJson } from "../../../src/lib/canonical-json.ts";
import { FINDS_B2_KEY, verifyAutomatedFindsSnapshot, type AutomatedFindsSnapshot } from "../../../src/lib/automated-finds-contract.ts";

const SLOT="automated_finds_signed_v1";
const json=(value: unknown,status=200)=>Response.json(value,{status,headers:{
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Access-Control-Allow-Origin":"*",
}});
const sha=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,"0")).join("");
type Proof={b2_object_key:string;compressed_sha256:string;payload_sha256:string;
  full_b2_readback_verified:true;exact_gzip_restore_verified:true};
type Checkpoint={generated_at:string;payload_sha256:string;compressed_sha256:string};
type Stored={snapshot:AutomatedFindsSnapshot;proof:Proof|null;archive_attempted:boolean;
  archive_checkpoint?:Checkpoint|null;archive_last_attempt_at?:string|null};
// The same existing DB binding and bounded single control_state slot. No raw
// original, article URL, source identity, database mirror or separate engine.
type Env={DB:any;AUTOMATED_FINDS_VERIFY_KEYS_JSON?:string};
async function check(body:Stored,env:Env,now:number){
  const keys=JSON.parse(env.AUTOMATED_FINDS_VERIFY_KEYS_JSON||"{}");
  await verifyAutomatedFindsSnapshot(body.snapshot,keys,now);
  const p=body.proof;
  if(Object.keys(body).some(k=>!["proof","snapshot","archive_attempted","archive_checkpoint","archive_last_attempt_at"].includes(k)) ||
     typeof body.archive_attempted!=="boolean" || (p!==null&&body.archive_attempted!==true) ||
     !("proof" in body))throw Error("AUTOMATED_FINDS_ARCHIVE_PROOF_INVALID");
  const generated=body.snapshot.batches[0].payload.generated_at;
  const validTime=(s:string)=>Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s&&s<=generated;
  if(body.archive_last_attempt_at!==undefined&&body.archive_last_attempt_at!==null&&!validTime(body.archive_last_attempt_at))
    throw Error("AUTOMATED_FINDS_ARCHIVE_METADATA_INVALID");
  const c=body.archive_checkpoint;
  if(c && (Object.keys(c).sort().join(",")!=="compressed_sha256,generated_at,payload_sha256" ||
    !validTime(c.generated_at)||!body.archive_last_attempt_at||c.generated_at>body.archive_last_attempt_at||
    !/^[a-f0-9]{64}$/.test(c.payload_sha256)||!/^[a-f0-9]{64}$/.test(c.compressed_sha256)))
    throw Error("AUTOMATED_FINDS_ARCHIVE_METADATA_INVALID");
  if(p===null)return;
  if(!p ||
     Object.keys(p).sort().join(",")!=="b2_object_key,compressed_sha256,exact_gzip_restore_verified,full_b2_readback_verified,payload_sha256" ||
     p.b2_object_key!==FINDS_B2_KEY || !/^[a-f0-9]{64}$/.test(p.compressed_sha256) ||
     p.payload_sha256!==await sha(canonicalJson(body.snapshot)) ||
     p.full_b2_readback_verified!==true || p.exact_gzip_restore_verified!==true)
    throw Error("AUTOMATED_FINDS_ARCHIVE_PROOF_INVALID");
}
export async function putAutomatedFinds(env:Env,body:Stored,now=Date.now()){
  if(Object.keys(body).sort().join(",")!=="archive_attempted,proof,snapshot")return json({ok:false,error:"AUTOMATED_FINDS_INPUT_INVALID"},400);
  try{await check(body,env,now);}catch{return json({ok:false,error:"AUTOMATED_FINDS_SIGNED_ARCHIVE_REQUIRED"},400);}
  try{
    const generated=body.snapshot.batches[0].payload.generated_at;
    const oldRow=await env.DB.prepare("SELECT value_json FROM control_state WHERE key=? LIMIT 1").bind(SLOT).first();
    let old=null;
    try{old=oldRow?.value_json?JSON.parse(oldRow.value_json):null;}catch{/* Valid new signed data can replace a malformed old row. */}
    let checkpoint:Checkpoint|null=null;
    if(body.proof)checkpoint={generated_at:generated,payload_sha256:body.proof.payload_sha256,
      compressed_sha256:body.proof.compressed_sha256};
    else{
      checkpoint=old?.archive_checkpoint??null;
    }
    // Atomic ordering rejects stale runs, including equal-time altered bytes.
    const encoded=canonicalJson({...body,archive_checkpoint:checkpoint,
      archive_last_attempt_at:body.archive_attempted?generated:old?.archive_last_attempt_at??null});
    const result=await env.DB.prepare(`INSERT INTO control_state (key,value_json,version,updated_at)
      VALUES (?,?,1,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,
      version=control_state.version+1,updated_at=excluded.updated_at
      WHERE excluded.updated_at>control_state.updated_at OR
        (excluded.updated_at=control_state.updated_at AND excluded.value_json=control_state.value_json)`)
      .bind(SLOT,encoded,generated).run();
    if(result.meta?.changes!==1)return json({ok:false,error:"AUTOMATED_FINDS_REPLAY_OR_OLDER_BATCH"},409);
    return json({ok:true,payload_sha256:await sha(canonicalJson(body.snapshot)),full_b2_readback_verified:body.proof!==null,
      exact_gzip_restore_verified:body.proof!==null,signed_category_count:3,chargeable:false});
  }catch{return json({ok:false,error:"AUTOMATED_FINDS_D1_WRITE_UNAVAILABLE"},503);}
}
export async function getAutomatedFinds(env:Env,category:string|null=null,now=Date.now()){
  if(category!==null&&!["geopolitics","macro","rare_earth"].includes(category))
    return json({ok:false,error:"AUTOMATED_FINDS_CATEGORY_INVALID"},400);
  try{
    const row=await env.DB.prepare("SELECT value_json FROM control_state WHERE key=? LIMIT 1").bind(SLOT).first();
    if(!row?.value_json)throw Error("EMPTY");
    const body=JSON.parse(row.value_json) as Stored;
    await check(body,env,now);
    const batches=body.snapshot.batches.filter(e=>category===null||e.payload.category===category);
    const categories=batches.map(e=>({category:e.payload.category,
      current_24h_count:e.payload.signals.filter(s=>Date.parse(s.published_at)>=now-86_400_000).length,
      latest_original_at:e.payload.signals.map(s=>s.published_at).sort().at(-1)??null}));
    return json({ok:true,schema:"geomacro.automated-finds-feed.v1",checked_at:new Date(now).toISOString(),
      authenticity:"geomacro_issuer_signature",independent_reviewed:false,scored:false,chargeable:false,
      supabase_dependency:false,full_b2_readback_verified:body.proof!==null,exact_gzip_restore_verified:body.proof!==null,
      archive_checkpoint:body.archive_checkpoint?{
        generated_at:body.archive_checkpoint.generated_at,payload_sha256:body.archive_checkpoint.payload_sha256,
        compressed_sha256:body.archive_checkpoint.compressed_sha256}:null,
      archive_last_attempt_at:body.archive_last_attempt_at??null,
      // Batch signatures remain intact under category filtering. Freshness is
      // derived from original dates at read time, never the signature time.
      categories,batches});
  }catch{return json({ok:false,error:"AUTOMATED_FINDS_CURRENT_SIGNED_BATCH_UNAVAILABLE",
    independent_reviewed:false,chargeable:false},503);}
}
