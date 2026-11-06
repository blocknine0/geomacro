/**
 * Protected, read-only, paginated physical B2 -> D1 reconciliation.
 * Every archived outbox bundle is independently fetched from B2 and its
 * authenticated gzip/plaintext SHA-256 manifest is compared to canonical D1.
 * It never signs, promotes, ACKs, deletes, or changes source rights.
 * B2 objects not referenced by D1 require a separate bucket LIST audit.
 */
import {B2SpoolManager} from "../../../src/storage/b2-spool-manager.ts";

const HEX = /^[a-f0-9]{64}$/u;
const reply = (value,status=200) => Response.json(value,{status,headers:{
  "Cache-Control":"private, no-store",
  "X-Content-Type-Options":"nosniff",
  "X-Robots-Tag":"noindex,nofollow",
}});
function validPage(url) {
  const after=url.searchParams.get("after") ?? "";
  const raw=url.searchParams.get("limit") ?? "2";
  if ((after && !HEX.test(after)) || !/^[1-3]$/u.test(raw) ||
      [...url.searchParams.keys()].some(k=>!["after","limit"].includes(k)))
    return null;
  return {after,limit:Number(raw)};
}
export async function verifyHot50ArchivedPage(env,url,{manager}={}) {
  const page=validPage(url);
  if(!page)return reply({ok:false,code:"P0B_PARITY_PAGE_ARGUMENTS_INVALID"},400);
  if(!env?.DB?.prepare)return reply({ok:false,code:"P0B_PARITY_D1_UNAVAILABLE"},503);
  try {
    const result=await env.DB.prepare(
      "SELECT batch_id,b2_uri,b2_object_sha256,item_count FROM p0b_archive_outbox " +
      "WHERE state='ARCHIVED' AND batch_id>? ORDER BY batch_id LIMIT ?"
    ).bind(page.after,page.limit+1).all();
    const all=result?.results;
    if(!Array.isArray(all))throw Error("P0B_PARITY_OUTBOX_SCAN_UNAVAILABLE");
    const rows=all.slice(0,page.limit),store=manager??new B2SpoolManager(env);
    let checked=0,candidates=0;
    for(const row of rows){
      if(!HEX.test(row.batch_id??"") || !HEX.test(row.b2_object_sha256??"") ||
         typeof row.b2_uri!=="string" || !row.b2_uri.startsWith("b2://") ||
         !Number.isInteger(row.item_count) || row.item_count<1 || row.item_count>100)
        throw Error("P0B_PARITY_OUTBOX_METADATA_INVALID");
      // readBundleVerified performs independent B2 GET, AES-GCM, gzip and
      // plaintext/manifest SHA-256 verification with the existing quota gate.
      const physical=await store.readBundleVerified(row.b2_uri,row.b2_object_sha256);
      if(physical.batchSha256!==row.b2_object_sha256 ||
         physical.items?.length!==row.item_count ||
         physical.index?.length!==row.item_count)
        throw Error("P0B_PARITY_REMOTE_MANIFEST_INVALID");
      const bundle=await env.DB.prepare(
        "SELECT bundle_sha256,item_count,state,acked_at,d1_committed_at " +
        "FROM ingestion_spool_bundles WHERE b2_spool_uri=?"
      ).bind(row.b2_uri).first();
      if(bundle?.bundle_sha256!==row.b2_object_sha256 ||
         bundle.item_count!==row.item_count || bundle.state!=="D1_COMMITTED" ||
         !bundle.acked_at || !bundle.d1_committed_at)
        throw Error("P0B_PARITY_BUNDLE_ACK_NOT_COMMITTED");
      const journal=await env.DB.prepare(
        "SELECT q.candidate_sha256,q.source_id,q.bundle_offset,q.bundle_length," +
        "q.state,q.d1_committed_at,q.acked_at,n.source_id AS article_source," +
        "n.b2_archive_uri,n.status AS article_status " +
        "FROM ingestion_spool_queue q LEFT JOIN normalized_articles n " +
        "ON q.candidate_sha256=n.candidate_sha256 " +
        "WHERE q.b2_spool_uri=? ORDER BY q.bundle_offset"
      ).bind(row.b2_uri).all();
      const items=journal?.results;
      if(!Array.isArray(items) || items.length!==row.item_count)
        throw Error("P0B_PARITY_D1_ITEM_COUNT_MISMATCH");
      for(let i=0;i<physical.index.length;i++){
        const expected=physical.index[i],actual=items[i];
        if(!HEX.test(expected?.candidateSha256??"") ||
           actual?.candidate_sha256!==expected.candidateSha256 ||
           actual?.source_id!==expected.sourceId ||
           actual?.bundle_offset!==expected.byteOffset ||
           actual?.bundle_length!==expected.byteLength ||
           actual?.state!=="D1_COMMITTED" ||
           !actual?.d1_committed_at || !actual?.acked_at ||
           actual?.article_source!==expected.sourceId ||
           actual?.b2_archive_uri!==row.b2_uri ||
           actual?.article_status!=="ADMITTED")
          throw Error("P0B_PARITY_D1_ITEM_READBACK_MISMATCH");
      }
      checked++;candidates+=row.item_count;
    }
    // Pagination is deterministic and exhaustively checks each D1 reference.
    // A clean page is NOT a whole-bucket LIST or an orphan-object census.
    return reply({ok:true,schema:"geomacro.p0b-all-archived-physical-parity.v1",
      checked_bundles:checked,checked_candidates:candidates,
      b2_independent_get_decrypt_sha256_verified:true,
      d1_canonical_item_ack_readback_verified:true,
      next_cursor:all.length>page.limit?rows.at(-1).batch_id:null,
      complete:all.length<=page.limit,
      full_bucket_list_verified:false,
      no_source_payload_exposed:true,
      no_write_or_payment:true});
  }catch(error){
    const code=error instanceof Error && /^P0B_[A-Z0-9_]+$/u.test(error.message)?
      error.message:"P0B_PARITY_REMOTE_OR_D1_UNAVAILABLE";
    return reply({ok:false,code,full_parity_claimed:false},503);
  }
}
