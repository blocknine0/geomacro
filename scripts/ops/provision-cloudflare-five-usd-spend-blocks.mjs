#!/usr/bin/env node
/**
 * Cloudflare provider-side spend-block provisioning for GeoMacro.
 * NEVER upgrades any plan, activates R2, mutates subscriptions or handles money.
 * Explicit owner confirmation + a scoped Billing Write token are mandatory.
 * Requires the actual Cloudflare API availability; no fallback to email alerts.
 *
 * These 1-cent product usage blocks do NOT guarantee <=$5 invoiced.
 */
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {FIVE_USD_PRODUCTS} from "../lib/cloudflare-five-usd-spend-guard.mjs";
const ACCOUNT=/^[a-f0-9]{32}$/i;
const API="https://api.cloudflare.com/client/v4/accounts/";
export const CONFIRM="LOCK_ONE_CENT_WORKERS_AND_DURABLE_OBJECTS_NO_PLAN_CHANGE";
function validPolicies(body){
 if(body?.success!==true||!Array.isArray(body.result)||body.result.length>100||
    Number(body.result_info?.total_count??body.result.length)>body.result.length||
    body.errors?.length)throw Error("SPEND_BLOCK_PROVIDER_LIST_INVALID");
 return body.result;
}
export function planSpendBlockCreation(existing){
 if(!Array.isArray(existing))throw Error("SPEND_BLOCK_EXISTING_LIST_INVALID");
 const missing=[];
 for(const product_id of FIVE_USD_PRODUCTS){
  const enabled=existing.filter(x=>x.product_id===product_id&&
    x.enabled===true&&x.action==="usage_block");
  if(enabled.length>1||
     enabled.some(x=>x.threshold_cents!==1))
    throw Error("SPEND_BLOCK_CONFLICTING_ENABLED_POLICY_"+product_id.toUpperCase());
  if(enabled.length===0)missing.push({
    name:"GeoMacro $5 safety - "+product_id+" usage block",
    product_id,action:"usage_block",enabled:true,threshold_cents:1,
  });
 }
 return missing;
}
export async function provisionFiveUsdSpendBlocks({
 env=process.env,fetchImpl=fetch,apply=false,
}={}){
 if(apply!==true||env.GEOMACRO_CLOUDFLARE_COST_GUARD_CONFIRM!==CONFIRM)
  return Object.freeze({status:"NO_PROVIDER_CHANGE_DRY_RUN",
    needs_owner_confirmation:true,plan_changed:false});
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_BILLING_WRITE_TOKEN;
 if(typeof account!=="string"||!ACCOUNT.test(account)||
    typeof token!=="string"||token.length<20)
  throw Error("CLOUDFLARE_BILLING_WRITE_TOKEN_ACCOUNT_REQUIRED");
 const url=API+account+"/billing/spend-policies";
 const authHeaders={Authorization:"Bearer "+token,Accept:"application/json"};
 const retrieve=async()=>{
  let response;
  try{response=await fetchImpl(url,{method:"GET",redirect:"error",
    cache:"no-store",headers:authHeaders,signal:AbortSignal.timeout(12000)})}
  catch{throw Error("SPEND_BLOCK_PROVIDER_GET_UNAVAILABLE")}
  if(response.status!==200)throw Error("SPEND_BLOCK_PROVIDER_GET_REJECTED");
  let body;try{body=await response.json()}catch{throw Error("SPEND_BLOCK_PROVIDER_JSON_INVALID")}
  return validPolicies(body);
 };
 const before=await retrieve();
 const missing=planSpendBlockCreation(before);
 let created=0;
 for(const policy of missing){
  let response;
  try{response=await fetchImpl(url,{method:"POST",redirect:"error",
   headers:{...authHeaders,"Content-Type":"application/json"},
   body:JSON.stringify(policy),signal:AbortSignal.timeout(12000)})}
  catch{throw Error("SPEND_BLOCK_PROVIDER_POST_UNAVAILABLE")}
  if(response.status!==200&&response.status!==201)
    throw Error("SPEND_BLOCK_PROVIDER_POST_REJECTED");
  let body;try{body=await response.json()}catch{throw Error("SPEND_BLOCK_PROVIDER_POST_JSON_INVALID")}
  if(body?.success!==true||body.result?.product_id!==policy.product_id||
     body.result?.action!=="usage_block"||
     body.result?.threshold_cents!==1||body.result?.enabled!==true)
    throw Error("SPEND_BLOCK_PROVIDER_POST_RECEIPT_INVALID");
  created++;
 }
 const after=await retrieve();
 if(planSpendBlockCreation(after).length)
  throw Error("SPEND_BLOCK_PROVIDER_READBACK_INCOMPLETE");
 return Object.freeze({status:"PROVIDER_PRODUCT_USAGE_BLOCKS_CONFIGURED",
  created,provider_readback:true,products:[...FIVE_USD_PRODUCTS],
  threshold_cents_per_product:1,plan_changed:false,payment_performed:false,
  d1_and_other_products_hard_capped:false,invoice_5_usd_guaranteed:false});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const result=await provisionFiveUsdSpendBlocks({apply:process.argv.includes("--apply")});
  // Never print account ID, token or other billing-account details.
  console.log(JSON.stringify(result));
 }catch(error){
  console.error("::error::"+(error instanceof Error?error.message:"UNKNOWN_SPEND_BLOCK_FAILURE"));
  process.exitCode=1;
 }
}
