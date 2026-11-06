import {createHash} from "node:crypto";
export const digestManifest=rows=>createHash("sha256").update(JSON.stringify(
 [...rows].sort((a,b)=>a.batch_id.localeCompare(b.batch_id)).map(r=>
 [r.batch_id,r.b2_uri,r.b2_object_sha256,r.item_count]))).digest("hex");
// EncodingType=url means keys cannot smuggle XML elements or entities.
export function parseBucketList(bytes,prefix){
 const xml=Buffer.from(bytes).toString("utf8");
 if(xml.length>2_000_000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error("B2_LIST_XML_INVALID");
 const one=tag=>{const values=[...xml.matchAll(new RegExp("<"+tag+">([^<]*)</"+tag+">","g"))];
   if(values.length!==1)throw Error("B2_LIST_FIELD_INVALID");return values[0][1]};
 if(one("EncodingType")!=="url")throw Error("B2_LIST_ENCODING_INVALID");
 const truncated=one("IsTruncated");
 if(!["true","false"].includes(truncated))throw Error("B2_LIST_TRUNCATION_INVALID");
 const decodeXml=s=>s.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'");
 // EncodingType=url percent-encodes S3 object keys. An XML entity in a
 // Key makes the wire representation ambiguous; fail closed instead of
 // recursively interpreting XML entities and URL escapes.
 const keys=[...xml.matchAll(/<Key>([^<]*)<\/Key>/g)].map(([,encoded])=>{
   if(encoded.includes("&"))throw Error("B2_LIST_KEY_ENTITY_INVALID");
   try{return decodeURIComponent(encoded)}
   catch{throw Error("B2_LIST_KEY_PERCENT_ENCODING_INVALID")}
 });
 if(keys.some(k=>!k.startsWith(prefix))||new Set(keys).size!==keys.length)
   throw Error("B2_LIST_SCOPE_OR_DUPLICATE_INVALID");
 if(Number(one("KeyCount"))!==keys.length)throw Error("B2_LIST_KEYCOUNT_INVALID");
 const cursor=truncated==="true"?decodeXml(one("NextContinuationToken")):null;
 if(truncated==="true"&&!cursor)throw Error("B2_LIST_CURSOR_MISSING");
 return {keys,cursor,complete:truncated==="false"};
}
export function currentParityReceipt(b,{census,origin,head,run,now=Date.now()}){
 return b?.schema==="geomacro.hot50-storage-readback.v1"&&b.status==="PASS"&&
 b.control_plane_origin===origin&&b.head_sha===head&&b.run_id===run&&
 /^[a-f0-9]{40}$/.test(head??"")&&typeof run==="string"&&run.length>0&&
 Number.isFinite(Date.parse(b.checked_at))&&now-Date.parse(b.checked_at)>=0&&
 now-Date.parse(b.checked_at)<=600000&&
 b.stable_b2_manifest_verified===true&&/^[a-f0-9]{64}$/.test(b.b2_manifest_sha256??"")&&
 b.coverage_scope==="ARCHIVED_ENCRYPTED_P0B_OUTBOX_BATCHES"&&
 b.stable_d1_manifest_verified===true&&/^[a-f0-9]{64}$/.test(b.d1_manifest_sha256??"")&&
 b.independent_s3_get_sha256_aes_gcm_restoration===true&&
 b.physical_bucket_list_complete===true&&b.bidirectional_parity_pass===true&&
 b.checked_archived_bundles>0&&b.pending_outbox_batches===0&&
 census?.backlog?.outbox===0&&b.checked_archived_bundles===b.d1_archived&&
 b.d1_archived===census?.backlog?.archived_outboxes&&
 census?.backlog?.exact_bundle_journal_mismatch===0;
}
