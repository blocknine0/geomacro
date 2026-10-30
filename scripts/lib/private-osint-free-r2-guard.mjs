/**
 * Independent, READ-ONLY R2 lifecycle proof before optional ciphertext PUT.
 * No bucket creation, lifecycle mutation, paid subscription, D1 SQL or B2.
 * A finite bucket retention rule protects the included R2 Standard storage.
 * Other account-wide R2 usage is still unknown: do not claim a $0 invoice.
 */
export const PRIVATE_R2_HOLD_PREFIX="geomacro/private-osint-held/v1/";
export const PRIVATE_R2_MAX_CIPHERTEXT_BYTES=1_500_000;
export const PRIVATE_R2_MAX_EXPIRY_SECONDS=2*24*3600;
export const PRIVATE_R2_FREE_TIER={
 storage_gb_month:10,class_a_month:1_000_000,class_b_month:10_000_000,
 standard_only:true,
};
const fail=(message)=>{throw Error("PRIVATE_OSINT_R2_FREE_TIER_"+message)};
const bucketPattern=/^geomacro-private-osint-[a-z0-9-]+$/u;
const accountPattern=/^[a-f0-9]{32}$/u;
export function assertPrivateR2FreeLifecycle(document,{prefix=PRIVATE_R2_HOLD_PREFIX}={}){
 const rules=document?.result?.rules;
 if(document?.success!==true||!Array.isArray(rules)||rules.length>1000)
  fail("LIFECYCLE_UNVERIFIED");
 const safe=rules.some(rule=>{
  const covered=rule?.conditions?.prefix;
  const seconds=rule?.deleteObjectsTransition?.condition?.maxAge;
  return rule?.enabled===true&&typeof covered==="string"&&
   prefix.startsWith(covered)&&rule?.deleteObjectsTransition?.condition?.type==="Age"&&
   Number.isSafeInteger(seconds)&&seconds>0&&
   seconds<=PRIVATE_R2_MAX_EXPIRY_SECONDS;
 });
 if(!safe)fail("TWO_DAY_PREFIX_EXPIRY_NOT_VERIFIED");
 return Object.freeze({schema:"geomacro.private-osint-r2-free-retention.v1",
  prefix,delete_max_age_seconds:PRIVATE_R2_MAX_EXPIRY_SECONDS,
  lifecycle_rule_verified:true,
  included_monthly_storage_gb:PRIVATE_R2_FREE_TIER.storage_gb_month,
  included_class_a_operations:PRIVATE_R2_FREE_TIER.class_a_month,
  included_class_b_operations:PRIVATE_R2_FREE_TIER.class_b_month,
  other_account_usage_verified:false,bucket_storage_bytes_verified:false,
  r2_write_permitted_only_with_existing_scoped_credentials:true,
  no_r2_write_by_this_check:true});
}
export async function verifyPrivateR2FreeLifecycle({
 env=process.env,fetchImpl=fetch,
}={}){
 const account=env?.CLOUDFLARE_ACCOUNT_ID;
 const bucket=env?.GEOMACRO_PRIVATE_OSINT_R2_BUCKET;
 const token=env?.CLOUDFLARE_API_TOKEN;
 if(!accountPattern.test(account??"")||
    !bucketPattern.test(bucket??"")||bucket.length>63||
    typeof token!=="string"||token.length<20||
    typeof fetchImpl!=="function")fail("READ_ONLY_PROVIDER_CREDENTIALS_REQUIRED");
 const path="https://api.cloudflare.com/client/v4/accounts/"+account+
  "/r2/buckets/"+bucket+"/lifecycle";
 let response;
 try{response=await fetchImpl(path,{
  method:"GET",redirect:"error",cache:"no-store",
  headers:{Authorization:"Bearer "+token,Accept:"application/json"},
  signal:AbortSignal.timeout(12000),
 })}catch{fail("PROVIDER_LIFECYCLE_UNAVAILABLE")}
 if(response?.status!==200||response.redirected)
  fail("PROVIDER_LIFECYCLE_NOT_ADMITTED");
 let body;
 try{body=await response.json()}catch{fail("LIFECYCLE_JSON_INVALID")}
 return assertPrivateR2FreeLifecycle(body);
}
