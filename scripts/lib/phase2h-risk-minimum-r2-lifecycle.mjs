/**
 * Read-only Cloudflare R2 lifecycle proof for the cold, DERIVED-ONLY
 * Risk Gate prefix. An existing broad delete rule is a real blocker.
 * Never mistake a two-day escrow for permanent, long-term archival.
 */
import {PHASE2H_R2_BACKUP_PREFIX}
 from "./phase2h-b2-r2-backup.mjs";
const die=s=>{throw Error("PHASE2H_RISK_COLD_LIFECYCLE_"+s)};
const BUCKET=/^[a-z0-9][a-z0-9-]{2,62}$/u;
const ACCOUNT=/^[a-f0-9]{32}$/u;
export function assertPermanentRiskColdR2Lifecycle(document,{
 prefix=PHASE2H_R2_BACKUP_PREFIX
}={}){
 const rules=document?.result?.rules;
 if(document?.success!==true||!Array.isArray(rules)||
    rules.length>1000||typeof prefix!=="string"||
    !prefix.startsWith("geomacro/private/phase2h-risk-minimum-br11/v2/"))
  die("EXACT_PROVIDER_LIFECYCLE_UNVERIFIED");
 let reviewed=0;
 for(const rule of rules){
  if(!rule||typeof rule!=="object"||Array.isArray(rule)||
     !["boolean","undefined"].includes(typeof rule.enabled))
   die("UNKNOWN_LIFECYCLE_RULE");
  if(rule.enabled!==true)continue;
  // Cloudflare's default bucket-wide rule aborts INCOMPLETE multipart
  // uploads after 7d. This does not delete completed cold objects. Provider
  // can omit conditions.prefix entirely for this default rule. Such a rule
  // is accepted ONLY when it is syntactically and semantically abort-only:
  // all other unknown properties, delete/paid-class transitions or missing
  // explicit maxAge/type MUST remain HOLD, not silently interpreted as safe.
  const prefixApplied=rule?.conditions?.prefix;
  const hasDeleteOrPaidTransition=rule.deleteObjectsTransition!=null||
     rule.deleteNoncurrentVersionsTransition!=null||
     rule.noncurrentVersionExpiration!=null||
     rule.expiration!=null||
     rule.storageClassTransition!=null||
     (Array.isArray(rule.storageClassTransitions)&&
      rule.storageClassTransitions.length>0)||
     rule.storageClassTransitions!=null&&
      !Array.isArray(rule.storageClassTransitions);
  if(typeof prefixApplied!=="string"){
   const onlyKeys=["id","enabled","conditions","abortMultipartUploadsTransition"];
   const abort=rule.abortMultipartUploadsTransition?.condition;
   const noUnknown=Object.keys(rule).every(x=>onlyKeys.includes(x));
   const conditionKeys=rule.conditions==null||
     typeof rule.conditions==="object"&&!Array.isArray(rule.conditions)&&
     Object.keys(rule.conditions).length===0;
   if(hasDeleteOrPaidTransition||!noUnknown||!conditionKeys||
      !abort||abort.type!=="Age"||
      !Number.isSafeInteger(abort.maxAge)||abort.maxAge<1||
      abort.maxAge>30*86400||
      Object.keys(rule.abortMultipartUploadsTransition).length!==1||
      Object.keys(abort).sort().join("|")!=="maxAge|type")
    die("BUCKET_WIDE_OR_UNSCOPED_RULE_UNVERIFIED");
   reviewed++;
   continue;
  }
  if(!prefix.startsWith(prefixApplied)&&
     !prefixApplied.startsWith(prefix))continue;
  reviewed++;
  // Both parent-prefix and child-prefix automatic-delete policies can
  // threaten objects in this cold store. No age threshold is acceptable
  // for a long-term archive, regardless of stated number of days.
  if(hasDeleteOrPaidTransition)
   die("COLD_PREFIX_EXPIRY_OR_PAID_CLASS_CONFLICT");
 }
 return Object.freeze({
  schema:"geomacro.phase2h.risk-cold-provider-lifecycle.v1",
  status:"PROVIDER_NO_COLD_PREFIX_AUTO_DELETE_RULES",
  provider_readonly_observation:true,
  no_matching_auto_deletion:true,
  reviewed_applicable_rules:reviewed,
  bucket_metadata_writes:0,b2_requests:0,payments_authorized:false,
  account_wide_r2_cost_headroom_verified:false
 });
}
export async function verifyPermanentRiskColdR2Lifecycle({
 env=process.env,fetchImpl=fetch
}={}){
 const account=env?.CLOUDFLARE_ACCOUNT_ID;
 const bucket=env?.GEOMACRO_D1_RECOVERY_R2_BUCKET;
 const token=env?.CLOUDFLARE_API_TOKEN;
 if(!ACCOUNT.test(account??"")||!BUCKET.test(bucket??"")||
    typeof token!=="string"||token.length<20)
  die("LIFECYCLE_PROVIDER_CREDENTIALS_REQUIRED");
 const endpoint="https://api.cloudflare.com/client/v4/accounts/"+
  account+"/r2/buckets/"+bucket+"/lifecycle";
 let res;
 try{res=await fetchImpl(endpoint,{
  method:"GET",redirect:"error",cache:"no-store",
  headers:{Authorization:"Bearer "+token,Accept:"application/json"},
  signal:AbortSignal.timeout(15000)
 })}catch{die("LIFECYCLE_PROVIDER_UNAVAILABLE")}
 if(!res||res.status!==200||res.redirected)
  die("LIFECYCLE_HTTP_NOT_200");
 let data;try{data=await res.json()}catch{die("LIFECYCLE_JSON_INVALID")}
 return assertPermanentRiskColdR2Lifecycle(data);
}
