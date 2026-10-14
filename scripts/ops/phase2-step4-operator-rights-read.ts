#!/usr/bin/env bun
/**
 * PRIVATE one-off operator process ONLY; never a route, CI job or browser code.
 * Checks a supplied receipt SHA/generation against a fresh, governed B2 GET.
 * Environment holds only already-configured server credentials. No inventory,
 * signed answer, customer data, secrets, payments or raw objects are printed.
 */
import {
  diagnoseB2RightsReadPrerequisites,
  readB2CommercialSourceRightsReceipt,
} from "../../src/lib/b2-live.server";
import { certifiedWdiAttributionRights } from "../../src/lib/wdi-attributed-structural-product.server";

const URL="https://geomacro-control-plane.daspallab202391.workers.dev/v1/b2-quota/status";
const SHA=/^[a-f0-9]{64}$/u;
type State="BLOCKED"|"RIGHTS_CERTIFIED";
export type QuotaCategory="AUTHENTICATED_HEADROOM"|"D1_AUTH_DENIED"|
  "D1_QUOTA_EXHAUSTED"|"D1_RESPONSE_INVALID"|"D1_UNAVAILABLE";
export function classifyQuotaStatus(http:number,payload:unknown):QuotaCategory{
  if(http===401||http===403)return "D1_AUTH_DENIED";
  if(http===429)return "D1_QUOTA_EXHAUSTED";
  if(http!==200)return "D1_UNAVAILABLE";
  if(!payload||typeof payload!=="object"||Array.isArray(payload))return "D1_RESPONSE_INVALID";
  const p=payload as Record<string,unknown>;
  const v=p.used as Record<string,unknown>|null;
  const lim=p.limits as Record<string,unknown>|null;
  if(p.ok!==true||p.schema!=="geomacro.b2-account-quota-status.v1"||
     !v||!lim||![v.GET,v.total,lim.GET,lim.total].every(n=>
       typeof n==="number"&&Number.isSafeInteger(n)&&n>=0))
    return "D1_RESPONSE_INVALID";
  return Number(v.GET)>=Number(lim.GET)||Number(v.total)>=Number(lim.total)
    ?"D1_QUOTA_EXHAUSTED":"AUTHENTICATED_HEADROOM";
}
export async function privateRightsCheckOnce(options:{
  getQuota?:typeof fetch;
  rightsReader?:typeof readB2CommercialSourceRightsReceipt;
  prerequisites?:typeof diagnoseB2RightsReadPrerequisites;
  onceAuthorized?:boolean;
  expectedCompressedSha256?:string;
  expectedGeneratedAt?:string;
}={}):Promise<{
  schema:"geomacro.phase2-step4-operator-rights-diagnostic.v2";
  status:State;category:string;
  runtime_credentials_present:boolean;
  control_plane_token_present:boolean;
  quota_auth_status:number|null;
  quota_category:QuotaCategory|null;
  fresh_d1_reservation_and_b2_get_verified:boolean;
  exact_b2_receipt_matched:boolean;
  quota_reservation_bypassed:false;
  signed_s3_read_attempts_max:1;
  rights_row_count_logged:false;
  raw_rights_logged:false;
  real_funds_used:false;
}>{
  const pre=(options.prerequisites??diagnoseB2RightsReadPrerequisites)();
  const result=(status:State,category:string,http:number|null=null,
    quota:QuotaCategory|null=null,reserved=false,receiptMatched=false)=>({
    schema:"geomacro.phase2-step4-operator-rights-diagnostic.v2" as const,
    status,category,
    runtime_credentials_present:pre.credentials_configured,
    control_plane_token_present:pre.control_plane_token_configured,
    quota_auth_status:http,quota_category:quota,
    fresh_d1_reservation_and_b2_get_verified:reserved,
    exact_b2_receipt_matched:receiptMatched,
    quota_reservation_bypassed:false as const,
    signed_s3_read_attempts_max:1 as const,
    rights_row_count_logged:false as const,raw_rights_logged:false as const,
    real_funds_used:false as const,
  });
  if(!pre.credentials_configured)return result("BLOCKED","SERVER_B2_READ_CREDENTIALS_MISSING");
  if(!pre.control_plane_token_configured)return result("BLOCKED","SERVER_CONTROL_PLANE_TOKEN_MISSING");
  if(options.onceAuthorized!==true)return result("BLOCKED","EXPLICIT_ONE_READ_AUTHORIZATION_REQUIRED");
  const expectedSha=(options.expectedCompressedSha256??
    process.env.GEOMACRO_OPERATOR_RIGHTS_EXPECTED_SHA256??"").trim();
  const expectedAt=(options.expectedGeneratedAt??
    process.env.GEOMACRO_OPERATOR_RIGHTS_EXPECTED_GENERATED_AT??"").trim();
  if(!SHA.test(expectedSha)||!Number.isFinite(Date.parse(expectedAt))||
     new Date(expectedAt).toISOString()!==expectedAt)
    return result("BLOCKED","EXPECTED_B2_RECEIPT_METADATA_REQUIRED");
  const token=String(process.env.GEOMACRO_CONTROL_PLANE_TOKEN??
    process.env.CONTROL_PLANE_TOKEN??"").trim();
  // Authenticated D1 STATUS is read-only; it is NOT a B2 quota reservation.
  let http:number|null=null,category:QuotaCategory|null=null;
  try{
    const response=await (options.getQuota??fetch)(URL,{
      method:"GET",headers:{Authorization:"Bearer "+token,Accept:"application/json"},
      redirect:"error",cache:"no-store",signal:AbortSignal.timeout(4_000),
    });
    http=response.status;
    const data=response.status===200?await response.json():null;
    category=classifyQuotaStatus(http,data);
  }catch{
    category="D1_UNAVAILABLE";
  }
  if(category!=="AUTHENTICATED_HEADROOM")
    return result("BLOCKED",category??"D1_UNAVAILABLE",http,category);
  // This path bypasses the app's 2-minute B2 memory cache, but NOT admission.
  // signedGetOnce requests a real D1 reservation before the single S3 GET.
  let receipt;
  try{receipt=await (options.rightsReader??readB2CommercialSourceRightsReceipt)(
    {freshQuotaReservedGet:true});}
  catch{return result("BLOCKED","RIGHTS_READER_ERROR_AFTER_QUOTA_PREFLIGHT",http,category);}
  if(!receipt)return result("BLOCKED","RIGHTS_B2_GET_OR_GZIP_SCHEMA_FRESHNESS_UNVERIFIED",http,category);
  if(receipt.fresh_quota_reserved_get!==true)
    return result("BLOCKED","FRESH_QUOTA_RESERVED_B2_GET_NOT_PROVEN",http,category);
  if(receipt.compressed_sha256!==expectedSha)
    return result("BLOCKED","RIGHTS_RECEIPT_CHECKSUM_MISMATCH",http,category,true);
  if(receipt.generated_at!==expectedAt)
    return result("BLOCKED","RIGHTS_RECEIPT_GENERATION_MISMATCH",http,category,true);
  const proof=certifiedWdiAttributionRights(receipt.rows);
  if(!proof.eligible)return result("BLOCKED",proof.reason,http,category,true,true);
  return result("RIGHTS_CERTIFIED",
    "UNIQUE_CERTIFIED_WDI_ROW_EXACT_RECEIPT_FRESH_D1_RESERVED_GET",
    http,category,true,true);
}
if(import.meta.main){
  // Explicitly invoke only on the trusted published server runtime.
  const report=await privateRightsCheckOnce({
    onceAuthorized:process.env.GEOMACRO_OPERATOR_SINGLE_B2_RIGHTS_READ==="CONFIRMED_ONE",
  });
  process.stdout.write(JSON.stringify(report)+"\n");
  if(report.status!=="RIGHTS_CERTIFIED")process.exitCode=2;
}
