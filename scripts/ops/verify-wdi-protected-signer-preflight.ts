#!/usr/bin/env bun
/**
 * Manual production-only WDI signer/ledger prerequisite attestation.
 * Does NOT sign a product, consume B2 GET, mutate a Durable Object,
 * create a quote or settle funds. Never checks out unmerged PR code.
 * This is a deliberately bounded precursor, NOT WDI durable acceptance.
 */
import {createHash,createHmac,createPrivateKey,createPublicKey} from "node:crypto";
import {pinnedRiskObjectVerificationKeys} from "../../src/lib/risk-object-public-registry";
import {normalizeRiskObjectVerificationKeys} from "../../src/lib/risk-object-signing.server";

const EXPECTED_WORKER_VERSION="17331689-14e9-4587-9f36-fa82c4e3ec08";
const EXPECTED_WORKER_CONTRACT="geomacro.wdi-prequote-worker.v1";
const WDI_RIGHTS_GENERATED_AT="2026-10-13T22:04:53.102Z";
const APPROVAL="I_AUTHORIZE_SINGLE_WDI_SIGNER_PREFLIGHT_NO_FUNDS";
const LEDGER="https://geomacro-commerce-ledger.daspallab202391.workers.dev";
const QUOTA="https://geomacro-control-plane.daspallab202391.workers.dev/v1/b2-quota/status";
const SOURCE2="https://api.worldbank.org/v2/country/CHN/indicator/FP.CPI.TOTL.ZG?format=json&per_page=6&source=2";

