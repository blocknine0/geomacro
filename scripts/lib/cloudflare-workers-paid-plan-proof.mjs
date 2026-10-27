/**
 * READ ONLY. Provider billing evidence for an account-scoped Workers Paid
 * subscription. Never changes plans, payment methods, subscriptions, or
 * customer entitlements. Requires an optional independent Billing Read token.
 * A user-set "PAID=true" flag is NOT accepted as capacity evidence.
 */
export const WORKERS_PAID_PROOF_SCHEMA="geomacro.cloudflare-workers-paid-provider-proof.v1";
const accountPattern=/^[0-9a-f]{32}$/iu;

export function assessProviderWorkersPaidSubscription(body,now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
   body?.success!==true||!Array.isArray(body.result)||
   body.result.length>100||body.errors?.length)
  throw Error("WORKERS_PAID_PROVIDER_SUBSCRIPTIONS_UNVERIFIED");
 const good=body.result.filter(s=>
  s?.state==="Paid"&&
  typeof s.rate_plan?.id==="string"&&
  s.rate_plan.id.toLowerCase()==="workers_paid"&&
  s.rate_plan.scope==="account"&&
  (s.current_period_end===undefined||
   (Number.isFinite(Date.parse(s.current_period_end))&&
    Date.parse(s.current_period_end)>now.getTime()))&&
  (s.current_period_start===undefined||
   (Number.isFinite(Date.parse(s.current_period_start))&&
    Date.parse(s.current_period_start)<=now.getTime()))
 );
 if(good.length!==1)throw Error("WORKERS_PAID_PROVIDER_ACTIVE_PLAN_NOT_PROVEN");
 return Object.freeze({
  schema:WORKERS_PAID_PROOF_SCHEMA,
  verified:true,
  observed_at:now.toISOString(),
  source:"CLOUDFLARE_ACCOUNT_SUBSCRIPTIONS_BILLING_READ",
  requires_existing_paid_account:true,
  subscription_changed:false,
  billing_action_performed:false,
 });
}
export async function readCloudflareWorkersPaidProof({
 env=process.env,fetchImpl=fetch,now=new Date(),
}={}){
 const token=env.CLOUDFLARE_BILLING_READ_TOKEN;
 const account=env.CLOUDFLARE_ACCOUNT_ID;
 if(typeof token!=="string"||token.length<20||
    typeof account!=="string"||!accountPattern.test(account))
  throw Error("WORKERS_PAID_BILLING_READ_PERMISSION_REQUIRED");
 let response;
 try{
  response=await fetchImpl(
   "https://api.cloudflare.com/client/v4/accounts/"+account+"/subscriptions?per_page=100",{
    method:"GET",redirect:"error",cache:"no-store",
    headers:{Authorization:"Bearer "+token,Accept:"application/json"},
    signal:AbortSignal.timeout(12000),
   });
 }catch{throw Error("WORKERS_PAID_BILLING_READ_UNAVAILABLE")}
 if(response?.status!==200)throw Error("WORKERS_PAID_BILLING_READ_REJECTED");
 let body;
 try{body=await response.json()}catch{throw Error("WORKERS_PAID_BILLING_READ_INVALID_JSON")}
 if(body?.result_info?.total_count>100)throw Error("WORKERS_PAID_SUBSCRIPTIONS_TRUNCATED");
 return assessProviderWorkersPaidSubscription(body,now);
}
