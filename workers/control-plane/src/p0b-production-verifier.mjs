/**
 * Protected production acceptance of the latest REAL P0-B candidate:
 * encrypted remote B2 read + AES-GCM/SHA verification and exact D1 pointer.
 * Never synthesizes an item, advances its publication time, or grants rights.
 */
import {B2SpoolManager} from '../../../src/storage/b2-spool-manager.ts';
const privateJson=(body,status=200)=>Response.json(body,{status,headers:{
 'Cache-Control':'private, no-store','X-Robots-Tag':'noindex,nofollow',
 'X-Content-Type-Options':'nosniff'
}});
const sha=/^[a-f0-9]{64}$/u;
export async function verifyLatestP0bCommitted(env,{manager}={}){
 if(env?.GEOMACRO_P0B_ADMISSION_ACTIVE!=='1'||!env?.DB?.prepare)
  return privateJson({ok:false,error:'P0B_NOT_ACTIVATED'},503);
 try{
  const source=await env.DB.prepare(
   'SELECT candidate_sha256,source_id,b2_spool_uri,b2_byte_size,'+
   'd1_committed_at,acked_at FROM ingestion_spool_queue '+
   "WHERE state='D1_COMMITTED' AND acked_at IS NOT NULL "+
   'ORDER BY d1_committed_at DESC LIMIT 1'
  ).first();
  if(!source)
   return privateJson({ok:false,verified:false,error:'P0B_NO_REAL_COMMITTED_CANDIDATE'},409);
  if(!sha.test(source.candidate_sha256??'')||typeof source.source_id!=='string'||
     !source.b2_spool_uri?.startsWith('b2://')||!Number.isSafeInteger(source.b2_byte_size)||
     source.b2_byte_size<1||!source.d1_committed_at||!source.acked_at)
   throw Error('P0B_D1_CANDIDATE_METADATA_INVALID');
  const meta=await env.DB.prepare(
   'SELECT source_id,b2_archive_uri,status FROM normalized_articles WHERE candidate_sha256=?'
  ).bind(source.candidate_sha256).first();
  if(meta?.source_id!==source.source_id||meta.b2_archive_uri!==source.b2_spool_uri||
     meta.status!=='ADMITTED')
   throw Error('P0B_D1_METADATA_READBACK_MISMATCH');
  // Every request consumes a ticket from the existing shared B2 D1 quota
  // governor. The exact ciphertext is authenticated and its canonical payload
  // SHA verified. This is NOT a source rights or original-event verification.
  const storage=manager??new B2SpoolManager(env);
  const raw=await storage.readVerified(source.b2_spool_uri,source.candidate_sha256,source.source_id);
  if(raw.candidateSha256!==source.candidate_sha256||
     raw.sourceId!==source.source_id)
   throw Error('P0B_B2_SOURCE_IDENTITY_MISMATCH');
  return privateJson({
   schema:'geomacro.p0b.live-b2-d1-parity.v1',
   ok:true,verified:true,
   b2_remote_get_and_decryption_verified:true,
   canonical_payload_sha256_verified:true,
   d1_normalized_metadata_readback_verified:true,
   d1_ack_state_verified:true,
   source_rights_granted:false,
   original_article_page_verified:false,
   original_publication_clock_unchanged:true,
   commercial_paid_output_changed:false
  });
 }catch{
  return privateJson({ok:false,verified:false,error:'P0B_LIVE_B2_D1_PARITY_UNVERIFIED'},503);
 }
}
