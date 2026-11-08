#!/usr/bin/env node
/** Comprehensive static gate for remaining raw Phase2H dependencies.
 * Safe to run offline; no network, D1, B2, R2 or customer operations.
 * Any new direct raw Phase2H consumer requires explicit reviewed classification.
 */
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {join,relative} from "node:path";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
const ROOT=process.cwd();
const SCAN=["workers/control-plane/src","scripts/ops","scripts/lib","src/workers","src/pipelines"];
const EXT=/\.(?:mjs|cjs|js|ts|tsx)$/u;
// Only these byte-identical, separately reviewed Step3 files may access raw
// Phase2H originals in their ISOLATED SHADOW/LOCAL rehearsal context.
// A changed Git blob MUST trigger another manual source review and CI HOLD.
// This is not a production reference-only cutover or a true B2/R2 receipt.
export const SHADOW_ONLY_REVIEWED_BLOBS=Object.freeze({
 "scripts/lib/d1-step3-real-shadow-proofs.mjs":Object.freeze({
  blob:"9ddc619bbcdfdc221a1816e11321b4187fa66bed",
  classification:"PROTECTED_REAL_SHADOW_ONLY_B2_ORIGINAL_BYTE_PARITY_REVIEWED"}),
 "scripts/lib/d1-step3-shadow-pointer-seed.mjs":Object.freeze({
  blob:"0e582c4e643319a418921e3eaab99a50b2737a7d",
  classification:"PROTECTED_SHADOW_ONLY_R2_HMAC_POINTER_SEED_REVIEWED"}),
 "scripts/ops/run-step3-local-workerd-rehearsal.mjs":Object.freeze({
  blob:"58d8ebc16b7f48cd54884956ca118c10d8cd0d47",
  classification:"OFFLINE_MINIFLARE_SIMULATION_ONLY_NO_PRODUCTION_PROOF"})
});
export const gitBlobSha1=text=>createHash("sha1")
 .update("blob "+Buffer.byteLength(text,"utf8")+String.fromCharCode(0))
 .update(text).digest("hex");
