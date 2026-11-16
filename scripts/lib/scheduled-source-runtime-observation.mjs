/**
 * The source-runtime CLI uses exit 3 for a completed, exact-D1-readback
 * observation whose upstream families are degraded. Accept only that narrow
 * red receipt as a scheduler observation; D1/execution errors remain fatal.
 */
const CATEGORIES=["geopolitics","macro-fx","critical-minerals"];
export function recognizeDegradedSourceRuntimeObservation({code,stdout}={}){
  if(code!==3||typeof stdout!=="string"||stdout.length>128*1024)return null;
  const candidate=stdout.split(/\r?\n/u).filter(row=>row.trim()).at(-1);
  if(!candidate||candidate.length>64*1024)return null;
  let report;
  try{report=JSON.parse(candidate)}catch{return null}
  if(!report||typeof report!=="object"||Array.isArray(report)||
     report.schema!=="geomacro.supabase-free-source-runtime.v1"||
     report.source_reads_healthy!==false||report.d1_exact_readback_verified!==true||
     report.raw_records_persisted!==false||report.supabase_requests!==0||
     report.b2_requests!==0||report.payments!==0||report.scored!==false||
     report.independent_reviewed!==false||report.chargeable!==false||
     !Array.isArray(report.contexts)||report.contexts.length!==3||
     JSON.stringify(report.contexts.map(row=>row?.category))!==JSON.stringify(CATEGORIES)||
     report.contexts.some(row=>!Number.isSafeInteger(row.source_families_attempted)||
       row.source_families_attempted<1||!Number.isSafeInteger(row.source_families_readable)||
       row.source_families_readable<0||row.source_families_readable>row.source_families_attempted||
       !Number.isSafeInteger(row.derived_context_count)||row.derived_context_count<0)||
     JSON.stringify(report.replacements??{}).length>8_000||
     /https?:\/\/|www\.|<[^>]+>/iu.test(JSON.stringify(report)))return null;
  const unreadableFamilies=report.contexts.reduce((sum,row)=>
    sum+row.source_families_attempted-row.source_families_readable,0);
  const archiveIntegrityFailures=[report.gdelt_event,report.gdelt_gkg]
    .filter(value=>!value||value.archive_integrity_verified!==true).length;
  if(unreadableFamilies===0&&archiveIntegrityFailures===0)return null;
  return Object.freeze({observed:true,source_reads_healthy:false,
    unreadable_source_families:unreadableFamilies,
    archive_integrity_failures:archiveIntegrityFailures,
    source_status:"degraded",d1_exact_readback_verified:true,
    raw_records_persisted:false,scored:false,chargeable:false});
}
