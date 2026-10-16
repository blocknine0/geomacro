import {createHash} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
import {canonicalJson} from "./canonical-json";
import {signAutomatedFindsBatch} from "./risk-object-signing.server";
import {FINDS_B2_KEY,FINDS_CATEGORIES,FINDS_MAX_AGE_MS,type AutomatedFindsSnapshot} from "./automated-finds-contract";
import type {StatelessIntelligenceResult} from "./stateless-public-intelligence.server";

export async function publishAutomatedFinds({reports,archive,promote,now=new Date(),
  runId=process.env.GITHUB_RUN_ID??"",sourceSha=process.env.GITHUB_SHA??"",sign=signAutomatedFindsBatch,lastArchiveAt=null,lastArchiveVerified=false,
}: {reports:StatelessIntelligenceResult[];archive:{putWithMetadataVerification:Function};
  promote:(body:unknown)=>Promise<void>;now?:Date;runId?:string;sourceSha?:string;sign?:typeof signAutomatedFindsBatch;lastArchiveAt?:string|null;lastArchiveVerified?:boolean}) {
  if(reports.length!==3||new Set(reports.map(r=>r.category)).size!==3)
    throw Error("AUTOMATED_FINDS_THREE_CATEGORY_READS_REQUIRED");
  const at=now.getTime();
  const snapshot:AutomatedFindsSnapshot={schema:"geomacro.automated-finds-snapshot.v1",batches:[]};
  for(const category of FINDS_CATEGORIES){
    const r=reports.find(r=>r.category===category)!;
    const readAt=Date.parse(r.checked_at);
    if(!Number.isFinite(readAt)||readAt>at||at-readAt>10*60_000||r.healthy_feed_count<1)
      throw Error("AUTOMATED_FINDS_CURRENT_SOURCE_READ_REQUIRED");
    snapshot.batches.push(await sign({schema:"geomacro.automated-finds.v1",category,
      generated_at:now.toISOString(),source_run_id:runId,source_sha:sourceSha,
      source_verification:"publisher_native_release",independent_reviewed:false,scored:false,
      chargeable:false,delivery_scope:"free_website_only",original_release_delay_minutes:15,retention_days:30,
      healthy_feed_count:r.healthy_feed_count,feed_count:r.feed_count,
      // Leave a full snapshot lifetime before the rolling 30d expiry. This
      // never changes an original timestamp or expands the current window.
      signals:r.signals.filter(s=>Date.parse(s.published_at)>=at-30*86_400_000+FINDS_MAX_AGE_MS).slice(0,50),
    }));
  }
  const canonical=canonicalJson(snapshot);
  if(Buffer.byteLength(canonical)>256_000)throw Error("AUTOMATED_FINDS_BATCH_TOO_LARGE");
  const hash=(b:Uint8Array|string)=>createHash("sha256").update(b).digest("hex");
  let archiveProof:null|{b2_object_key:string;compressed_sha256:string;payload_sha256:string;
    full_b2_readback_verified:true;exact_gzip_restore_verified:true}=null;
  let archiveStatus=lastArchiveVerified?"CADENCE_HELD":"BACKUP_BACKOFF_HELD";
  const prior=Date.parse(lastArchiveAt??"");
  // The shared account allows only 25 GET/day across ALL producers. D1 is
  // durable current storage; B2 is a six-hour verified backup for this free
  // product. Never label an older backup as the current batch's B2 proof.
  if(!Number.isFinite(prior)||prior>at||at-prior>=6*60*60_000){
  try{
    const packed=gzipSync(Buffer.from(canonical));
    let restored=false;
    const proof=await archive.putWithMetadataVerification(FINDS_B2_KEY,packed,{
    verifyRestored:(bytes:Uint8Array)=>{
      if(!Buffer.from(bytes).equals(packed)||gunzipSync(bytes,{maxOutputLength:256_000}).toString("utf8")!==canonical)
        throw Error("AUTOMATED_FINDS_EXACT_RESTORE_REQUIRED");
      restored=true;
    },
    });
    if(!restored||proof.full_body_readback_verified!==true||proof.sha256!==hash(packed))
      throw Error("AUTOMATED_FINDS_B2_READBACK_REQUIRED");
    archiveProof={b2_object_key:FINDS_B2_KEY,compressed_sha256:hash(packed),payload_sha256:hash(canonical),
      full_b2_readback_verified:true,exact_gzip_restore_verified:true};
    archiveStatus="CURRENT_BATCH_VERIFIED";
  }catch{archiveStatus="BACKUP_FAILED_CURRENT_D1_ONLY";}
  }
  await promote({snapshot,proof:archiveProof,archive_attempted:["CURRENT_BATCH_VERIFIED","BACKUP_FAILED_CURRENT_D1_ONLY"].includes(archiveStatus)});
  return {schema:"geomacro.automated-finds-publication-receipt.v1",signed_categories:3,
    category_counts:snapshot.batches.map(e=>({category:e.payload.category,total:e.payload.signals.length,
      current_24h:e.payload.signals.filter(s=>Date.parse(s.published_at)>=at-86_400_000).length})),
    archive_status:archiveStatus,full_b2_readback_verified:archiveProof!==null,
    exact_gzip_restore_verified:archiveProof!==null,d1_exact_readback_verified:true,
    independent_reviewed:false,scored:false,chargeable:false,supabase_requests:0,payments:0};
}
