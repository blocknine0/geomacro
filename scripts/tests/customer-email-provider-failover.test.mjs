import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {sendOtpWithProviderFailover,PROVIDERS} from
  "../../workers/control-plane/src/customer-email-provider-failover.mjs";

const schema=readFileSync(new URL("../../workers/control-plane/migrations/0093_customer_email_provider_quota.sql",import.meta.url),"utf8");
const now="2026-11-01T10:00:00.000Z";
function fixture(){
 const sql=new DatabaseSync(":memory:");sql.exec(schema);
 return {sql,db:{prepare(q){return {bind(...args){return {
  first:async()=>sql.prepare(q).get(...args)??null,
  run:async()=>({meta:{changes:sql.prepare(q).run(...args).changes}}),
 };}}}}};
}
const full={EMAIL_PROVIDER_API_KEY:"re_test",
  EMAIL_FROM_ADDRESS:"auth@geomacro.live",
  BREVO_EMAIL_API_KEY:"brevo-test",
  BREVO_EMAIL_FROM_ADDRESS:"auth@geomacro.live",
  MAILERSEND_EMAIL_API_KEY:"ms-test",
  MAILERSEND_EMAIL_FROM_ADDRESS:"auth@geomacro.live"};
const args=(db,env=full)=>({db,env,challengeId:randomUUID(),email:"user@example.com",
 otp:"123456",randomUUID,now});
const acceptedResend=()=>new Response(JSON.stringify({id:"resend-msg-123"}),{status:200});
const acceptedBrevo=()=>new Response(JSON.stringify({messageId:"brevo-msg-123"}),{status:201});

test("provider priority is by distinct provider accounts, not rotated API keys",()=>{
 assert.deepEqual(PROVIDERS.map(x=>x.name),["resend","brevo","mailersend"]);
 assert.equal(PROVIDERS[0].daily,90);
 assert.equal(PROVIDERS[1].daily,270);
});

test("Resend success does not touch secondary providers; resend replays denied",async()=>{
 const {db,sql}=fixture(),urls=[];
 const request=args(db);
 const fetchImpl=async url=>{urls.push(url);return acceptedResend()};
 const first=await sendOtpWithProviderFailover({...request,fetchImpl});
 assert.deepEqual([first.ok,first.provider],[true,"resend"]);
 assert.equal(urls.length,1);
 assert.equal(sql.prepare("SELECT status FROM customer_email_dispatch_attempts").get().status,"accepted");
 const replay=await sendOtpWithProviderFailover({...request,fetchImpl});
 assert.equal(replay.code,"CUSTOMER_EMAIL_ALREADY_SUBMITTED");
 assert.equal(urls.length,1);sql.close();
});

test("HTTP 429 Resend rejection falls through to distinct Brevo account",async()=>{
 const {db,sql}=fixture(),urls=[];
 const result=await sendOtpWithProviderFailover({...args(db),fetchImpl:async url=>{
  urls.push(url);
  return url.includes("resend")?new Response("",{status:429}):acceptedBrevo();
 }});
 assert.deepEqual([result.ok,result.provider],[true,"brevo"]);
 assert.deepEqual(urls,["https://api.resend.com/emails","https://api.brevo.com/v3/smtp/email"]);
 const rows=sql.prepare("SELECT provider,status FROM customer_email_dispatch_attempts ORDER BY rowid").all();
 assert.deepEqual(rows.map(r=>[r.provider,r.status]),[["resend","rejected"],["brevo","accepted"]]);
 sql.close();
});

test("local Resend daily soft ceiling automatically chooses Brevo",async()=>{
 const {db,sql}=fixture();
 const add=sql.prepare("INSERT INTO customer_email_dispatch_attempts(attempt_id,challenge_id,provider,status,submitted_at) VALUES(?,?,?,?,?)");
 for(let i=0;i<90;i++)add.run(randomUUID(),randomUUID(),"resend","accepted",now);
 const urls=[];
 const result=await sendOtpWithProviderFailover({...args(db),fetchImpl:async url=>{
  urls.push(url);return acceptedBrevo();
 }});
 assert.equal(result.ok,true);assert.equal(result.provider,"brevo");
 assert.deepEqual(urls,["https://api.brevo.com/v3/smtp/email"]);
 sql.close();
});

