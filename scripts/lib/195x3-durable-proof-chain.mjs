import {createHash} from "node:crypto";

export const GLOBAL_PROOF_LEDGER_SCHEMA = "geomacro.country-195x3-durable-audit-proof.v1";
export const GLOBAL_PROOF_HEAD_SCHEMA = "geomacro.country-195x3-durable-audit-head.v1";
export const GLOBAL_PROOF_PREFIX = "geomacro-evidence/v1/country-195x3/audit-proof/";
export const GLOBAL_PROOF_HEAD_KEY = GLOBAL_PROOF_PREFIX+"latest.json";
const SHA=/^[0-9a-f]{64}$/u;
const SHA40=/^[0-9a-f]{40}$/u;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const CATS=["geopolitics","macro","rare_earth"];
const goodTime=s=>typeof s==="string"&&ISO.test(s)&&Number.isFinite(Date.parse(s));
const err=code=>{throw Error("GLOBAL_PROOF_"+code)};
export const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
export function proofSnapshotKey(recordedAt,runId,attempt,sha){
  if(!goodTime(recordedAt)||!/^[1-9]\d{0,18}$/.test(String(runId))||
      !/^[1-9]\d{0,3}$/.test(String(attempt))||!SHA.test(sha))
    err("OBJECT_ID_INVALID");
  const date=recordedAt.slice(0,10);
  return GLOBAL_PROOF_PREFIX+date+"/"+runId+"-"+attempt+"-"+sha+".json";
}
export function isSnapshotKey(key){
  return typeof key==="string"&&key.startsWith(GLOBAL_PROOF_PREFIX)&&
    /^geomacro-evidence\/v1\/country-195x3\/audit-proof\/\d{4}-\d{2}-\d{2}\/[1-9]\d{0,18}-[1-9]\d{0,3}-[a-f0-9]{64}\.json$/u.test(key);
}
export function assertGlobalAuditDocument(doc){
  const d=doc;
  if(!d||typeof d!=="object"||Array.isArray(d)||
      d.schema!=="geomacro.supabase-free-country-runtime-audit.v1" ||
      d.country_count!==195||d.category_count!==3||d.routing_cell_count!==585||
      !goodTime(d.checked_at) ||
      typeof d.audit_ok!=="boolean" ||
      !["GLOBAL_RUNTIME_READ_VERIFIED","SOURCE_RUNTIME_UNAVAILABLE"].includes(d.audit_state) ||
      d.audit_ok!==(d.audit_state==="GLOBAL_RUNTIME_READ_VERIFIED") ||
      d.paid_country_readiness_assessed!==false ||
      d.country_current_evidence_not_inferred_from_global_feeds!==true ||
      d.boundaries?.payments!==0||d.boundaries?.supabase_requests!==0||
      d.boundaries?.b2_requests!==0||
      d.boundaries?.execution_authorized!==false||
      d.boundaries?.raw_source_urls_emitted!==false||
      d.boundaries?.raw_source_material_emitted!==false)
    err("DOCUMENT_BOUNDARY_INVALID");
  if(d.audit_ok && (!d.source_runtime || !Array.isArray(d.automated_finds_categories) ||
      d.automated_finds_categories.length!==3))err("SUCCESS_WITHOUT_SOURCE_PROOF");
  if(!d.audit_ok && (d.source_runtime!==null ||
      d.current_signed_country_delivery_verified_count!==0 ||
      d.blocked_scope!=="GLOBAL_SOURCE_READ_NOT_PER_COUNTRY_NEGATIVE_PROOF"))
    err("FAILED_AUDIT_PROMOTED");
  const matrix=d.country_category_matrix;
  if(matrix?.schema!=="geomacro.country-category-coverage-matrix.v1"||
      matrix.country_count!==195||matrix.category_count!==3||matrix.cell_count!==585||
      !Array.isArray(matrix.cells)||matrix.cells.length!==585||
      matrix.x402_payment_authorized!==false||
      matrix.source_catalogue_is_not_evidence!==true||
      matrix.unprobed_is_not_no_current_evidence!==true)
    err("MATRIX_BOUNDARY_INVALID");
  const unique=new Set(),counts=new Map(),positive={source:0,current:0,signed:0};
  for(const cell of matrix.cells){
    const country=cell?.country_iso3,category=cell?.category;
    const key=country+":"+category;
    if(typeof country!=="string"||!/^[A-Z]{3}$/u.test(country)||
       !CATS.includes(category)||unique.has(key)||cell.ROUTING_VERIFIED!==true||
       ![true,false,null].includes(cell.CURRENT_EVIDENCE_AVAILABLE)||
       ![true,false,null].includes(cell.RIGHTS_QUALIFIED)||
       ![true,false,null].includes(cell.SIGNED_DELIVERY_VERIFIED)||
       ![true,false,null].includes(cell.LIVE_SOURCE_REACHABLE))
      err("MATRIX_CELL_INVALID");
    unique.add(key);
    counts.set(country,(counts.get(country)??0)+1);
    if(cell.LIVE_SOURCE_REACHABLE===true)positive.source++;
    if(cell.CURRENT_EVIDENCE_AVAILABLE===true)positive.current++;
    if(cell.SIGNED_DELIVERY_VERIFIED===true)positive.signed++;
    if(cell.SIGNED_DELIVERY_VERIFIED===true &&
       (cell.CURRENT_EVIDENCE_AVAILABLE!==true||cell.RIGHTS_QUALIFIED!==true))
      err("UNSUPPORTED_PAID_PROOF_PROMOTION");
    if(!d.audit_ok && (cell.LIVE_SOURCE_REACHABLE===true||
      cell.CURRENT_EVIDENCE_AVAILABLE===true||cell.SIGNED_DELIVERY_VERIFIED===true))
      err("SOURCE_FAILURE_UNSUPPORTED_POSITIVE");
  }
  if(unique.size!==585||counts.size!==195||[...counts.values()].some(x=>x!==3))
    err("REGISTRY_NOT_195X3");
  if(positive.signed>0)err("SIGNED_CUSTOMER_DELIVERY_NOT_INDEPENDENTLY_ATTESTED");
  const sum=(key)=>CATS.reduce((n,c)=>n+Number(matrix[key]?.[c]??NaN),0);
  if(sum("routing_verified_counts")!==585||
     sum("live_source_verified_counts")!==positive.source ||
     sum("current_evidence_verified_counts")!==positive.current ||
     sum("signed_delivery_verified_counts")!==0)
    err("MATRIX_COUNTS_INCONSISTENT");
  return {audit_ok:d.audit_ok,observed_positive_source_cells:positive.source,
    observed_current_cells:positive.current,observed_signed_customer_cells:0,
    observed_country_count:counts.size,covered_lanes:unique.size};
}
export function assertProofHead(v){
  if(v===null)return null;
  if(v?.schema!==GLOBAL_PROOF_HEAD_SCHEMA ||
      !isSnapshotKey(v.snapshot_key)||!SHA.test(v.snapshot_sha256)||
      !SHA40.test(v.git_commit)||
      !goodTime(v.recorded_at) ||
      typeof v.audit_ok!=="boolean")err("HEAD_INVALID");
  return v;
}
export function buildGlobalAuditSnapshot({audit,gitCommit,runId,runAttempt,recordedAt,previousHead}){
  const counts=assertGlobalAuditDocument(audit);
  if(!SHA40.test(gitCommit)||!goodTime(recordedAt)||
      Date.parse(recordedAt)<Date.parse(audit.checked_at)||
      Date.parse(recordedAt)-Date.parse(audit.checked_at)>3600_000)
    err("GIT_OR_TIME_INVALID");
  const previous=assertProofHead(previousHead);
  const snapshot={
    schema:GLOBAL_PROOF_LEDGER_SCHEMA,
    recorded_at:recordedAt,
    canonical_git_sha:gitCommit,
    github_run_id:String(runId),github_run_attempt:Number(runAttempt),
    previous_snapshot_key:previous?.snapshot_key??null,
    previous_snapshot_sha256:previous?.snapshot_sha256??null,
    prior_audit_head_was_independently_readback_verified:previous!==null,
    audit_state:audit.audit_state,
    audit_ok:audit.audit_ok,
    auditable_195x3_lanes:true,
    actual_per_cell_paid_evidence_certified:false,
    actual_signed_customer_delivery_certified:false,
    commercial_activation_authorized:false,
    no_payment_signatures_or_wallet_operations:true,
    counts,
    audit, // Private B2 archive; canonical 585-cell state, never a temporary Actions artifact.
  };
  const bytes=Buffer.from(JSON.stringify(snapshot)+"\n");
  const sha=digest(bytes);
  const key=proofSnapshotKey(recordedAt,runId,runAttempt,sha);
  const head={
    schema:GLOBAL_PROOF_HEAD_SCHEMA,recorded_at:recordedAt,git_commit:gitCommit,
    snapshot_key:key,snapshot_sha256:sha,audit_ok:audit.audit_ok,
    previous_snapshot_key:previous?.snapshot_key??null,
    previous_snapshot_sha256:previous?.snapshot_sha256??null,
    versioned_history_preserved:true,live_data_eligibility_implied:false,
  };
  return{key,bytes,sha,head,counts};
}
export function verifyPreviousSnapshot(head,bytes){
  assertProofHead(head);
  if(!Buffer.isBuffer(bytes)||digest(bytes)!==head.snapshot_sha256)err("PREVIOUS_BYTES_MISMATCH");
  let json;try{json=JSON.parse(bytes.toString("utf8"));}catch{err("PREVIOUS_JSON_INVALID")}
  if(json.schema!==GLOBAL_PROOF_LEDGER_SCHEMA||json.canonical_git_sha!==head.git_commit||
     json.recorded_at!==head.recorded_at||json.audit_ok!==head.audit_ok)
    err("PREVIOUS_RECEIPT_MISMATCH");
  assertGlobalAuditDocument(json.audit);
  return true;
}
