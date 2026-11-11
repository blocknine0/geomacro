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
 // A D1-indexed GET verifies only objects known to D1; it cannot prove
 // absence of unindexed B2 objects or full bidirectional parity.
 b.physical_bucket_list_complete===true&&b.bidirectional_parity_pass===true&&
 b.namespace_set_equality_verified===true&&b.unindexed_b2_objects_enumerated===true&&
 b.stable_b2_manifest_verified===true&&
 /^[a-f0-9]{64}$/.test(b.b2_manifest_sha256??"")&&
 b.checked_archived_bundles>0&&b.pending_outbox_batches===0&&
 census?.backlog?.outbox===0&&b.checked_archived_bundles===b.d1_archived&&
 b.d1_archived===census?.backlog?.archived_outboxes&&
 census?.backlog?.exact_bundle_journal_mismatch===0;
}
