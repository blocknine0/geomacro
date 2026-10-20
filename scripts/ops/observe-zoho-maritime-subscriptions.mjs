#!/usr/bin/env node
// No credentials? report CONFIG_REQUIRED with no network call, not a green feed.
// No privileged production publication, metadata-only private artifact.
import {mkdirSync,writeFileSync} from "node:fs";
import {observeZohoMaritime} from "../lib/zoho-maritime-subscription-mail.mjs";
if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   process.env.GITHUB_REF!=="refs/heads/main"||
   !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
 throw Error("ZOHO_SUBSCRIPTION_PROTECTED_MAIN_ONLY");
const allowed=new Set(["ZOHO_OAUTH_SETUP_REQUIRED","ZOHO_OAUTH_NO_TOKEN",
 "ZOHO_REGION_NOT_ALLOWED","ZOHO_MAIL_ID_INVALID","UKMTO_APPROVED_SENDER_INVALID",
 "ZOHO_CLOCK_INVALID","ZOHO_LIST_SHAPE_INVALID","ZOHO_MESSAGE_LIST_INVALID",
 "ZOHO_MAILBOX_IDENTITY_MISMATCH"]);
let report;let transportHealthy=false;
try{
 report=await observeZohoMaritime();
 transportHealthy=report.configured===true;
}catch(e){
 const code=String(e?.message??"");
 const reason=allowed.has(code)||/^ZOHO_(?:OAUTH|LIST|HEADER)_(?:HTTP_(?:DENIED|RATE_LIMIT|UNAVAILABLE)|BODY_LIMIT|EMPTY|JSON_INVALID)$/u.test(code)?
   code:"ZOHO_TRANSPORT_OR_SCHEMA_UNVERIFIED";
 report={schema:"geomacro.zoho-maritime-subscription-private-candidates.v1",
   status:"UPSTREAM_NOT_VERIFIED",reason,checked_at:new Date().toISOString(),
   candidate_counts:{marad_advisories:0,ukmto:0},leads:[],
   paid_partner_delivery_enabled:false,signed_event_generated:false,
   raw_emails_stored:false,d1_writes:0,b2_requests:0,
   supabase_requests:0,payments:0};
}
mkdirSync("artifacts/zoho-maritime-subscribed-alerts",{recursive:true,mode:0o700});
writeFileSync("artifacts/zoho-maritime-subscribed-alerts/private-receipt.json",
 JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({
 schema:report.schema,status:report.status,
 marad_candidates:report.candidate_counts?.marad_advisories??0,
 ukmto_candidates:report.candidate_counts?.ukmto??0,
 ukmto_sender_ready:report.ukmto_sender_ready??false,
 external_calls:report.external_calls??0,reason:report.reason??null,
 verified_incidents:0,paid_delivery:false,raw_email_stored:false,payments:0
}));
if(report.status==="UPSTREAM_NOT_VERIFIED")process.exitCode=3;
// CONFIG_REQUIRED is a graceful, plainly stated opt-in hold; does not imply online mailbox.
// Empty but successfully queried mailbox is a legitimate green *transport* only.
