const HEX=/^[a-f0-9]{64}$/u;
const ISO3=/^[A-Z]{3}$/u;
const CATEGORIES=new Set(["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]);
const TIERS=new Set(["BASIC","STANDARD","COMPLEX"]);
const PRICES=Object.freeze({
 BASIC:{customer:0.15,net:0.10},STANDARD:{customer:0.20,net:0.15},
 COMPLEX:{customer:0.30,net:0.25}
});
const sha=async value=>{
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
 return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
};

/** Append an observational delivery event. A ledger failure must never gate delivery. */
export async function recordPredgeDeliveryEvent(db,event){
 try{
  if(typeof db?.prepare!=="function"||!event||typeof event!=="object")return false;
  const {endpoint_version,request_id,gro_id,receipt_sha256,day_utc,country_iso3,
   category,tier,delivery_status,created_at}=event;
  if(!["v1","v2"].includes(endpoint_version)||
     typeof request_id!=="string"||!request_id||request_id.length>256||
     (gro_id!==null&&gro_id!==undefined&&!HEX.test(String(gro_id)))||
     !HEX.test(String(receipt_sha256??""))||
     !/^\d{4}-\d{2}-\d{2}$/u.test(String(day_utc??""))||
     !ISO3.test(String(country_iso3??""))||!CATEGORIES.has(category)||
     !TIERS.has(tier)||!["SENT","DELIVERED","FAILED"].includes(delivery_status)||
     !Number.isFinite(Date.parse(created_at))||
     new Date(Date.parse(created_at)).toISOString().slice(0,10)!==day_utc)return false;
  const terms=PRICES[tier];
  const delivery_event_id=await sha(["geomacro.predge-delivery-event.v1",endpoint_version,
   request_id,gro_id??"",receipt_sha256,day_utc,delivery_status,created_at].join("\n"));
  await db.prepare(`INSERT OR IGNORE INTO predge_risk_gate_delivery_ledger
   (delivery_event_id,endpoint_version,request_id,gro_id,receipt_sha256,day_utc,
    country_iso3,category,tier,customer_price_usd,geomacro_net_usd,predge_fee_usd,
    delivery_status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
   .bind(delivery_event_id,endpoint_version,request_id,gro_id??null,receipt_sha256,
    day_utc,country_iso3,category,tier,terms.customer,terms.net,0.05,
    delivery_status,new Date(Date.parse(created_at)).toISOString()).run();
  return true;
 }catch{return false;}
}
