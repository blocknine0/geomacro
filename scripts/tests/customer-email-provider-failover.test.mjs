import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {sendOtpWithProviderFailover,PROVIDERS} from
  "../../workers/control-plane/src/customer-email-provider-failover.mjs";

const schema=readFileSync(new URL("../../workers/control-plane/migrations/0093_customer_email_provider_quota.sql",import.meta.url),"utf8");
const mailjetMigration=readFileSync(new URL("../../workers/control-plane/migrations/0227_customer_email_mailjet_provider.sql",import.meta.url),"utf8");
const now="2026-11-01T10:00:00.000Z";
function fixture(){
 const sql=new DatabaseSync(":memory:");sql.exec(schema);sql.exec(mailjetMigration);
 return {sql,db:{prepare(q){return {bind(...args){return {
  first:async()=>sql.prepare(q).get(...args)??null,
  run:async()=>({meta:{changes:sql.prepare(q).run(...args).changes}}),
 };}}}}};
}
const full={EMAIL_PROVIDER_API_KEY:"re_test",
  EMAIL_FROM_ADDRESS:"auth@geomacro.live",
  BREVO_EMAIL_API_KEY:"brevo-test",
  BREVO_EMAIL_FROM_ADDRESS:"auth@geomacro.live",
  MAILJET_EMAIL_API_KEY:"mj-public-test",
  MAILJET_EMAIL_SECRET_KEY:"mj-private-test",
  MAILJET_EMAIL_FROM_ADDRESS:"auth@geomacro.live"};
const args=(db,env=full)=>({db,env,challengeId:randomUUID(),email:"user@example.com",
 otp:"123456",randomUUID,now});
const acceptedResend=()=>new Response(JSON.stringify({id:"resend-msg-123"}),{status:200});
const acceptedBrevo=()=>new Response(JSON.stringify({messageId:"brevo-msg-123"}),{status:201});
const acceptedMailjet=()=>new Response(JSON.stringify({Messages:[{Status:"success",To:[{MessageID:"mailjet-msg-123",MessageUUID:"mailjet-uuid-123"}]}]}),{status:200});
const fillDaily=(sql,provider,count)=>{
 const add=sql.prepare("INSERT INTO customer_email_dispatch_attempts(attempt_id,challenge_id,provider,status,submitted_at) VALUES(?,?,?,?,?)");
 for(let i=0;i<count;i++)add.run(randomUUID(),randomUUID(),provider,"accepted",now);
};
const exhaustBeforeMailjet=(sql)=>{fillDaily(sql,"resend",90);fillDaily(sql,"brevo",270);};

test("provider priority is by distinct provider accounts, not rotated API keys",()=>{
 assert.deepEqual(PROVIDERS.map(x=>x.name),["resend","brevo","mailjet"]);
 assert.deepEqual(PROVIDERS.map(x=>x.daily),[90,270,180]);
 assert.deepEqual(PROVIDERS.map(x=>x.monthly),[2700,null,5400]);
 assert.deepEqual(PROVIDERS.map(x=>[x.env,x.secretEnv??null,x.fromEnv]),[
  ["EMAIL_PROVIDER_API_KEY",null,"EMAIL_FROM_ADDRESS"],
  ["BREVO_EMAIL_API_KEY",null,"BREVO_EMAIL_FROM_ADDRESS"],
  ["MAILJET_EMAIL_API_KEY","MAILJET_EMAIL_SECRET_KEY","MAILJET_EMAIL_FROM_ADDRESS"],
 ]);
});