export class SafeBlock extends Error {constructor(code:string){super(code);this.name="SafeBlock";}}
export function checkSignerAgainstPinnedActiveRegistry(env:Record<string,string|undefined>){
  const id=env.RISK_OBJECT_SIGNING_KEY_ID?.trim()??"";
  const secret=env.RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64?.trim()??"";
  if(!id)throw new SafeBlock("SIGNING_KEY_ID_MISSING");
  if(!secret)throw new SafeBlock("SIGNING_PRIVATE_KEY_MISSING");
  const registry=normalizeRiskObjectVerificationKeys(pinnedRiskObjectVerificationKeys());
  const key=registry[id];
  if(!key||key.status!=="active")throw new SafeBlock("SIGNING_KEY_NOT_ACTIVE_IN_PINNED_REGISTRY");
  let priv;
  try{priv=createPrivateKey({key:Buffer.from(secret,"base64"),format:"der",type:"pkcs8"});}
  catch{throw new SafeBlock("SIGNING_PRIVATE_KEY_INVALID");}
  if(priv.asymmetricKeyType!=="ed25519")throw new SafeBlock("SIGNING_KEY_NOT_ED25519");
  const derived=createPublicKey(priv).export({format:"der",type:"spki"}).toString("base64");
  if(derived!==key.public_key_spki_b64)
    throw new SafeBlock("SIGNER_MISMATCHES_INDEPENDENT_PINNED_PUBLIC_REGISTRY");
  if(env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64?.trim() &&
      env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64.trim()!==derived)
    throw new SafeBlock("EXPLICIT_PUBLIC_KEY_CONFLICT");
  const now=Date.now();
  if((key.not_before && now<Date.parse(key.not_before)) ||
     (key.not_after && now>=Date.parse(key.not_after)))
    throw new SafeBlock("SIGNING_KEY_OUTSIDE_ACTIVE_WINDOW");
  return {active_registered_key:true,scheme:"Ed25519",key_id:id};
}
function requirePresent(env:Record<string,string|undefined>,name:string,min=1){
  if((env[name]??"").trim().length<min)throw new SafeBlock("PROTECTED_"+name+"_MISSING");
}
async function jsonGet(url:string,headers:Record<string,string>={}){
  const res=await fetch(url,{headers:{Accept:"application/json",...headers},
    redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000)});
  if(res.status!==200)throw new SafeBlock("PROTECTED_HTTP_STATUS_"+res.status);
  const raw=await res.text();
  if(raw.length>50_000)throw new SafeBlock("PROTECTED_JSON_TOO_LARGE");
  try{return JSON.parse(raw);}catch{throw new SafeBlock("PROTECTED_JSON_INVALID");}
}
function verifySource2(body:unknown){
  if(!Array.isArray(body)||body.length!==2||!Array.isArray(body[1]))
    throw new SafeBlock("SOURCE2_FORMAT_INVALID");
  const meta=body[0] as {sourceid?:unknown;lastupdated?:unknown};
  if(meta?.sourceid!=="2"||typeof meta.lastupdated!=="string"||
    !/^\d{4}-\d{2}-\d{2}$/.test(meta.lastupdated)||
    !Number.isFinite(Date.parse(meta.lastupdated+"T00:00:00Z"))||
    Date.parse(meta.lastupdated+"T00:00:00Z")>Date.now())
    throw new SafeBlock("SOURCE2_METADATA_NOT_VERIFIED");
  const years=new Map<number,number>();let conflict=false;
  for(const x of (body[1] as unknown[]).slice(0,6)){
    if(!x||typeof x!=="object")continue;
    const r=x as {date?:unknown;value?:unknown;countryiso3code?:unknown;indicator?:{id?:unknown}};
    if(typeof r.date!=="string"||!/^\d{4}$/.test(r.date)||
      r.countryiso3code!=="CHN"||
      (r.indicator?.id!==undefined&&r.indicator.id!=="FP.CPI.TOTL.ZG")||
      typeof r.value!=="number"||!Number.isFinite(r.value))continue;
    const year=Number(r.date);if(year<1960||year>new Date().getUTCFullYear())continue;
    if(years.has(year)&&years.get(year)!==r.value)conflict=true;
    years.set(year,r.value);
  }
  const sorted=[...years.keys()].sort((a,b)=>b-a);
  if(conflict||sorted.length<2||sorted[0]!==sorted[1]+1)
    throw new SafeBlock("SOURCE2_CONSECUTIVE_ANNUAL_PAIR_UNVERIFIED");
  const age=Date.now()-Date.parse(sorted[0]+"-12-31T23:59:59Z");
  if(age<0||age>400*86400_000)
    throw new SafeBlock("SOURCE2_ANNUAL_PERIOD_TOO_OLD");
  return {source_api_id:"2",latest_year:sorted[0],previous_year:sorted[1],
    dataset_lastupdated:meta.lastupdated,source2_structural_pair_verified:true};
}
export async function protectedPreflight(env:Record<string,string|undefined>=process.env){
  if(env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
     env.GITHUB_REF!=="refs/heads/main"||
     env.GITHUB_EVENT_NAME!=="workflow_dispatch"||
     env.GITHUB_ACTOR!=="blocknine0"||
     env.GITHUB_RUN_ATTEMPT!=="1"||
     env.GEOMACRO_WDI_OPERATOR_ACK!==APPROVAL)
    throw new SafeBlock("OWNER_ONE_SHOT_MAIN_DISPATCH_REQUIRED");
  requirePresent(env,"RISK_OBJECT_SIGNING_KEY_ID");
  requirePresent(env,"RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64",32);
  requirePresent(env,"B2_ARCHIVE_READ_KEY_ID");
  requirePresent(env,"B2_ARCHIVE_READ_APPLICATION_KEY");
  requirePresent(env,"GEOMACRO_COMMERCE_LEDGER_TOKEN",32);
  requirePresent(env,"CLOUDFLARE_API_TOKEN");
  requirePresent(env,"CLOUDFLARE_ACCOUNT_ID");
  requirePresent(env,"COINBASE_X402_PAY_TO");
  requirePresent(env,"COINBASE_X402_PRICE_USDC");
  if(!/^0x[0-9a-f]{40}$/i.test(env.COINBASE_X402_PAY_TO!.trim())||
     !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(env.COINBASE_X402_PRICE_USDC!.trim())||
     Number(env.COINBASE_X402_PRICE_USDC)<=0)
    throw new SafeBlock("EXPLICIT_PAYMENT_TERMS_INVALID");
  // Rights expiry is immutable. This read-only preflight must not renew it.
  if(Date.now()>=Date.parse(WDI_RIGHTS_GENERATED_AT)+24*3600_000)
    throw new SafeBlock("PINNED_RIGHTS_RECEIPT_EXPIRED_GENUINE_REFRESH_REQUIRED");
  const key=checkSignerAgainstPinnedActiveRegistry(env);

  // Authenticate the Cloudflare API deployment inventory, not just /health.
  const cloudflare=await jsonGet("https://api.cloudflare.com/client/v4/accounts/"+
    encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID!.trim())+
    "/workers/scripts/geomacro-commerce-ledger/deployments",{
      Authorization:"Bearer "+env.CLOUDFLARE_API_TOKEN!.trim(),
    });
  const deployments=cloudflare?.result?.deployments;
  const current=Array.isArray(deployments)?deployments[0]:null;
  if(cloudflare?.success!==true||!current||!Array.isArray(current.versions)||
     current.versions.length!==1||
     current.versions[0]?.version_id!==EXPECTED_WORKER_VERSION||
     Number(current.versions[0]?.percentage)!==100)
    throw new SafeBlock("CLOUDFLARE_PINNED_WORKER_VERSION_UNVERIFIED");
  const health=await jsonGet(LEDGER+"/health");
  if(health?.ok!==true||health?.service!=="geomacro-commerce-ledger"||
     health?.storage!=="durable_objects_sqlite"||
     health?.wdi_prequote_contract_version!==EXPECTED_WORKER_CONTRACT||
     health?.wdi_prequote_available!==true||
     !["delivery","usage_guard","product_audit"].every(x=>health?.capabilities?.includes(x)))
    throw new SafeBlock("DEPLOYED_WORKER_CONTRACT_NOT_VERIFIED");
  // Valid operator bearer is tested read-only via an unavailable synthetic hash.
  const token=env.GEOMACRO_COMMERCE_LEDGER_TOKEN!.trim();
  const probe=async(t:string)=>fetch(LEDGER+"/v1/delivery/wdi-prequote-readback",{
    method:"POST",headers:{"content-type":"application/json",Authorization:"Bearer "+t},
    body:JSON.stringify({provider:"acceptance",providerEnvironment:"prelaunch",
      bindingHash:createHash("sha256").update("preflight-absent-no-write").digest("hex")}),
    redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000)});
  const unauth=await probe("not-valid");
  if(unauth.status!==401)throw new SafeBlock("LEDGER_UNAUTHORIZED_REQUEST_NOT_REJECTED");
  const authenticated=await probe(token);
  if(authenticated.status!==409)throw new SafeBlock("LEDGER_AUTHENTICATED_READBACK_NOT_VERIFIED");
  // Authenticate D1 status without consuming any B2 quota.
  const d1token=createHmac("sha256",token).update("geomacro-control-plane-v1").digest("hex");
  const quota=await jsonGet(QUOTA,{Authorization:"Bearer "+d1token});
  if(quota?.ok!==true||quota?.schema!=="geomacro.b2-account-quota-status.v1"||
     quota?.day_utc!==new Date().toISOString().slice(0,10))
    throw new SafeBlock("D1_AUTHENTICATED_QUOTA_STATUS_INVALID");
  const source=verifySource2(await jsonGet(SOURCE2));
  return {
    schema:"geomacro.wdi-protected-signer-readonly-preflight.v1",
    status:"PREREQUISITES_VERIFIED_SIGNING_AND_DURABLE_FREEZE_NOT_EXECUTED",
    worker_version_id:EXPECTED_WORKER_VERSION,worker_contract:EXPECTED_WORKER_CONTRACT,
    signing_key_id:key.key_id,active_registered_ed25519_signer:true,
    cloudflare_deployment_authenticated:true,ledger_authentication_verified:true,
    d1_quota_status_authenticated:true,b2_credentials_present:true,
    source2:source,rights_receipt_read:false,d1_get_reserved:false,
    frozen_signed_customer_bytes:false,two_independent_readbacks:false,
    canonical_x402_paid_offer_enabled:false,
    quote_authorized:false,payment_authorized:false,settlement_attempted:false
  };
}
if(import.meta.main){
  try{const report=await protectedPreflight();
    process.stdout.write(JSON.stringify(report)+"\n");
  }catch(error){
    process.stdout.write(JSON.stringify({
      schema:"geomacro.wdi-protected-signer-readonly-preflight.v1",
      status:"BLOCKED",category:error instanceof SafeBlock?error.message:"SAFE_PREFLIGHT_UNAVAILABLE",
      quote_authorized:false,payment_authorized:false,settlement_attempted:false,
      frozen_signed_customer_bytes:false})+"\n");
    process.exitCode=2;
  }
}
