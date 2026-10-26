#!/usr/bin/env node
/**
 * Bounded, private no-card three-category official transport observation.
 * One request per category per run, rotating three providers per domain.
 * Raw payloads are never logged/stored; only coarse health metadata.
 * Existing source adapters/signers and commercial rights are NOT modified.
 */
import { observeNoKeyLineup } from "../lib/free-no-key-source-probe.mjs";
import { sourceLineupSummary } from "../lib/operator-commercial-free-source-lineup.mjs";
import {collectProductionFreeSourceUpdates,PRODUCTION_FREE_SOURCE_D1_PIPELINE} from '../lib/free-source-production-updates.mjs';
import {assessFreeSourceOperationalVerdict} from '../lib/free-source-operational-verdict.mjs';
import {safeFreeSourceProductionFailure} from '../lib/free-source-production-failure.mjs';
import {createD1ControlPlaneStateClient} from '../lib/d1-control-plane-state.mjs';
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';

if(process.argv.includes('--production-updates')){
 let phase="protected_context";
 try{
   if(process.argv.length!==3||process.env.GITHUB_REPOSITORY!=='blocknine0/geomacro'||
      process.env.GITHUB_REF!=='refs/heads/main'||!/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??''))
     throw Error('PROTECTED_SOURCE_READER_REQUIRED');
   for(const key of ['SUPABASE_URL','APP_SUPABASE_URL','SUPABASE_DB_URL',
     'SUPABASE_SERVICE_ROLE_KEY','APP_SUPABASE_SERVICE_ROLE_KEY','B2_KEY_ID',
     'B2_APPLICATION_KEY','COINBASE_API_KEY','RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64'])
     if(process.env[key])throw Error('SOURCE_READER_FORBIDDEN_CREDENTIAL');
   phase="d1_load_and_source_collection";
   const client=createD1ControlPlaneStateClient({pipeline:PRODUCTION_FREE_SOURCE_D1_PIPELINE});
   const receipt=await collectProductionFreeSourceUpdates({stateClient:client,onObservation:row=>console.log(JSON.stringify({schema:"geomacro.free-source-reader-outcome.v1",...row}))});
   // A real D1 readback mismatch throws before this point. Cached 403/429
   // provider diagnoses must remain red in metadata but must not make a
   // verified metadata-publication workflow masquerade as a failed writer.
   phase="d1_operational_verdict";
   const verdict=assessFreeSourceOperationalVerdict(receipt);
   phase="safe_receipt_write";
   mkdirSync('artifacts/free-source-updates',{recursive:true,mode:0o700});
   writeFileSync('artifacts/free-source-updates/receipt.json',JSON.stringify(
     {...receipt,operational_verdict:verdict},null,2)+'\n',{mode:0o600});
   console.log(JSON.stringify(receipt));
   console.log(JSON.stringify(verdict));
   // Separately report only the last accepted official annual source read.
   // Never equate annual reference data to breaking news or to paid delivery.
   if(receipt.wdi_reference?.status!=='SOURCE_READ_WITHIN_36H')
     console.warn('::warning title=WDI_SOURCE_READ_DEGRADED::'+
       (receipt.wdi_reference?.status??'NO_WDI_D1_READBACK')+
       '; existing source-2 daily polling and quota-safe recovery retained.');

   if(verdict.require_source_recovery_followup){
     console.warn('::warning title=OFFICIAL_PROVIDERS_DEGRADED::'+
       verdict.retained_degraded_source_count+
       ' source reader(s) have recorded negative observations; see D1 receipt for exact statuses. D1 readback is independently verified.');
   }
   if(process.env.GITHUB_STEP_SUMMARY)
     appendFileSync(process.env.GITHUB_STEP_SUMMARY,
       '### Free source data availability (not commercial publication)\n\n'+
       '- D1 checkpoint/readback: VERIFIED\n'+
       '- Provider status: '+verdict.operator_status+'\n'+
       '- Current attempts unavailable: '+verdict.attempts_unavailable+'\n'+
       '- Retained provider failures: '+verdict.retained_degraded_source_count+'\n'+
       '- WDI annual source read: '+(receipt.wdi_reference?.status??'UNKNOWN')+'\n'+
       '- WDI source last success: '+(receipt.wdi_reference?.last_success_at??'NONE')+'\n'+
       '- WDI annual data is not current news\n'+
       '- 195-country current signed coverage: NOT VERIFIED\n');
 }catch(error){
   const receipt=safeFreeSourceProductionFailure(error,{phase});
   // Always retain an actionable, source-free artifact even when the D1
   // checkpoint is unavailable; never emit exception text or a secret.
   try{
     mkdirSync('artifacts/free-source-updates',{recursive:true,mode:0o700});
     writeFileSync('artifacts/free-source-updates/receipt.json',
       JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
   }catch{/* Never mask original protected failure. */}
   console.error(JSON.stringify(receipt));
   console.error('PRODUCTION_FREE_SOURCE_UPDATES_FAILED_CLOSED');
   process.exitCode=2;
 }
}else{

const DAY_PART_MS = 12 * 60 * 60 * 1000;
const group = process.env.FREE_SOURCE_GROUP == null
  ? Math.floor(Date.now() / DAY_PART_MS) % 3
  : Number(process.env.FREE_SOURCE_GROUP);

if (!Number.isInteger(group) || group < 0 || group > 2)
  throw new Error("SOURCE_PROBE_GROUP_INVALID");

const report = await observeNoKeyLineup(group);
const counts = sourceLineupSummary();
const safe = {
  schema: "geomacro.free-source-transport-prod-observation.v1",
  at: report.checked_at,
  group: report.group,
  families_catalogued: counts.total_families,
  families_per_category: counts.by_category,
  exact_dataset_rights_reviewed_count: counts.existing_exact_rights_verified.length,
  probe_attempted: report.attempted,
  categories: report.per_category,
  transport_outcomes: {
    readable: report.rows.filter(x => x.state === "TRANSPORT_READABLE").length,
    reachable_format_unverified: report.rows.filter(x => x.state === "ENDPOINT_REACHABLE_FORMAT_UNVERIFIED").length,
    denied_or_rate_limited: report.rows.filter(x => x.state === "DENIED_OR_RATE_LIMIT").length,
    other_failures: report.rows.filter(x =>
      !["TRANSPORT_READABLE","ENDPOINT_REACHABLE_FORMAT_UNVERIFIED","DENIED_OR_RATE_LIMIT"].includes(x.state)).length,
  },
  original_publication_or_same_event_corroboration_proven: false,
  new_dataset_commercial_rights_approved: false,
  all_sources_live: false,
  new_paid_sources_activated: 0,
  signed_gro_generated: false,
  x402_payment_authorized: false,
  payments: report.payments,
  raw_upstream_payload_persisted: false,
  supabase_requests: 0, d1_requests: 0, b2_requests: 0,
};
// Print only category totals: no raw source, URL, content, title or token.
console.log(JSON.stringify(safe));
if (!Object.values(report.per_category).every(x => x.readable >= 1)) {
  console.error("FREE_SOURCE_MESH_PARTIAL_OR_BLOCKED; check feed rights/transport before promotion");
  process.exitCode = 2;
}
}
