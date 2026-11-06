import {createHash} from "node:crypto";
export const digestManifest=rows=>createHash("sha256").update(JSON.stringify(
 [...rows].sort((a,b)=>a.batch_id.localeCompare(b.batch_id)).map(r=>
 [r.batch_id,r.b2_uri,r.b2_object_sha256,r.item_count]))).digest("hex");
export function currentParityReceipt(b,{census,origin,head,run,now=Date.now()}){
 return b?.schema==="geomacro.hot50-storage-readback.v1"&&b.status==="PASS"&&
 b.control_plane_origin===origin&&b.head_sha===head&&b.run_id===run&&
 /^[a-f0-9]{40}$/.test(head??"")&&typeof run==="string"&&run.length>0&&
 Number.isFinite(Date.parse(b.checked_at))&&now-Date.parse(b.checked_at)>=0&&
 now-Date.parse(b.checked_at)<=600000&&
 b.coverage_scope==="ARCHIVED_ENCRYPTED_P0B_OUTBOX_BATCHES"&&
 b.stable_d1_manifest_verified===true&&/^[a-f0-9]{64}$/.test(b.d1_manifest_sha256??"")&&
 b.independent_s3_get_sha256_aes_gcm_restoration===true&&
 b.d1_indexed_b2_readback_verified===true&&
 b.physical_bucket_list_complete===false&&b.bidirectional_parity_pass===false&&
 b.checked_archived_bundles>0&&b.pending_outbox_batches===0&&
 census?.backlog?.outbox===0&&b.checked_archived_bundles===b.d1_archived&&
 b.d1_archived===census?.backlog?.archived_outboxes&&
 census?.backlog?.exact_bundle_journal_mismatch===0;
}
