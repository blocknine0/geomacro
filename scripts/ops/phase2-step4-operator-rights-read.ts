#!/usr/bin/env bun
/**
 * Step 4 PRIVATE operator-only diagnostic. Run explicitly ONCE in the
 * Lovable server process/container that already owns the server-side secrets.
 * Never mount this behind HTTP, scheduled CI, a browser, or a public route.
 *
 * Order: runtime preflight -> authenticated D1 quota status (does not spend a
 * B2 ticket) -> at most ONE readB2CommercialSourceRights() invocation. That
 * existing reader performs its own atomic D1 GET reservation before S3 GET.
 * No Supabase, B2 PUT, D1 writes, wallet, customer output, or source payload.
 */
import { diagnoseB2RightsReadPrerequisites,
  readB2CommercialSourceRights } from "../../src/lib/b2-live.server";
import { certifiedWdiAttributionRights } from "../../src/lib/wdi-attributed-structural-product.server";

const URL="https://geomacro-control-plane.daspallab202391.workers.dev/v1/b2-quota/status";
type State="BLOCKED"|"RIGHTS_CERTIFIED";
export type QuotaCategory="AUTHENTICATED_HEADROOM"|"D1_AUTH_DENIED"|
  "D1_QUOTA_EXHAUSTED"|"D1_RESPONSE_INVALID"|"D1_UNAVAILABLE";
export function classifyQuotaStatus(http:number,payload:unknown):QuotaCategory{
  if(http===401||http===403)return "D1_AUTH_DENIED";
  if(http!==200)return "D1_UNAVAILABLE";
  if(!payload||typeof payload!=="object"||Array.isArray(payload))return "D1_RESPONSE_INVALID";
  const p=payload as Record<string,unknown>;
  const v=p.used as Record<string,unknown>|null;
  const lim=p.limits as Record<string,unknown>|null;
  if(p.ok!==true||p.schema!=="geomacro.b2-account-quota-status.v1"||
     !v||!lim||![v.GET,v.total,lim.GET,lim.total].every(n=>typeof n==="number"&&Number.isSafeInteger(n)&&n>=0))
    return "D1_RESPONSE_INVALID";
  return Number(v.GET)>=Number(lim.GET)||Number(v.total)>=Number(lim.total)
    ?"D1_QUOTA_EXHAUSTED":"AUTHENTICATED_HEADROOM";
}
export async function privateRightsCheckOnce(options:{
  getQuota?:typeof fetch;
  rightsReader?:typeof readB2CommercialSourceRights;
  prerequisites?:typeof diagnoseB2RightsReadPrerequisites;
  onceAuthorized?:boolean;
}={}):Promise<{
  schema:"geomacro.phase2-step4-operator-rights-diagnostic.v1";
  status:State;category:string;
  runtime_credentials_present:boolean;
  control_plane_token_present:boolean;
  quota_auth_status:number|null;
  quota_category:QuotaCategory|null;
  quota_reservation_bypassed:false;
  signed_s3_read_attempts_max:1;
  rights_row_count_logged:false;
  raw_rights_logged:false;
  real_funds_used:false;
}>{
  const pre=(options.prerequisites??diagnoseB2RightsReadPrerequisites)();
  const result=(status:State,category:string,http:number|null=null,quota:QuotaCategory|null=null)=>({
    schema:"geomacro.phase2-step4-operator-rights-diagnostic.v1" as const,
    status,category,
    runtime_credentials_present:pre.credentials_configured,
    control_plane_token_present:pre.control_plane_token_configured,
    quota_auth_status:http,quota_category:quota,
    quota_reservation_bypassed:false as const,
    signed_s3_read_attempts_max:1 as const,
    rights_row_count_logged:false as const,raw_rights_logged:false as const,
    real_funds_used:false as const,
  });
  if(!pre.credentials_configured)return result("BLOCKED","SERVER_B2_READ_CREDENTIALS_MISSING");
  if(!pre.control_plane_token_configured)return result("BLOCKED","SERVER_CONTROL_PLANE_TOKEN_MISSING");
  if(options.onceAuthorized!==true)return result("BLOCKED","EXPLICIT_ONE_READ_AUTHORIZATION_REQUIRED");
  const token=String(process.env.GEOMACRO_CONTROL_PLANE_TOKEN??process.env.CONTROL_PLANE_TOKEN??"").trim();
  // One authenticated, read-only D1 account quota status check, zero B2 tickets.
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
  // Only ONE call. No manual S3 GET or D1 reservation bypass is possible.
  let rows;
  try{rows=await (options.rightsReader??readB2CommercialSourceRights)();}
  catch{return result("BLOCKED","RIGHTS_READER_ERROR_AFTER_QUOTA_PREFLIGHT",http,category);}
  if(!rows)return result("BLOCKED","RIGHTS_B2_GET_OR_GZIP_SCHEMA_FRESHNESS_UNVERIFIED",http,category);
  const proof=certifiedWdiAttributionRights(rows);
  if(!proof.eligible)return result("BLOCKED",proof.reason,http,category);
  return result("RIGHTS_CERTIFIED","UNIQUE_CERTIFIED_WDI_ROW_AFTER_GOVERNED_READ",http,category);
}
if(import.meta.main){
  // Deliberately operator-triggered: not an automatic CI or recurrent task.
  const report=await privateRightsCheckOnce({
    onceAuthorized:process.env.GEOMACRO_OPERATOR_SINGLE_B2_RIGHTS_READ==="CONFIRMED_ONE",
  });
  process.stdout.write(JSON.stringify(report)+"\n");
  if(report.status!=="RIGHTS_CERTIFIED")process.exitCode=2;
}