const PROTECTED_BOUNDARIES=Object.freeze({
 "workers/control-plane/src/phase2h-raw-object-refs.mjs":
  "CENTRAL_VERIFIED_R2_AND_LEGACY_D1_FALLBACK",
 "workers/control-plane/src/phase2h-private-raw-news.mjs":
  "LEGACY_CANONICAL_WRITER_AND_PROTECTED_B2_SOURCE_EXPORT; OPT_IN_GATED_READER",
 "scripts/ops/phase2h-archive-private-raw-news.mjs":
  "PROTECTED_CANONICAL_B2_ARCHIVE_PRODUCER_AND_LEGACY_D1_FALLBACK",
 "workers/control-plane/src/gro-evidence-enrichment.mjs":
  "IN_MEMORY_RAW_FROM_CENTRAL_VERIFIED_ARCHIVED_BATCH_ONLY",
 "workers/control-plane/src/phase2h-risk-country-index.mjs":
  "IN_MEMORY_RAW_FROM_CENTRAL_VERIFIED_COUNTRY_SCOPE_ONLY",
 "workers/control-plane/src/unified-risk-gate.mjs":
  "IN_MEMORY_RAW_FROM_VERIFIED_COUNTRY_SCOPE_ONLY",
 "workers/control-plane/src/risk-gate-controlled-bypass.mjs":
  "IN_MEMORY_RAW_FROM_VERIFIED_SCOPE_ONLY",
 "workers/control-plane/src/corridor-risk-gate-jit.mjs":
  "IN_MEMORY_RAW_FROM_VERIFIED_SCOPE_ONLY",
 "scripts/ops/compile-daily-grounded-digests.ts":
  "IN_MEMORY_RAW_FROM_ROOT_AUTHENTICATED_VERIFIED_BATCH_ONLY",
 "scripts/ops/p0a-intelligence-completeness-production.mjs":
  "IN_MEMORY_RAW_FROM_ROOT_AUTHENTICATED_VERIFIED_BATCH_ONLY",
 "scripts/ops/phase2h-verify-private-question-delivery.mjs":
  "IN_MEMORY_B2_OBJECT_OR_ROOT_AUTHENTICATED_BATCH_ONLY"
});
function visit(path,out,depth=0){
 if(depth>15)return;
 for(const d of readdirSync(path,{withFileTypes:true})){
  if(d.name.startsWith(".")||
     ["node_modules","dist","build","artifacts","coverage"].includes(d.name))
   continue;
  const full=join(path,d.name);
  if(d.isDirectory()){visit(full,out,depth+1);continue}
  if(!EXT.test(d.name)||/\.(?:test|spec)\.(?:mjs|cjs|js|ts|tsx)$/u.test(d.name)||
     d.name==="audit-phase2h-raw-canonical-readers.mjs")continue;
  const source=readFileSync(full,"utf8");
  if(!source.includes("phase2h_private_raw_news")||!source.includes("raw_json"))
   continue;
  const file=relative(ROOT,full).replaceAll("\\","/");
  const reviewed=SHADOW_ONLY_REVIEWED_BLOBS[file];
  const pinned=reviewed?.blob===gitBlobSha1(source);
  out.push({file,classification:reviewed?
    (pinned?reviewed.classification:"UNREVIEWED_DIRECT_RAW_REFERENCE_HOLD"):
    (PROTECTED_BOUNDARIES[file]??"UNREVIEWED_DIRECT_RAW_REFERENCE_HOLD"),
   reviewed_shadow_blob_exact:pinned===true,
   has_sql_source_table:true,
   has_raw_json_token:true,
   source_select_raw_from_d1:
/SELECT[\s\S]{0,450}raw_json[\s\S]{0,150}FROM phase2h_private_raw_news/iu.test(source)||
    /SELECT[\s\S]{0,250}raw_json[\s\S]{0,300}FROM phase2h_private_raw_news/iu.test(source),
   verified_direct_pointer_layer:
    /readVerifiedPhase2hWorkerBatch|readVerifiedPhase2hScope|hydrateVerifiedPhase2hIds|phase2hRawObject/i.test(source)
  });
 }
}
export function auditPhase2hRawConsumers(){
 const files=[];for(const path of SCAN)visit(path,files);
 files.sort((a,b)=>a.file.localeCompare(b.file));
 const unknown=files.filter(x=>x.classification==="UNREVIEWED_DIRECT_RAW_REFERENCE_HOLD");
 const requiredLegacy=files.filter(x=>/LEGACY_CANONICAL_WRITER|PROTECTED_CANONICAL_B2_ARCHIVE_PRODUCER/.test(x.classification));
 return {schema:"geomacro.phase2h.remaining-raw-consumers.v1",
  scanned_roots:SCAN,classified_files:files.length,
  unknown_unreviewed:unknown.map(x=>x.file),
  protected_legacy_boundaries:requiredLegacy.map(x=>x.file),
  complete_reference_only_cutover_verified:false,
  production_ref_flag_must_remain_off:true,
  producer_or_B2_archive_disabled:false,
  full_b2_archive_parity_not_proven:true,
  files};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const x=auditPhase2hRawConsumers();
 mkdirSync("artifacts/release",{recursive:true});
 writeFileSync("artifacts/release/phase2h-raw-consumer-audit.json",
  JSON.stringify(x,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify({
  schema:x.schema,classified_files:x.classified_files,
  unknown_unreviewed:x.unknown_unreviewed,
  protected_legacy_boundaries:x.protected_legacy_boundaries,
  complete_reference_only_cutover_verified:false,
  provider_queries_by_this_audit:0
 }));
 if(x.unknown_unreviewed.length)process.exitCode=2;
}