test("network ambiguity never triggers second provider, even if primary returns timeout",async()=>{
 const {db,sql}=fixture(),urls=[];
 const req=args(db);
 const fetchImpl=async url=>{urls.push(url);throw Error("timeout");};
 const result=await sendOtpWithProviderFailover({...req,fetchImpl});
 assert.equal(result.code,"CUSTOMER_EMAIL_DELIVERY_UNCERTAIN");
 assert.equal(urls.length,1);
 assert.equal(sql.prepare("SELECT status FROM customer_email_dispatch_attempts").get().status,"unknown");
 assert.equal((await sendOtpWithProviderFailover({...req,fetchImpl})).code,
  "CUSTOMER_EMAIL_ALREADY_SUBMITTED");
 sql.close();
});

test("missing provider credentials fail closed without network, no secret leaks",async()=>{
 const {db,sql}=fixture();
 const result=await sendOtpWithProviderFailover({...args(db,{}),
  fetchImpl:async()=>{throw Error("must not send");}});
 assert.equal(result.code,"CUSTOMER_EMAIL_PROVIDERS_NOT_CONFIGURED");
 assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM customer_email_dispatch_attempts").get().n,0);
 sql.close();
});

test("explicit provider 401 does NOT mask broken credentials by failing over",async()=>{
 const {db,sql}=fixture(),urls=[];
 const result=await sendOtpWithProviderFailover({...args(db),fetchImpl:async url=>{
  urls.push(url);return new Response("",{status:401});
 }});
 assert.equal(result.code,"CUSTOMER_EMAIL_PROVIDER_REJECTED");
 assert.deepEqual(urls,["https://api.resend.com/emails"]);sql.close();
});

test("strictly bounded provider quota returns exhausted without claiming delivery",async()=>{
 const {db,sql}=fixture(),add=sql.prepare(
  "INSERT INTO customer_email_dispatch_attempts(attempt_id,challenge_id,provider,status,submitted_at) VALUES(?,?,?,?,?)");
 for(const provider of PROVIDERS)for(let i=0;i<provider.daily;i++)
   add.run(randomUUID(),randomUUID(),provider.name,"accepted",now);
 const result=await sendOtpWithProviderFailover({...args(db),
  fetchImpl:async()=>{throw Error("must not send");}});
 assert.equal(result.code,"CUSTOMER_EMAIL_PROVIDER_QUOTAS_EXHAUSTED");
 sql.close();
});


test("simultaneous requests for one challenge acquire exactly one dispatch lock",async()=>{
 const {db,sql}=fixture(),request=args(db);
 let sends=0;
 const fetchImpl=async()=>{sends++;return acceptedResend()};
 const results=await Promise.all([
  sendOtpWithProviderFailover({...request,fetchImpl}),
  sendOtpWithProviderFailover({...request,fetchImpl}),
 ]);
 assert.equal(results.filter(x=>x.ok).length,1);
 assert.equal(results.filter(x=>x.code==="CUSTOMER_EMAIL_ALREADY_SUBMITTED").length,1);
 assert.equal(sends,1);
 sql.close();
});


test("provider redirect is refused without forwarding OTP or trying backup",async()=>{
 const {db,sql}=fixture(),urls=[];
 const result=await sendOtpWithProviderFailover({...args(db),fetchImpl:async (url,init)=>{
  urls.push(url);
  assert.equal(init.redirect,"manual");
  return new Response(null,{status:302,headers:{Location:"https://untrusted.example/collect"}});
 }});
 assert.equal(result.ok,false);
 assert.equal(result.code,"CUSTOMER_EMAIL_PROVIDER_REJECTED");
 assert.deepEqual(urls,["https://api.resend.com/emails"]);
 sql.close();
});
