/** Root-authenticated exact batch reader for PRIVATE Node export/audit jobs.
 * The Worker is the only authority allowed to retrieve immutable legacy D1
 * raw_json or read private R2 object references. Never use this on public
 * pages, partner products, customer requests or frontend bundles.
 */
import {createHmac} from "node:crypto";
import {validPrivateRawNews}
 from "../../workers/control-plane/src/phase2h-private-raw-news.mjs";
const ORIGIN="https://geomacro-control-plane.daspallab202391.workers.dev";
const SHA=/^[a-f0-9]{64}$/u;
const err=x=>{throw Error("PHASE2H_PROTECTED_BATCH_"+x)};
export async function readVerifiedPhase2hWorkerBatch(recordIds,{
 env=process.env,fetchImpl=fetch,now=Date.now(),requireB2Archive=false
}={}){
 if(!Array.isArray(recordIds)||recordIds.length<1||
    recordIds.length>50||recordIds.some(x=>!SHA.test(x))||
    new Set(recordIds).size!==recordIds.length||
    !Number.isFinite(now))
  err("ID_SCOPE_INVALID");
 const root=String(env?.GEOMACRO_COMMERCE_LEDGER_TOKEN??"");
 if(root.length<32)err("OWNER_AUTH_MISSING");
 const token=createHmac("sha256",root)
  .update("geomacro-control-plane-v1").digest("hex");
 const res=await fetchImpl(ORIGIN+"/v1/internal/phase2h-raw-object-ref/batch",{
  method:"POST",redirect:"error",cache:"no-store",
  headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",
   "Cache-Control":"no-store"},
  body:JSON.stringify({
   schema:"geomacro.phase2h.private-reference-batch-read.v1",
   record_ids:recordIds
  }),signal:AbortSignal.timeout(15000)
 });
 if(!res||res.status!==200||res.redirected||
    Number(res.headers?.get?.("content-length")??0)>650000)
  err("REMOTE_WORKER_UNAVAILABLE");
 const raw=await res.text();
 if(Buffer.byteLength(raw,"utf8")>650000)err("REMOTE_BODY_TOO_LARGE");
 let doc;try{doc=JSON.parse(raw)}catch{err("REMOTE_JSON_INVALID")}
 if(doc?.ok!==true||
    doc.schema!=="geomacro.phase2h.private-verified-batch-originals.v1"||
    doc.record_count!==recordIds.length||!Array.isArray(doc.rows)||
    doc.rows.length!==recordIds.length||doc.paid_eligible!==false||
    doc.raw_public_delivery!==false||doc.commercial_rights_verified!==false)
  err("PROTECTED_CONTRACT_INVALID");
 for(let i=0;i<recordIds.length;i++){
  const row=doc.rows[i];
  if(row?.record_id!==recordIds[i]||row.record?.record_id!==row.record_id||
     row.record?.raw_sha256!==row.raw_sha256||
     row.record?.category!==row.category||
     row.record?.ingested_at!==row.first_ingested_at||
     row.record?.original?.original_published_at!==row.original_published_at||
     !["PRIVATE_R2_SHA256_HMAC_VERIFIED","LEGACY_D1_VALIDATED"]
       .includes(row.storage_proof))
    err("METADATA_DIVERGED");
  if(await validPrivateRawNews(row.record,now,false)!==JSON.stringify(row.record))
    err("IMMUTABLE_RECORD_INVALID");
  if(requireB2Archive&&(
     row.independently_archived_to_b2!==true||
     !SHA.test(row.b2_object_sha256)||
     typeof row.b2_archived_at!=="string"||
     !Number.isFinite(Date.parse(row.b2_archived_at))))
    err("INDEPENDENT_B2_ARCHIVE_ACK_REQUIRED");
 }
 return doc.rows;
}
