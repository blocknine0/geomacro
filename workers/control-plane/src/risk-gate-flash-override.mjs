/** Current signed GRO material flash overlay against today's immutable baseline. */
const iso=n=>new Date(n).toISOString();
export async function readIntradayFlashOverride(db,gro,subject,now=Date.now()){
 if(!db?.prepare)return {available:false,active:false,reason_code:"FLASH_D1_UNAVAILABLE"};
 try{
  const row=await db.prepare("SELECT generated_at FROM unified_risk_snapshots WHERE entity_type=? AND entity_id=? AND day_utc=? LIMIT 1")
   .bind(subject.type.toUpperCase(),subject.id,iso(now).slice(0,10)).first();
  if(!row)return {available:true,active:false,reason_code:"NO_DAILY_BASELINE"};
  const base=Date.parse(row.generated_at),fresh=Date.parse(gro?.generated_at);
  if(!Number.isFinite(base)||!Number.isFinite(fresh))return {available:false,active:false,reason_code:"FLASH_CLOCK_INVALID"};
  const newer=fresh>base;
  const severity=Number(gro?.risk?.score),confidence=Number(gro?.confidence);
  const active=newer&&severity>=80&&confidence>=0.90;
  return {available:true,active,reason_code:active?"INTRADAY_MATERIAL_FLASH_OVERRIDE":null,
   severity_score:active?severity:null,confidence:active?confidence:null,
   signed_gro_object_id:active?String(gro.object_id):null,
   generated_at:active?gro.generated_at:null,
   baseline_generated_at:row.generated_at,
   thresholds:{severity_gte:80,confidence_gte:0.90}};
 }catch{return {available:false,active:false,reason_code:"FLASH_READBACK_UNAVAILABLE"}}
}
export function applyIntradayFlashDecision(result,flash){
 if(!result||typeof result!=="object")return result;
 if(flash?.active&&result.decision==="CONTINUE"){
  result.decision="REQUIRE_APPROVAL";
  result.reason_codes=[...new Set([...(result.reason_codes??[]),"intraday_material_flash_override"])].sort();
 }
 if(flash?.available===false&&result.decision==="CONTINUE"){
  result.decision="REQUIRE_APPROVAL";
  result.reason_codes=[...new Set([...(result.reason_codes??[]),"flash_check_unavailable"])].sort();
 }
 result.intraday_override=flash?.active===true;
 result.flash_check_available=flash?.available===true;
 if(flash?.active)result.flash_details={severity_score:flash.severity_score,
  confidence:flash.confidence,signed_gro_object_id:flash.signed_gro_object_id,
  generated_at:flash.generated_at,reason_code:flash.reason_code,
  thresholds:flash.thresholds};
 return result;
}
