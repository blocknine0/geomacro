import process from "node:process";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AUTHORITATIVE_RISK_PROJECT_REF } from "./risk-supabase.server";
import { apiCredentialDigest } from "./api-credential-hash.server";
import { CustomerError } from "./customer-auth.server";

const URL=`https://${AUTHORITATIVE_RISK_PROJECT_REF}.supabase.co`;
let cached:SupabaseClient|null=null;
function commercialDb(){
 // Explicitly allow low-volume authenticated customer management even while
 // unrelated Risk Supabase traffic remains in cold standby. Never use the
 // historical project or a hosting-injected, browser-visible service key.
 const url=(process.env.APP_SUPABASE_URL??process.env.SUPABASE_URL??"").trim();
 const key=(process.env.APP_SUPABASE_SERVICE_ROLE_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY??"").trim();
 if(url!==URL||key.length<32)throw new CustomerError(503,"CUSTOMER_LEDGER_NOT_CONFIGURED");
 if(!cached)cached=createClient(URL,key,{
  auth:{persistSession:false,autoRefreshToken:false},
  global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.any(
   [init?.signal??AbortSignal.timeout(9_000),AbortSignal.timeout(9_000)])})},
 });
 return cached;
}
const externalId=(uid:string)=>"auth:"+uid;
async function principal(uid:string,create=false){
 const db=commercialDb();
 if(create){
  const p=await db.from("commercial_principals").upsert(
   {principal_type:"api_client",external_id:externalId(uid),status:"active"},
   {onConflict:"principal_type,external_id",ignoreDuplicates:true});
  if(p.error)throw new CustomerError(503,"CUSTOMER_ENROLLMENT_UNAVAILABLE");
 }
 const result=await db.from("commercial_principals")
  .select("id,status").eq("principal_type","api_client")
  .eq("external_id",externalId(uid)).maybeSingle();
 if(result.error)throw new CustomerError(503,"CUSTOMER_ACCOUNT_UNAVAILABLE");
 if(result.data?.status&&result.data.status!=="active")
  throw new CustomerError(403,"CUSTOMER_ACCOUNT_SUSPENDED");
 return result.data?.id as string|null;
}
export async function enrollCustomer(uid:string){
 if(!/^[0-9a-f-]{36}$/i.test(uid))throw new CustomerError(401,"CUSTOMER_ID_INVALID");
 return principal(uid,true);
}
export async function readCustomerAccount(uid:string){
 const db=commercialDb();
 const id=await principal(uid);
 if(!id)return {principal_ready:false,credits:null,keys:[],checkout_enabled:false};
 const [funded,keys]=await Promise.all([
  db.from("commercial_credit_accounts")
   .select("tier,included_credits,credits_used,period_started_at,period_ends_at,status,contract_version")
   .eq("principal_type","api_client").eq("principal_id",id).maybeSingle(),
  db.from("commercial_api_credentials")
   .select("key_id,enabled,scopes,created_at,expires_at,revoked_at,last_used_at")
   .eq("principal_id",id).order("created_at",{ascending:false}).limit(25),
 ]);
 if(funded.error||keys.error)throw new CustomerError(503,"CUSTOMER_ACCOUNT_READ_UNAVAILABLE");
 const row=funded.data;
 const valid=Boolean(row&&row.status==="active"&&
  new Date(row.period_started_at).getTime()<=Date.now()&&
  new Date(row.period_ends_at).getTime()>Date.now());
 const remaining=valid?Math.max(0,row!.included_credits-row!.credits_used):0;
 return {principal_ready:true,credits:row?{
   tier:row.tier,allocated:row.included_credits,used:row.credits_used,
   remaining,period_ends_at:row.period_ends_at,status:valid?"active":"inactive",
  }:null,keys:keys.data??[],checkout_enabled:false};
}
export async function issueCustomerKey(uid:string){
 await principal(uid,true);
 const token="gmk_live_"+randomBytes(36).toString("base64url");
 const keyId="gmk_live_"+randomBytes(12).toString("base64url");
 const hash=apiCredentialDigest(token,"commercial-bearer");
 const result=await commercialDb().rpc("issue_paid_customer_api_key",{
  p_auth_user_id:uid,p_key_id:keyId,p_key_hash:hash,
 });
 if(result.error)throw new CustomerError(503,"CUSTOMER_KEY_LEDGER_NOT_MIGRATED");
 const data=result.data as {ok?:boolean;code?:string;key_id?:string};
 if(data?.ok!==true)throw new CustomerError(data?.code==="MAX_THREE_ACTIVE_KEYS"?429:403,
  data?.code??"VERIFIED_PAYMENT_ENTITLEMENT_REQUIRED");
 return {key_id:keyId,api_key:token,reveal_once:true};
}
export async function revokeCustomerKey(uid:string,keyId:string){
 if(!/^gmk_live_[A-Za-z0-9_-]{10,60}$/u.test(keyId))
  throw new CustomerError(400,"INVALID_KEY_ID");
 const result=await commercialDb().rpc("revoke_paid_customer_api_key",{
  p_auth_user_id:uid,p_key_id:keyId,
 });
 if(result.error)throw new CustomerError(503,"CUSTOMER_KEY_REVOKE_UNAVAILABLE");
 const row=result.data as {ok?:boolean;code?:string;revoked?:boolean};
 if(!row?.ok)throw new CustomerError(403,row?.code??"CUSTOMER_KEY_REVOKE_DENIED");
 return {revoked:row.revoked===true};
}
