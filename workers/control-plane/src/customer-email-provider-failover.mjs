// GeoMacro customer email delivery: provider-account quotas, not API-key rotation.
// A quota rejection can advance to another independently configured provider.
// Ambiguous network/provider outcomes must NEVER send a second OTP.
export const PROVIDERS=Object.freeze([
 {name:"resend",env:"EMAIL_PROVIDER_API_KEY",fromEnv:"EMAIL_FROM_ADDRESS",daily:90,monthly:2700},
 {name:"brevo",env:"BREVO_EMAIL_API_KEY",fromEnv:"BREVO_EMAIL_FROM_ADDRESS",daily:270,monthly:null},
 {name:"mailjet",env:"MAILJET_API_KEY",secretEnv:"MAILJET_SECRET_KEY",
  fromEnv:"MAILJET_EMAIL_FROM_ADDRESS",daily:180,monthly:5400},
]);
const ORIGINS=Object.freeze({
 resend:"https://api.resend.com/emails",
 brevo:"https://api.brevo.com/v3/smtp/email",
 mailjet:"https://api.mailjet.com/v3.1/send",
});
const COUNT_SQL=`INSERT INTO customer_email_dispatch_attempts
 (attempt_id,challenge_id,provider,status,submitted_at)
 SELECT ?,?,?,'reserved',?
 WHERE (SELECT COUNT(*) FROM customer_email_dispatch_attempts
   WHERE provider=? AND submitted_at>=?) < ?
 AND (SELECT COUNT(*) FROM customer_email_dispatch_attempts
   WHERE provider=? AND submitted_at>=?) < ?
 AND NOT EXISTS(SELECT 1 FROM customer_email_dispatch_attempts
   WHERE challenge_id=? AND status IN ('accepted','unknown'))`;
const UTC_DAY=now=>now.slice(0,10)+"T00:00:00.000Z";
const UTC_MONTH=now=>now.slice(0,7)+"-01T00:00:00.000Z";
const validEmail=x=>typeof x==="string"&&x.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(x);
const emailFrom=(env,provider)=>String(env[provider.fromEnv]??"").trim();
function conf(env,p){
 const key=String(env[p.env]??"").trim(),from=emailFrom(env,p);
 // Sending domains must be explicitly verified independently per provider.
 const secret=p.secretEnv?String(env[p.secretEnv]??"").trim():"";
 if(!key||(p.secretEnv&&!secret)||!validEmail(from)||!from.toLowerCase().endsWith("@geomacro.live"))return null;
 return {key,secret,from};
}
const textBody=otp=>"Your GeoMacro sign-in code is "+otp+
 ". This code expires in 10 minutes. Do not share it.";