test("0227 migration preserves every prior provider row and permits Mailjet",()=>{
 const sql=new DatabaseSync(":memory:");sql.exec(schema);
 const insert=sql.prepare("INSERT INTO customer_email_dispatch_attempts(attempt_id,challenge_id,provider,status,submitted_at,completed_at,external_message_id) VALUES(?,?,?,?,?,?,?)");
 const historical=[
  ["old-resend-0001","challenge-resend-0001","resend","accepted",now,now,"resend-id"],
  ["old-brevo-00001","challenge-brevo-00001","brevo","rejected",now,now,null],
  ["old-msend-00001","challenge-msend-00001","mailersend","unknown",now,null,null],
 ];
 for(const row of historical)insert.run(...row);
 sql.exec(mailjetMigration);
 const preserved=sql.prepare("SELECT attempt_id,challenge_id,provider,status,submitted_at,completed_at,external_message_id FROM customer_email_dispatch_attempts ORDER BY attempt_id").all().map(row=>({...row}));
 assert.deepEqual(preserved,historical.map(([attempt_id,challenge_id,provider,status,submitted_at,completed_at,external_message_id])=>({attempt_id,challenge_id,provider,status,submitted_at,completed_at,external_message_id})).sort((a,b)=>a.attempt_id.localeCompare(b.attempt_id)));
 insert.run("new-mailjet-0001","challenge-mailjet-001","mailjet","accepted",now,now,"mailjet-id");
 assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM customer_email_dispatch_attempts").get().n,4);
 assert.deepEqual(sql.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_customer_email_%' ORDER BY name").all().map(x=>x.name),["idx_customer_email_dispatch_challenge","idx_customer_email_provider_daily"]);
 sql.close();
});

test("0227 migration aborts before touching a ledger over the protected 3,000-row bound",()=>{
 const sql=new DatabaseSync(":memory:");sql.exec(schema);
 const insert=sql.prepare("INSERT INTO customer_email_dispatch_attempts(attempt_id,challenge_id,provider,status,submitted_at) VALUES(?,?,?,?,?)");
 for(let i=0;i<3001;i++)insert.run(randomUUID(),randomUUID(),"resend","accepted",now);
 assert.match(mailjetMigration,/LIMIT 1 OFFSET 3000/u);
 sql.exec("BEGIN");
 assert.throws(()=>sql.exec(mailjetMigration),/CHECK constraint failed/u);
 sql.exec("ROLLBACK");
 assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM customer_email_dispatch_attempts").get().n,3001);
 assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='customer_email_dispatch_attempts_0227'").get().n,0);
 assert.throws(()=>insert.run(randomUUID(),randomUUID(),"mailjet","accepted",now),/CHECK constraint failed/u);
 sql.close();
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

test("Resend and Brevo quota failures fall through to Mailjet in priority order",async()=>{
 const {db,sql}=fixture(),urls=[];
 const result=await sendOtpWithProviderFailover({...args(db),fetchImpl:async(url,init)=>{
  urls.push(url);
  if(url.includes("resend")||url.includes("brevo"))return new Response("",{status:429});
  assert.equal(url,"https://api.mailjet.com/v3.1/send");
  assert.equal(init.headers.Authorization,"Basic "+btoa("mj-public-test:mj-private-test"));
  assert.deepEqual(JSON.parse(init.body).Messages[0],{
   From:{Email:"auth@geomacro.live"},To:[{Email:"user@example.com"}],
   Subject:"GeoMacro verification code",
   TextPart:"Your GeoMacro sign-in code is 123456. This code expires in 10 minutes. Do not share it.",
   CustomID:JSON.parse(init.body).Messages[0].CustomID,
  });
  return acceptedMailjet();
 }});
 assert.deepEqual([result.ok,result.provider],[true,"mailjet"]);
 assert.deepEqual(urls,["https://api.resend.com/emails","https://api.brevo.com/v3/smtp/email","https://api.mailjet.com/v3.1/send"]);
 const rows=sql.prepare("SELECT provider,status,external_message_id FROM customer_email_dispatch_attempts ORDER BY rowid").all();
 assert.deepEqual(rows.map(r=>[r.provider,r.status,r.external_message_id]),[["resend","rejected",null],["brevo","rejected",null],["mailjet","accepted","mailjet-msg-123"]]);
 sql.close();
});

test("Mailjet HTTP 200 requires success status and message ID",async()=>{
 const {db,sql}=fixture();exhaustBeforeMailjet(sql);
 const accepted=await sendOtpWithProviderFailover({...args(db),fetchImpl:async()=>acceptedMailjet()});
 assert.deepEqual([accepted.ok,accepted.provider],[true,"mailjet"]);
 const {db:db2,sql:sql2}=fixture();exhaustBeforeMailjet(sql2);
 const malformed=await sendOtpWithProviderFailover({...args(db2),fetchImpl:async()=>Response.json({Messages:[{Status:"success",To:[{}]}]},{status:200})});
 assert.equal(malformed.code,"CUSTOMER_EMAIL_DELIVERY_UNCERTAIN");
 assert.equal(sql2.prepare("SELECT status FROM customer_email_dispatch_attempts WHERE provider='mailjet'").get().status,"unknown");
 sql.close();sql2.close();
});

test("Mailjet HTTP 429 is classified as quota and exhausts without claiming delivery",async()=>{
 const {db,sql}=fixture();exhaustBeforeMailjet(sql);
 const result=await sendOtpWithProviderFailover({...args(db),fetchImpl:async url=>{
  assert.equal(url,"https://api.mailjet.com/v3.1/send");return new Response("",{status:429});
 }});
 assert.equal(result.code,"CUSTOMER_EMAIL_PROVIDER_QUOTAS_EXHAUSTED");
 assert.equal(sql.prepare("SELECT status FROM customer_email_dispatch_attempts WHERE provider='mailjet'").get().status,"rejected");
 sql.close();
});

test("Mailjet 5xx and network ambiguity block retry for the same OTP",async()=>{
 for(const fetchImpl of [async()=>new Response("",{status:503}),async()=>{throw Error("timeout")}]){
  const {db,sql}=fixture();exhaustBeforeMailjet(sql);const request=args(db);
  const first=await sendOtpWithProviderFailover({...request,fetchImpl});
  assert.equal(first.code,"CUSTOMER_EMAIL_DELIVERY_UNCERTAIN");
  assert.equal(sql.prepare("SELECT status FROM customer_email_dispatch_attempts WHERE provider='mailjet'").get().status,"unknown");
  assert.equal((await sendOtpWithProviderFailover({...request,fetchImpl})).code,"CUSTOMER_EMAIL_ALREADY_SUBMITTED");
  sql.close();
 }
});

test("Mailjet non-quota 4xx is rejected without a duplicate provider send",async()=>{
 const {db,sql}=fixture();exhaustBeforeMailjet(sql);let sends=0;
 const result=await sendOtpWithProviderFailover({...args(db),fetchImpl:async()=>{sends++;return new Response("",{status:401});}});
 assert.equal(result.code,"CUSTOMER_EMAIL_PROVIDER_REJECTED");assert.equal(sends,1);
 assert.equal(sql.prepare("SELECT status FROM customer_email_dispatch_attempts WHERE provider='mailjet'").get().status,"rejected");
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

test("Mailjet monthly soft ceiling prevents additional provider request",async()=>{
 const {db,sql}=fixture();
 const add=sql.prepare("INSERT INTO customer_email_dispatch_attempts(attempt_id,challenge_id,provider,status,submitted_at) VALUES(?,?,?,?,?)");
 for(let i=0;i<5400;i++)add.run(randomUUID(),randomUUID(),"mailjet","accepted",now);
 exhaustBeforeMailjet(sql);
 const result=await sendOtpWithProviderFailover({...args(db),fetchImpl:async()=>{throw Error("must not send");}});
 assert.equal(result.code,"CUSTOMER_EMAIL_PROVIDER_QUOTAS_EXHAUSTED");
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
