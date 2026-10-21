/**
 * Supabase-independent GRI v1.2 snapshot continuity.
 *
 * Every reviewed, scored publication APPENDS a genuine new snapshot to the
 * immutable previously B2-readback verified historical head. The bounded
 * projection of 1,000 newest snapshots is NOT the entire audit history:
 * each predecessor lives at its immutable content/pinned B2 archive key.
 *
 * This code never changes the canonical 72h scoring window, any severity,
 * current/reviewer clock, score, or signed input; historical score values are
 * not added arithmetically to newly calculated risk.
 */
export const GRI_HISTORY_LINEAGE_SCHEMA =
  "geomacro.gri-v12-immutable-b2-history-chain.v1";
export const GRI_HISTORY_MAX_HOT_ROWS = 1000;
const SHA=/^[a-f0-9]{64}$/u;
const HISTORY_PREFIX="geomacro-evidence/v1/history/global-risk/gri-v1.2.0/";
const fail=(reason)=>{throw Error("GRI_HISTORY_CHAIN_"+reason)};
const validIso=(s)=>typeof s==="string"&&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(s)&&
  Number.isFinite(Date.parse(s));
const isArchiveKey=(value)=>typeof value==="string"&&
  value.startsWith(HISTORY_PREFIX)&&
  /^[a-zA-Z0-9/_.-]+\.json\.gz$/u.test(value)&&
  !value.includes("..");

function priorHistoryTotal(history,rows) {
  if(history.lineage===undefined)return rows.length;
  const previous=history.lineage;
  if(!previous||previous.schema!==GRI_HISTORY_LINEAGE_SCHEMA||
    previous.latest_snapshot_id!==history.snapshot_id||
    previous.latest_as_of!==history.snapshot_as_of||
    previous.retained_snapshot_rows!==rows.length||
    previous.hot_row_limit!==GRI_HISTORY_MAX_HOT_ROWS||
    !Number.isSafeInteger(previous.total_verified_snapshots)||
    previous.total_verified_snapshots<rows.length||
    previous.total_verified_snapshots<3||
    previous.total_verified_snapshots>=Number.MAX_SAFE_INTEGER||
    !Number.isSafeInteger(previous.older_snapshots_in_pinned_b2_history)||
    previous.older_snapshots_in_pinned_b2_history!==
      previous.total_verified_snapshots-rows.length||
    !isArchiveKey(previous.previous_history_b2_key)||
    !SHA.test(previous.previous_history_b2_sha256??""))
    fail("PREVIOUS_B2_LINEAGE_INVALID");
  return previous.total_verified_snapshots;
}

/**
 * Called ONLY after: independent Ed25519 review; original/rights/cert checks;
 * exact pinned immutable B2 readback of the previous historical JSON; source-
 * native new event; canonical GRI calculation and portable proof reproduction.
 * Keeping each new head in its own immutable B2 object preserves even rows
 * that eventually fall out of the size-bounded hot historical projection.
 */
export function appendVerifiedGriHistory({
  history,latest,priorHistoryKey,verifiedPriorB2Sha256,
}={}){
  const rows=history?.verified_snapshot_rows;
  if(!Array.isArray(rows)||rows.length<2||
     rows.length>GRI_HISTORY_MAX_HOT_ROWS||
     history?.snapshot_id!==rows[0]?.id||
     history?.snapshot_as_of!==rows[0]?.as_of||
     !isArchiveKey(priorHistoryKey)||
     priorHistoryKey!==HISTORY_PREFIX+history.snapshot_id+".json.gz"||
     !SHA.test(verifiedPriorB2Sha256??"")||
     !latest||latest.status!=="published"||
     latest.verification_status!=="verified"||
     latest.methodology_version!=="gri-v1.2.0"||
     typeof latest.id!=="string"||latest.id.length<8||
     !validIso(latest.as_of)||!validIso(rows[0].as_of)||
     Date.parse(latest.as_of)<=Date.parse(rows[0].as_of)||
     latest.previous_as_of!==rows[0].as_of||
     latest.previous_raw_score!==rows[0].raw_score||
     latest.previous_display_score!==rows[0].display_score||
     rows.some(row=>row.id===latest.id||row.as_of===latest.as_of))
    fail("PREVIOUS_OR_NEW_VERIFIED_SNAPSHOT_INVALID");
  const oldTotal=priorHistoryTotal(history,rows);
  if(oldTotal>=Number.MAX_SAFE_INTEGER)fail("HISTORICAL_COUNT_OVERFLOW");
  const retained=[latest,...rows.slice(0,GRI_HISTORY_MAX_HOT_ROWS-1)];
  // Immutable input rows remain intact. Only a bounded view of the newest
  // data enters the new archive; the prior B2 version carries the rest.
  if(retained.length<3||retained.length>GRI_HISTORY_MAX_HOT_ROWS||
     retained[1]!==rows[0]||
     retained.some((row,i)=>i>0&&
      Date.parse(row.as_of)>=Date.parse(retained[i-1].as_of)))
    fail("APPEND_ORDER_OR_PREVIOUS_HEAD_CHANGED");
  const total=oldTotal+1;
  return Object.freeze({
    retainedRows:retained,
    lineage:Object.freeze({
      schema:GRI_HISTORY_LINEAGE_SCHEMA,
      hot_row_limit:GRI_HISTORY_MAX_HOT_ROWS,
      total_verified_snapshots:total,
      retained_snapshot_rows:retained.length,
      older_snapshots_in_pinned_b2_history:total-retained.length,
      latest_snapshot_id:latest.id,
      latest_as_of:latest.as_of,
      previous_snapshot_id:rows[0].id,
      previous_snapshot_as_of:rows[0].as_of,
      previous_history_b2_key:priorHistoryKey,
      previous_history_b2_sha256:verifiedPriorB2Sha256,
      previous_archive_was_independently_b2_readback_verified:true,
      methodology_version:"gri-v1.2.0",
      current_score_method:"canonical_72h_recomputed_not_score_sum",
      prior_history_permanently_mutated:false,
      legacy_supabase_required:false,
    }),
  });
}
