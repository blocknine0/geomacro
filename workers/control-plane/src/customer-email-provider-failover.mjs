// GeoMacro customer email delivery: provider-account quotas, not API-key rotation.
// A quota rejection can advance to another independently configured provider.
// Ambiguous network/provider outcomes must NEVER send a second OTP.
export const PROVIDERS=Object.freeze([
 {name:"resend",env:"EMAIL_PROVIDER_API_KEY",daily:90,monthly:2700},
 {name:"brevo",env:"BREVO_EMAIL_API_KEY",daily:270,monthly:null},
 {name:"mailersend",env:"MAILERSEND_EMAIL_API_KEY",daily:80,monthly:450},
]);
const ORIGINS=Object.freeze({
 resend:"https://api.resend.com/emails",
 brevo:"https://api.brevo.com/v3/smtp/email",
 mailersend:"https://api.mailersend.com/v1/email",
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
const emailFrom=(env,name)=>String(env[name==="resend"?"EMAIL_FROM_ADDRESS":
 name==="brevo"?"BREVO_EMAIL_FROM_ADDRESS":"MAILERSEND_EMAIL_FROM_ADDRESS"]??"").trim();
function conf(env,p){
 const key=String(env[p.env]??"").trim(),from=emailFrom(env,p.name);
 // Sending domains must be explicitly verified independently per provider.
 if(!key||!validEmail(from)||!from.toLowerCase().endsWith("@geomacro.live"))return null;
 return {key,from};
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
 return {
  url:ORIGINS.mailersend,headers:{Authorization:"Bearer "+c.key},
  body:{from:{email:c.from},to:[{email:to}],subject,text:body}};
}
async function resultOf(provider,response){
 if(provider==="mailersend"&&response.status===202){
  const id=response.headers.get("x-message-id");
  return id?{kind:"accepted",id}:{kind:"unknown"};
 }
 if(provider==="resend"&&response.status===200){
  const data=await response.json().catch(()=>null);
  return typeof data?.id==="string"?{kind:"accepted",id:data.id}:{kind:"unknown"};
 }
 if(provider==="brevo"&&response.status===201){
  const data=await response.json().catch(()=>null);
  return typeof data?.messageId==="string"?{kind:"accepted",id:data.messageId}:{kind:"unknown"};
 }
 if(response.status===429)return {kind:"quota"};
 // MailerSend specifically documents #MS42242 as the monthly overage cap.
 if(provider==="mailersend"&&response.status===422){
  const data=await response.text().catch(()=>null);
  if(typeof data==="string"&&data.slice(0,4096).includes("MS42242"))
    return {kind:"quota"};
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