function payload(p,c,to,otp,id){
 const subject="GeoMacro verification code",body=textBody(otp);
 if(p.name==="resend")return {
  url:ORIGINS.resend,headers:{Authorization:"Bearer "+c.key,
    "Idempotency-Key":id},body:{from:c.from,to:[to],subject,text:body}};
 if(p.name==="brevo")return {
  url:ORIGINS.brevo,headers:{"api-key":c.key},
  body:{sender:{email:c.from},to:[{email:to}],subject,textContent:body}};
 if(p.name==="mailjet")return {
  url:ORIGINS.mailjet,headers:{Authorization:`Basic ${btoa(`${c.key}:${c.secret}`)}`},
  body:{Messages:[{From:{Email:c.from},To:[{Email:to}],Subject:subject,TextPart:body,
   CustomID:id}]}};
 throw new Error("CUSTOMER_EMAIL_PROVIDER_UNSUPPORTED");
}
async function resultOf(provider,response){
 if(provider==="resend"&&response.status===200){
  const data=await response.json().catch(()=>null);
  return typeof data?.id==="string"?{kind:"accepted",id:data.id}:{kind:"unknown"};
 }
 if(provider==="brevo"&&response.status===201){
  const data=await response.json().catch(()=>null);
  return typeof data?.messageId==="string"?{kind:"accepted",id:data.messageId}:{kind:"unknown"};
 }
 if(response.status===429)return {kind:"quota"};
 if(provider==="mailjet"&&response.status===200){
  const data=await response.json().catch(()=>null);
  const message=data?.Messages?.[0],recipient=message?.To?.[0];
  const id=recipient?.MessageID??recipient?.MessageUUID;
  return message?.Status==="success"&&
   (typeof id==="string"&&id.length>0||typeof id==="number"&&Number.isFinite(id))
   ?{kind:"accepted",id:String(id)}:{kind:"unknown"};
 }
 if(response.status>=500)return {kind:"unknown"};
 return {kind:"rejected"};
}
export async function sendOtpWithProviderFailover({
 db,env,challengeId,email,otp,fetchImpl=fetch,now=new Date().toISOString(),
 randomUUID=()=>crypto.randomUUID(),
}){
 if(!db||typeof challengeId!=="string"||challengeId.length<16||
    !validEmail(email)||typeof otp!=="string"||!/^[0-9]{6}$/u.test(otp))
   return {ok:false,code:"CUSTOMER_EMAIL_REQUEST_INVALID"};
 // Recoverable retry after an ambiguous/accepted attempt cannot risk duplicates.
 const previous=await db.prepare(`SELECT status FROM customer_email_dispatch_attempts
    WHERE challenge_id=? AND status IN ('accepted','unknown') LIMIT 1`).bind(challengeId).first();
 if(previous)return {ok:false,code:"CUSTOMER_EMAIL_ALREADY_SUBMITTED"};
 const configured=PROVIDERS.filter(p=>conf(env,p));
 if(configured.length===0)return {ok:false,code:"CUSTOMER_EMAIL_PROVIDERS_NOT_CONFIGURED"};
 // D1 primary-key reservation serializes concurrent requests for one challenge.
 const lock=await db.prepare(`INSERT OR IGNORE INTO customer_email_dispatch_challenges
   (challenge_id,started_at) VALUES (?,?)`).bind(challengeId,now).run();
 if(lock?.meta?.changes!==1)return {ok:false,code:"CUSTOMER_EMAIL_ALREADY_SUBMITTED"};
 let ready=0,quotaBlocked=0;
 for(const p of configured){
  const c=conf(env,p);
  if(!c)continue;
  ready++;
  const attemptId=randomUUID(),maxMonthly=p.monthly??2147483647;
  let reservation;
  try{
   reservation=await db.prepare(COUNT_SQL).bind(attemptId,challengeId,p.name,now,
     p.name,UTC_DAY(now),p.daily,p.name,UTC_MONTH(now),maxMonthly,challengeId).run();
  }catch{return {ok:false,code:"CUSTOMER_EMAIL_QUOTA_LEDGER_UNAVAILABLE"};}
  if(reservation?.meta?.changes!==1){quotaBlocked++;continue;}
  const outbound=payload(p,c,email,otp,attemptId);
  let outcome;
  try{
   const response=await fetchImpl(outbound.url,{method:"POST",
    headers:{"Content-Type":"application/json",...outbound.headers},
    body:JSON.stringify(outbound.body),redirect:"manual",
    signal:AbortSignal.timeout(8000)});
   // Workerd-safe manual redirect: never forward OTP or credentials to redirected origins.
   outcome=response.status>=300&&response.status<400?{kind:"rejected"}:await resultOf(p.name,response);
  }catch{outcome={kind:"unknown"};}
  // Store just public provider message identifier; never log or store OTP.
  const status=outcome.kind==="accepted"?"accepted":
    outcome.kind==="quota"||outcome.kind==="rejected"?"rejected":"unknown";
  try{
   await db.prepare(`UPDATE customer_email_dispatch_attempts
    SET status=?,completed_at=?,external_message_id=?
    WHERE attempt_id=? AND status='reserved'`).bind(
     status,new Date().toISOString(),outcome.id??null,attemptId).run();
  }catch{return {ok:false,code:"CUSTOMER_EMAIL_DISPATCH_RECEIPT_UNAVAILABLE"};}
  if(status==="accepted")return {ok:true,provider:p.name,code:"CUSTOMER_EMAIL_ACCEPTED"};
  if(outcome.kind==="quota"){quotaBlocked++;continue;}
  return {ok:false,code:outcome.kind==="unknown"?
   "CUSTOMER_EMAIL_DELIVERY_UNCERTAIN":"CUSTOMER_EMAIL_PROVIDER_REJECTED"};
 }
 return {ok:false,code:ready===0?"CUSTOMER_EMAIL_PROVIDERS_NOT_CONFIGURED":
  quotaBlocked>0?"CUSTOMER_EMAIL_PROVIDER_QUOTAS_EXHAUSTED":
   "CUSTOMER_EMAIL_UNAVAILABLE"};
}
