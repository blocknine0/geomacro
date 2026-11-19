const HASH=/^[a-f0-9]{64}$/u;
const ISO3=/^[A-Z]{3}$/u;
const CATEGORY=new Set(["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]);
const TERMS=Object.freeze({
 BASIC:{customer_price_usd:"0.15",geomacro_net_usd:"0.10"},
 STANDARD:{customer_price_usd:"0.20",geomacro_net_usd:"0.15"},
 COMPLEX:{customer_price_usd:"0.30",geomacro_net_usd:"0.25"}
});

export function normalizePredgeTier(value){
 const tier=String(value??"").toUpperCase();
 if(["BASIC","BASIC_FOCUSED","FOCUSED","BASIC_FOCUSED_FACTS_DERIVED_V1"].includes(tier))return "BASIC";
 if(["STANDARD","STANDARD_DUAL_ORIGINAL_GRO_V1"].includes(tier))return "STANDARD";
 if(["COMPLEX","COMPLEX_FULL","COMPLEX_7D_CORRIDOR_SYNTHESIS_V1"].includes(tier))return "COMPLEX";
 return "BASIC";
}
function normalizeCategory(value){
 const category=String(value??"").toUpperCase();
 if(category==="MACRO"||category==="MACRO_FX")return "MACRO_FX";
 if(category==="GEOPOLITICS"||category==="CRITICAL_MINERALS")return category;
 return null;
}
function safeJson(value){try{return JSON.parse(value)}catch{return null}}
function countryFrom(body){
 const country=body?.country_iso3??(body?.subject?.type==="country"?body.subject.country_iso3:null);
 return ISO3.test(String(country??""))?country:null;
}
function tierFrom(body,response){
 return normalizePredgeTier(response?.tier??response?.eligible_derived_score?.agent_decision?.tier??
   body?.tier??body?.eligible_tier);
}
async function sha256(text){
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
 return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,"0")).join("");
}

/** Record one completed Predge HTTP request. Failures here are intentionally observational. */
export async function recordPredgeDeliveryObservation({request,response,env,apiVersion,now=Date.now()}){
 try{
  if(!env?.DB?.prepare||!(apiVersion==="v1"||apiVersion==="v2"))return false;
  const requestBody=safeJson(await request.clone().text())??{};
  const responseBody=safeJson(await response.clone().text())??{};
  const observedAt=new Date(now).toISOString(),dayUtc=observedAt.slice(0,10);
  const tier=tierFrom(requestBody,responseBody),terms=TERMS[tier];
  const receipt=typeof responseBody.audit_receipt_hash==="string"&&HASH.test(responseBody.audit_receipt_hash)?
   responseBody.audit_receipt_hash:
   typeof responseBody.audit_receipt_sha256==="string"&&HASH.test(responseBody.audit_receipt_sha256)?
    responseBody.audit_receipt_sha256:await sha256(await response.clone().text());
  const status=response.status>=200&&response.status<300&&responseBody.ok===true?"DELIVERED":"FAILED";
  const deliveryId=await sha256(`${crypto.randomUUID()}:${observedAt}:${receipt}`);
  const category=normalizeCategory(responseBody.license_scope?.bound_category??
    responseBody.eligible_derived_score?.category??requestBody.category);
  const candidateGroId=responseBody.licensed_gro_id??responseBody.source_gro_id;
  const groId=typeof candidateGroId==="string"&&candidateGroId.length>0&&candidateGroId.length<=256?candidateGroId:null;
  const requestId=typeof requestBody.request_id==="string"?requestBody.request_id.slice(0,256):null;
  await env.DB.prepare(`INSERT INTO risk_stream_predge_daily_delivery_ledger
   (delivery_id,api_version,request_id,gro_id,receipt_sha256,day_utc,country_iso3,category,tier,
    customer_price_usd,geomacro_net_usd,predge_fee_usd,delivery_status,http_status,observed_at)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,'0.05',?,?,?)`)
   .bind(deliveryId,apiVersion,requestId,groId,receipt,dayUtc,countryFrom(requestBody),category,tier,
    terms.customer_price_usd,terms.geomacro_net_usd,status,response.status,observedAt).run();
  return true;
 }catch{return false;}
}

