#!/usr/bin/env node
/**
 * #1827 Supabase-free, B2-free commercial GRO continuity observer.
 *
 * Unlike the legacy publisher, this NEVER signs or creates GROs, updates D1,
 * reads B2, touches Supabase or calls x402. Query only the existing D1 hot
 * rows, independently verify every current canonical signed object with the
 * live public trust registry, and output source-free aggregate counts.
 *
 * A successful observation is NOT a successful 195-country launch. The
 * observed collection is not the authoritative country universe registry.
 */
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalRiskObjectJson,
  verifyRiskObjectSignature,
  type RiskObjectVerificationKeys,
} from "../../src/lib/risk-object-signing.server";
import { verifyCommercialRiskObjectArtifact } from "../../src/lib/commercial-risk-object-policy";
import { loadPublicRiskObjectVerificationKeys } from "../../src/lib/d1-country-gro-hot.server";

const D1_NAME="geomacro-control-plane";
const API="https://api.cloudflare.com/client/v4";
export const MAX_HOT_GRO_ROWS=260;
export const D1_AUDIT_PAGE_SIZE=15;
export const D1_AUDIT_MAX_REQUESTS=1+Math.ceil((MAX_HOT_GRO_ROWS+1)/D1_AUDIT_PAGE_SIZE);
const HASH=/^[a-f0-9]{64}$/u;
const ISO3=/^[A-Z]{3}$/u;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const sha256=(raw:string)=>createHash("sha256").update(raw,"utf8").digest("hex");
function guard(ok:unknown,code:string):asserts ok {if(!ok)throw new Error(code);}

export type HotCountryRow = Record<string,unknown>;
export type HotCountryAuditor = (object:Record<string,any>, now:Date)=>boolean;
export function evaluateD1HotCountryGroRows(
  rows:HotCountryRow[],{at=new Date(), verifyArtifact}:{
    at?:Date,verifyArtifact:HotCountryAuditor,
  },
) {
  guard(Array.isArray(rows) && rows.length<=MAX_HOT_GRO_ROWS,
    "COUNTRY_GRO_D1_AUDIT_ROWS_UNBOUNDED");
  guard(Number.isFinite(at.getTime()) && typeof verifyArtifact==="function",
    "COUNTRY_GRO_D1_AUDIT_CONFIG_INVALID");
  const accepted:string[]=[];
  let rejected=0,expired=0;
  const seen=new Set<string>();
  for(const row of rows) {
    const country=String(row?.country_iso3??"");
    if(!ISO3.test(country) || seen.has(country)) {
      // Duplicate country rows would make the coverage denominator ambiguous.
      throw new Error("COUNTRY_GRO_D1_AUDIT_DUPLICATE_OR_INVALID_COUNTRY");
    }
    seen.add(country);
    const expiresMs=Date.parse(String(row.expires_at??""));
    const generatedMs=Date.parse(String(row.generated_at??""));
    if(!Number.isFinite(expiresMs)||expiresMs<=at.getTime()){
      expired++;continue;
    }
    if(!Number.isFinite(generatedMs)||generatedMs>at.getTime()+5*60_000) {
      rejected++;continue;
    }
    const raw=String(row.object_json??"");
    if(row.archive_write_acknowledged!==1 || raw.length===0 ||
       Buffer.byteLength(raw,"utf8")>512*1024 ||
       !HASH.test(String(row.record_sha256??"")) ||
       !HASH.test(String(row.archive_sha256??"")) ||
       !HASH.test(String(row.payload_hash??"")) ||
       !String(row.archive_key??"").startsWith("geomacro-evidence/v1/live/country-gro/") ||
       sha256(raw)!==row.record_sha256){
      rejected++;continue;
    }
    let object:Record<string,any>;
    try {object=JSON.parse(raw);}catch {rejected++;continue;}
    try {
      if(!object||typeof object!=="object"||Array.isArray(object) ||
         object.subject?.type!=="country" || object.subject?.id!==country ||
         object.object_id!==row.object_id ||
         object.schema_version!==row.schema_version ||
         object.generated_at!==row.generated_at ||
         object.expires_at!==row.expires_at ||
         object.integrity?.payload_hash!==row.payload_hash ||
         object.integrity?.signing_key_id!==row.signing_key_id ||
         object.verification?.status!=="VERIFIED" ||
         object.commercial_eligibility?.status!=="VERIFIED" ||
         sha256(canonicalRiskObjectJson(object))!==row.record_sha256 ||
         verifyArtifact(object,at)!==true) {
        rejected++;continue;
      }
    } catch {rejected++;continue;}
    accepted.push(country);
  }
  return {
    schema:"geomacro.country-gro-d1-hot-readonly-coverage-audit.v1",
    ok:true,
    audit_only:true,
    input_store:"cloudflare-d1",
    archive_store:"backblaze-b2",
    observed_at:at.toISOString(),
    d1_hot_row_count:rows.length,
    cryptographically_verified_current_d1_hot_count:accepted.length,
    invalid_or_ineligible_count:rejected,
    expired_count:expired,
    d1_hot_195_count_threshold_met:accepted.length>=195,
    // 195 distinct rows is NOT a proof of coverage of the authoritative
    // sovereign+special subjects, nor all three domains.
    global_195_country_coverage_claimed:false,
    three_domain_195_country_coverage_claimed:false,
    commercial_launch_accepted:false,
    public_freshness_advanced:false,
    missing_country_profiles_synthesized:0,
    b2_get_requests:0,
    b2_put_requests:0,
    supabase_reads:0,
    supabase_writes:0,
    d1_writes:0,
    signing_operations:0,
    x402_payment_attempted:false,
    external_payment_performed:false,
  };
}

