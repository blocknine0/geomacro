import test from "node:test";
import assert from "node:assert/strict";
import {
 validateZohoMaritimeConfig,observeZohoMaritime,summarizeZohoMaritimeMessages
} from "../lib/zoho-maritime-subscription-mail.mjs";
const now=new Date("2026-10-20T12:00:00Z");
const env={
 ZOHO_MAIL_REGION:"in",ZOHO_MAIL_CLIENT_ID:"public-client",
 ZOHO_MAIL_CLIENT_SECRET:"secret-key",
 ZOHO_MAIL_REFRESH_TOKEN:"refresh-key",
 ZOHO_MAIL_ACCOUNT_ID:"123456789000",
 ZOHO_MAIL_FOLDER_ID:"456789123000",
 ZOHO_UKMTO_APPROVED_SENDER:"alerts@ukmto.example"
};
const marad={messageId:"1719887058769100001",folderId:env.ZOHO_MAIL_FOLDER_ID,
 fromAddress:"marad@info.dot.gov",subject:"US Maritime Advisory – Red Sea",
 receivedTime:String(now.getTime()-3600000)};
const ukmto={messageId:"1719887058769100002",folderId:env.ZOHO_MAIL_FOLDER_ID,
 fromAddress:"alerts@ukmto.example",subject:"Gulf of Aden warning",
 receivedTime:String(now.getTime()-360000)};
const untrusted={messageId:"1719887058769100003",folderId:env.ZOHO_MAIL_FOLDER_ID,
 fromAddress:"spoof@example.org",subject:"Strait of Hormuz attack",
 receivedTime:String(now.getTime()-600000)};
const hdr=(from)=>"From: "+from+"\r\nDate: Tue, 20 Oct 2026 11:00:00 +0000\r\nSubject: Alert\r\n";
test("requires complete OAuth secrets and exact allowed Zoho data center",()=>{
 assert.deepEqual(validateZohoMaritimeConfig({}),{ready:false,status:"ZOHO_OAUTH_SETUP_REQUIRED"});
 const cfg=validateZohoMaritimeConfig(env);
 assert.equal(cfg.ready,true);assert.equal(cfg.region,"in");
 assert.equal(cfg.ukmtoSender,"alerts@ukmto.example");
 assert.throws(()=>validateZohoMaritimeConfig({...env,ZOHO_MAIL_REGION:"https://evil.com"}),/REGION_NOT_ALLOWED/);
 assert.throws(()=>validateZohoMaritimeConfig({...env,ZOHO_MAIL_FOLDER_ID:"../../evil"}),/ID_INVALID/);
});
test("only declared subscribed exact senders with retrieved headers become unverified private leads",()=>{
 const cfg=validateZohoMaritimeConfig(env);
 const x=summarizeZohoMaritimeMessages([marad,ukmto,untrusted],
  {[marad.messageId]:hdr("marad@info.dot.gov"),
   [ukmto.messageId]:hdr("alerts@ukmto.example")},cfg,now);
 assert.equal(x.candidate_counts.marad_advisories,1);
 assert.equal(x.candidate_counts.ukmto,1);
 assert.equal(x.leads.length,2);
 assert.deepEqual(x.leads[0].candidate_corridor_ids,["bab_el_mandeb"]);
 assert.deepEqual(x.leads[1].candidate_corridor_ids,["gulf_of_aden_somali_basin"]);
 assert.equal(x.paid_partner_delivery_enabled,false);
 assert.equal(x.leads[0].publisher_authentication_verified,false);
 assert.equal(x.signed_event_generated,false);
 assert.equal(x.raw_emails_stored,false);
 assert.doesNotMatch(JSON.stringify(x),/Red Sea|Gulf of Aden warning|1719887058769100001/);
});
test("missing header, stale date, duplicate and unknown UKMTO address fail closed",()=>{
 const cfg=validateZohoMaritimeConfig({...env,ZOHO_UKMTO_APPROVED_SENDER:""});
 const tooOld={...marad,messageId:"1719887058769100009",
  receivedTime:String(now.getTime()-80*3600000)};
 const x=summarizeZohoMaritimeMessages([marad,marad,tooOld,ukmto],
  {[marad.messageId]:hdr("someone@example.org")},cfg,now);
 assert.equal(x.leads.length,0);
 assert.equal(x.candidate_counts.ukmto,0);
 assert.deepEqual(x.subscriptions_configured,["marad_advisories"]);
});
test("one OAuth refresh, one mailbox listing and at most three headers: no contents or writes",async()=>{
 const urls=[];const responses=[
 {access_token:"sample_token_long_enough"},
 {status:{code:200},data:[marad,ukmto,untrusted]},
 {status:{code:200},data:{headerContent:hdr("marad@info.dot.gov")}},
 {status:{code:200},data:{headerContent:hdr("alerts@ukmto.example")}}
 ];
 let n=0;
 const result=await observeZohoMaritime({now,env,fetchImpl:async(url,opts)=>{
  urls.push(String(url));assert.equal(opts.redirect,"error");
  if(n===0){assert.equal(opts.method,"POST");assert.ok(String(url).startsWith("https://accounts.zoho.in/"));}
  else {assert.ok(opts.headers.authorization.startsWith("Zoho-oauthtoken "));}
  return Response.json(responses[n++]);
 }});
 assert.equal(n,4);
 assert.equal(result.external_calls,4);
 assert.equal(result.leads.length,2);
 assert.equal(result.paid_partner_delivery_enabled,false);
 assert.ok(urls.every(x=>!x.includes("/content")));
 assert.equal(result.d1_writes,0);
 assert.equal(result.supabase_requests,0);
});
test("unconfigured credentials perform no network request; 403 never retries",async()=>{
 let n=0;
 const empty=await observeZohoMaritime({env:{},fetchImpl:async()=>{n++;throw Error("NOT_ALLOWED");}});
 assert.equal(empty.status,"ZOHO_OAUTH_SETUP_REQUIRED");assert.equal(n,0);
 await assert.rejects(()=>observeZohoMaritime({env,fetchImpl:async()=>{
  n++;return new Response("access denied",{status:403});
 }}),/ZOHO_OAUTH_HTTP_DENIED/);
 assert.equal(n,1);
});