const cents={BASIC:10,STANDARD:15,COMPLEX:25};
const money=c=>Number((c/100).toFixed(2));
function validDay(day){return /^\d{4}-\d{2}-\d{2}$/u.test(day)&&new Date(`${day}T00:00:00.000Z`).toISOString().slice(0,10)===day;}
function rowTier(row){
 const payload=typeof row.payload_json==="string"?safeJson(row.payload_json):row.payload_json;
 return normalizePredgeTier(row.tier??payload?.eligible_derived_score?.agent_decision?.tier??
  payload?.agent_decision?.tier??payload?.tier);
}
function keyOf(r){return `${String(r.gro_id??"").trim()}\u0000${String(r.receipt_sha256??r.audit_receipt_hash??"").trim().toLowerCase()}`;}
export function reconcilePredgeDaily({day,createdRows=[],deliveryRows=[],partnerRows=null}){
 if(!validDay(day))throw new Error("INVALID_UTC_DAY");
 const tiers=["BASIC","STANDARD","COMPLEX"];
 const created=createdRows.filter(r=>String(r.created_at??"").slice(0,10)===day);
 const deliveries=deliveryRows.filter(r=>r.day_utc===day);
 const tier_breakdown=Object.fromEntries(tiers.map(t=>{
  const made=created.filter(r=>rowTier(r)===t), rows=deliveries.filter(r=>normalizePredgeTier(r.tier)===t);
  return [t,{created:made.length,sent_to_predge:rows.filter(r=>["SENT","DELIVERED"].includes(r.delivery_status)).length,
   delivered:rows.filter(r=>r.delivery_status==="DELIVERED").length,failed:rows.filter(r=>r.delivery_status==="FAILED").length,
   expected_geomacro_net_usd:money(rows.filter(r=>r.delivery_status==="DELIVERED").length*cents[t])}];
 }));
 const sent=deliveries.filter(r=>["SENT","DELIVERED"].includes(r.delivery_status));
 const delivered=deliveries.filter(r=>r.delivery_status==="DELIVERED");
 const failed=deliveries.filter(r=>r.delivery_status==="FAILED");
 const summary={day_utc:day,created_total:created.length,sent_to_predge_total:sent.length,
  delivered_total:delivered.length,failed_total:failed.length,tier_breakdown,
  created_by_country_category:Object.fromEntries([...new Set(created
   .filter(r=>ISO3.test(String(r.country_iso3??""))&&CATEGORY.has(normalizeCategory(r.category)))
   .map(r=>`${r.country_iso3}:${normalizeCategory(r.category)}`))]
   .sort().map(key=>{const [country_iso3,category]=key.split(":");
    const rows=created.filter(r=>`${r.country_iso3}:${normalizeCategory(r.category)}`===key);
    return [key,{country_iso3,category,
     created_total:rows.length,tier_breakdown:Object.fromEntries(tiers.map(t=>[t,rows.filter(r=>rowTier(r)===t).length]))}];})),
  expected_geomacro_net_usd:money(delivered.reduce((sum,r)=>sum+cents[normalizePredgeTier(r.tier)],0))};
 if(partnerRows===null)return summary;
 const multiset=new Map();
 for(const row of partnerRows){const key=keyOf(row);multiset.set(key,(multiset.get(key)??0)+1);}
 const matched=[],missing=[],extra=[];
 for(const row of delivered){
  const key=keyOf(row),count=multiset.get(key)??0;
  if(row.gro_id&&HASH.test(String(row.receipt_sha256??""))&&count>0){matched.push({gro_id:row.gro_id,receipt_sha256:row.receipt_sha256});multiset.set(key,count-1);}
  else missing.push({gro_id:row.gro_id??null,receipt_sha256:row.receipt_sha256});
 }
 const partnerCounts=new Map();for(const row of partnerRows){const key=keyOf(row);partnerCounts.set(key,(partnerCounts.get(key)??0)+1);}
 for(const [key,count] of partnerCounts){const matchedCount=(multiset.get(key)??0);if(matchedCount>0){
  const [gro_id,receipt_sha256]=key.split("\u0000");for(let i=0;i<matchedCount;i++)extra.push({gro_id:gro_id||null,receipt_sha256:receipt_sha256||null});
 }}
 summary.partner_reconciliation={matched_count:matched.length,matched,missing_in_predge_count:missing.length,
  missing_in_predge:missing,extra_in_predge_count:extra.length,extra_in_predge:extra};
 return summary;
}

export function dailySummaryCsv(summary){
 const esc=v=>`"${String(v??"").replaceAll('"','""')}"`;
 const rows=[["record_type","day_utc","country_iso3","category","tier","created","sent_to_predge","delivered","failed","expected_geomacro_net_usd"],
  ["TOTAL",summary.day_utc,"","","",summary.created_total,summary.sent_to_predge_total,summary.delivered_total,summary.failed_total,summary.expected_geomacro_net_usd],
  ...Object.entries(summary.tier_breakdown).map(([tier,v])=>["TIER",summary.day_utc,"","",tier,v.created,v.sent_to_predge,v.delivered,v.failed,v.expected_geomacro_net_usd]),
  ...Object.values(summary.created_by_country_category).map(v=>["CELL",summary.day_utc,v.country_iso3,v.category,"",v.created_total,"","","",""])];
 return rows.map(r=>r.map(esc).join(",")).join("\n")+"\n";
}