async function safeCfJson(url:string,fetchImpl:typeof fetch,token:string,body?:object){
  const response=await fetchImpl(url,{
    method:body?"POST":"GET",
    headers:{
      authorization:`Bearer ${token}`,
      accept:"application/json",
      ...(body?{"content-type":"application/json"}:{}),
    },
    ...(body?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(15_000),
    redirect:"error",
  });
  guard(response.ok,"COUNTRY_GRO_D1_AUDIT_CLOUDFLARE_REQUEST_FAILED");
  const size=Number(response.headers.get("content-length")??0);
  guard(size<=12*1024*1024,"COUNTRY_GRO_D1_AUDIT_RESPONSE_TOO_LARGE");
  const raw=await response.text();
  guard(Buffer.byteLength(raw,"utf8")<=12*1024*1024,
    "COUNTRY_GRO_D1_AUDIT_RESPONSE_TOO_LARGE");
  let payload:any;
  try{payload=JSON.parse(raw);}catch{
    throw new Error("COUNTRY_GRO_D1_AUDIT_RESPONSE_INVALID");
  }
  guard(payload?.success===true && Array.isArray(payload.result),
    "COUNTRY_GRO_D1_AUDIT_PROVIDER_ERROR");
  return payload.result;
}

export async function auditD1HotCountryGro({
  accountId,apiToken,fetchImpl=fetch,at=new Date(),
  verificationKeys,
}:{
  accountId:string,apiToken:string,fetchImpl?:typeof fetch,at?:Date,
  verificationKeys?:RiskObjectVerificationKeys|null,
}){
  guard(/^[a-f0-9]{32}$/iu.test(accountId) &&
    typeof apiToken==="string" && apiToken.length>=20,
    "COUNTRY_GRO_D1_AUDIT_AUTH_INVALID");
  const list=await safeCfJson(
    `${API}/accounts/${accountId}/d1/database?name=${encodeURIComponent(D1_NAME)}&per_page=10`,
    fetchImpl,apiToken,
  );
  const matching=list.filter((x:any)=>x?.name===D1_NAME);
  guard(matching.length===1 &&
    UUID.test(String(matching[0]?.uuid??matching[0]?.id??"")),
    "COUNTRY_GRO_D1_AUDIT_DB_NOT_UNIQUE");
  const id=String(matching[0].uuid??matching[0].id);
  const queryUrl=`${API}/accounts/${accountId}/d1/database/${id}/query`;
  const rows:HotCountryRow[]=[];
  let calls=1;
  while(rows.length<=MAX_HOT_GRO_ROWS) {
    const query={
      batch:[{
        sql:"SELECT country_iso3,object_id,schema_version,generated_at,expires_at,signing_key_id,payload_hash,record_sha256,archive_key,archive_sha256,archive_write_acknowledged,object_json FROM country_gro_verified_hot ORDER BY country_iso3 LIMIT ? OFFSET ?",
        params:[String(D1_AUDIT_PAGE_SIZE),String(rows.length)],
      }],
    };
    const batch=await safeCfJson(queryUrl,fetchImpl,apiToken,query);
    calls++;
    guard(batch.length===1 && batch[0]?.success===true &&
      Array.isArray(batch[0]?.results) &&
      batch[0].results.length<=D1_AUDIT_PAGE_SIZE,
      "COUNTRY_GRO_D1_AUDIT_QUERY_INVALID");
    const page=batch[0].results as HotCountryRow[];
    rows.push(...page);
    guard(rows.length<=MAX_HOT_GRO_ROWS,
      "COUNTRY_GRO_D1_AUDIT_ROWS_UNBOUNDED");
    if(page.length<D1_AUDIT_PAGE_SIZE) break;
    guard(calls<D1_AUDIT_MAX_REQUESTS,"COUNTRY_GRO_D1_AUDIT_REQUEST_LIMIT");
  }
  let trust=verificationKeys;
  if(rows.length>0){
    if(trust===undefined)trust=await loadPublicRiskObjectVerificationKeys();
    guard(trust&&Object.keys(trust).length>0,"COUNTRY_GRO_D1_AUDIT_TRUST_UNAVAILABLE");
  }
  const proof=evaluateD1HotCountryGroRows(rows,{
    at,
    verifyArtifact:(object,time)=>{
      if(!trust)return false;
      const signed=verifyRiskObjectSignature(object as any,trust);
      if(!signed.valid)return false;
      return verifyCommercialRiskObjectArtifact(object as any,{
        now:time,verification_keys:trust,
      }).deliverable===true;
    },
  });
  guard(calls<=D1_AUDIT_MAX_REQUESTS,"COUNTRY_GRO_D1_AUDIT_REQUEST_LIMIT");
  return {...proof,d1_readonly_requests:calls,trust_checked_for_rows:rows.length>0};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    guard(process.argv.length===3 && process.argv[2]==="--read-only",
      "COUNTRY_GRO_D1_AUDIT_READ_ONLY_REQUIRED");
    guard(!process.env.SUPABASE_DB_URL &&
      !process.env.APP_SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.B2_KEY_ID && !process.env.B2_APPLICATION_KEY &&
      !process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN &&
      !process.env.RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64,
      "COUNTRY_GRO_D1_AUDIT_PRIVILEGED_CREDS_FORBIDDEN");
    const result=await auditD1HotCountryGro({
      accountId:String(process.env.CLOUDFLARE_ACCOUNT_ID??""),
      apiToken:String(process.env.CLOUDFLARE_API_TOKEN??""),
    });
    console.log(JSON.stringify(result));
  }catch(error){
    const message=error instanceof Error?error.message:"";
    const code=/^COUNTRY_GRO_D1_AUDIT_[A-Z_]+$/u.test(message)
      ?message:"COUNTRY_GRO_D1_AUDIT_FAILED_CLOSED";
    console.error(JSON.stringify({
      ok:false,audit_only:true,error:code,commercial_launch_accepted:false,
      global_195_country_coverage_claimed:false,b2_get_requests:0,
      b2_put_requests:0,supabase_writes:0,d1_writes:0,
      external_payment_performed:false,
    }));
    process.exitCode=1;
  }
}
