/**
 * GeoMacro central $5 Workers Paid COST GUARD (not a $5 invoice guarantee).
 *
 * Cloudflare's enabled usage_block spend policy can stop Workers and Durable
 * Objects after product-metered threshold crossing. It does NOT cap D1, R2,
 * KV, Queues, taxes, the $5 subscription, or other account charges; metering
 * and enforcement may lag. Therefore this is an admission prerequisite, not
 * a universal hard-billing limit. Never treat an email budget alert as a lock.
 *
 * This module is READ-ONLY. It cannot create subscriptions/spend policies.
 */
export const FIVE_USD_SPEND_GUARD_SCHEMA="geomacro.cloudflare-five-usd-spend-lock.v1";
export const FIVE_USD_MINIMUM_THRESHOLD_CENTS=1;
export const FIVE_USD_PRODUCTS=Object.freeze(["workers","durable_objects"]);
const ACCOUNT=/^[0-9a-f]{32}$/i;
const VALID_STATES=new Set(["below_limit","limit_reached"]);

/** Fail closed on unknown/paginated/spoofed/inactive/non-blocking policies. */
export function assessFiveUsdSpendPolicies(body,now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    body?.success!==true||!Array.isArray(body.result)||
    body.result.length>100||body.errors?.length||
    Number(body.result_info?.total_count??body.result.length)>body.result.length)
   throw Error("CLOUDFLARE_FIVE_USD_SPEND_POLICIES_UNVERIFIED");
 const found=[];
 for(const product_id of FIVE_USD_PRODUCTS){
   const matching=body.result.filter(p=>p?.product_id===product_id&&
     p.enabled===true&&p.action==="usage_block");
   if(matching.length!==1)throw Error("CLOUDFLARE_FIVE_USD_USAGE_BLOCK_MISSING_"+product_id.toUpperCase());
   const p=matching[0];
   if(!Number.isSafeInteger(p.threshold_cents)||p.threshold_cents!==FIVE_USD_MINIMUM_THRESHOLD_CENTS||
      typeof p.id!=="string"||p.id.length<1||
      !Number.isSafeInteger(p.version)||p.version<1)
     throw Error("CLOUDFLARE_FIVE_USD_USAGE_BLOCK_INVALID_"+product_id.toUpperCase());
   // A provider outage cannot be mistaken for "below limit". A policy may
   // legitimately have no current_state when the API omits expensive reads;
   // that is NOT sufficient evidence to unlock Paid intake.
   const state=p.current_state?.status??p.current_state?.state;
   if(!VALID_STATES.has(state))
     throw Error("CLOUDFLARE_FIVE_USD_USAGE_BLOCK_STATE_UNVERIFIED_"+product_id.toUpperCase());
   if(state==="limit_reached")
     throw Error("CLOUDFLARE_FIVE_USD_USAGE_BLOCK_ALREADY_REACHED_"+product_id.toUpperCase());
   found.push(product_id);
 }
 return Object.freeze({
   schema:FIVE_USD_SPEND_GUARD_SCHEMA,verified:true,
   source:"CLOUDFLARE_ACCOUNT_READONLY_SPEND_POLICIES",
   observed_at:now.toISOString(), products:found,
   usage_block_threshold_cents:FIVE_USD_MINIMUM_THRESHOLD_CENTS,
   account_wide_zero_overage_guaranteed:false,
   d1_spend_hard_capped:false,
   subscription_changed:false,spend_policy_changed:false,
 });
}
export async function readFiveUsdSpendGuard({
 env=process.env,fetchImpl=fetch,now=new Date(),
}={}){
 const token=env.CLOUDFLARE_BILLING_READ_TOKEN;
 const account=env.CLOUDFLARE_ACCOUNT_ID;
 if(typeof token!=="string"||token.length<20||
    typeof account!=="string"||!ACCOUNT.test(account))
   throw Error("CLOUDFLARE_FIVE_USD_BILLING_READ_PERMISSION_REQUIRED");
 let response;
 try{
   response=await fetchImpl(
     "https://api.cloudflare.com/client/v4/accounts/"+account+"/billing/spend-policies",{
       method:"GET",redirect:"error",cache:"no-store",
       headers:{Authorization:"Bearer "+token,Accept:"application/json"},
       signal:AbortSignal.timeout(12000),
     });
 }catch{throw Error("CLOUDFLARE_FIVE_USD_SPEND_POLICIES_UNAVAILABLE")}
 if(response?.status!==200)throw Error("CLOUDFLARE_FIVE_USD_SPEND_POLICIES_READ_REJECTED");
 let body;
 try{body=await response.json()}catch{
   throw Error("CLOUDFLARE_FIVE_USD_SPEND_POLICIES_INVALID_JSON");
 }
 return assessFiveUsdSpendPolicies(body,now);
}
