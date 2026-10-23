import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {buildPrivateOriginalReviewArchive}
 from "../lib/private-original-review-b2-handoff.mjs";
import {authorizePrivateOriginalLeadExport,exportPrivateOriginalLeadArchive}
 from "./export-private-original-review-lead.mjs";

const now=new Date("2026-10-23T20:00:00.000Z");
const lead={
 schema:"geomacro.private-original-signing-review-lead.v1",
 disposition:"GENUINE_HTML_BYTES_DATE_VERIFIED_FACTS_AND_RIGHTS_PENDING",
 country_iso3:"IND",category:"macro",
 issuer_organization_id:"official-issuer",publisher_family:"official_feed",
 original_article_url:"https://official.example.org/secret-review/release",
 original_article_title:"Central bank announces an official policy change",
 original_article_identity_sha256:"a".repeat(64),
 original_html_sha256:"b".repeat(64),
 native_original_publication_at:"2026-10-23T19:30:00.000Z",
 observed_at:"2026-10-23T19:40:00.000Z",
 independent_original_count:0,semantic_event_claim_verified:false,
 country_topic_factual_scope_review_pending:true,
 original_article_commercial_rights_verified:false,
 source_registry_rights_qualified:false,
 reviewed_event_identity:null,rights_receipt_sha256:null,
 facts_signature:null,rights_signature:null,commercial_eligible:false
};
const setup=()=>{
 const root=mkdtempSync(join(tmpdir(),"geomacro-private-original-export-"));
 const cwd=join(root,"checkout"),output=join(root,"operator-private");
 mkdirSync(cwd,{mode:0o700});mkdirSync(output,{mode:0o700});
 const plan=buildPrivateOriginalReviewArchive([lead],{now,countryIso3:"IND"});
 const path=join(output,"unreviewed-original-leads.json");
 const env={
  GEOMACRO_PRIVATE_ORIGINAL_EXPORT_ACK:"YES_NO_FUNDS",
  GEOMACRO_PRIVATE_ORIGINAL_ARCHIVE_KEY:plan.key,
  GEOMACRO_PRIVATE_ORIGINAL_EXPORT_PATH:path,
  B2_ACCOUNT_QUOTA_REQUIRED:"1",
  B2_ACCOUNT_QUOTA_WORKFLOW_ID:"original_review_export",
  B2_REQUEST_BUDGET:"3",
  B2_KEY_ID:"private-read-key",
  B2_APPLICATION_KEY:"private-read-secret",
  CLOUDFLARE_ACCOUNT_ID:"f".repeat(32),
  CLOUDFLARE_API_TOKEN:"private-quota-token",
  D1_DATABASE_ID:"f".repeat(32)
 };
 return {root,cwd,output,path,plan,env,close:()=>rmSync(root,{recursive:true,force:true})};
};
test("exact private B2 compressed bytes roundtrip only to 0600 owner folder, no rights or signing",async()=>{
 const t=setup();
 try{
  const receipt=await exportPrivateOriginalLeadArchive({env:t.env,cwd:t.cwd,
   b2Factory:()=>({async get(k){assert.equal(k,t.plan.key);return t.plan.compressed;}})
  });
  assert.equal(receipt.status,"ORIGINAL_LEAD_B2_READBACK_AND_PRIVATE_CUSTODY_VERIFIED");
  assert.equal(receipt.private_review_leads,1);
  assert.equal(receipt.private_output_written,true);
  assert.equal(receipt.original_html_bytes_exported,false);
  assert.equal(receipt.source_rights_verified,false);
  assert.equal(receipt.GRI_score_or_certificates_signed,false);
  assert.equal(receipt.payments,0);
  const archived=JSON.parse(readFileSync(t.path,"utf8"));
  assert.equal(archived.leads[0].original_article_url,lead.original_article_url);
  assert.equal(JSON.stringify(receipt).includes(lead.original_article_url),false);
  assert.equal(JSON.stringify(receipt).includes(t.plan.key),false);
 }finally{t.close()}
});
test("invalid key, path, owner consent or forbidden credentials refuse before any network",()=>{
 const t=setup();
 try{
  for(const changed of [
   {GEOMACRO_PRIVATE_ORIGINAL_EXPORT_ACK:""},
   {GEOMACRO_PRIVATE_ORIGINAL_ARCHIVE_KEY:"not-an-archive"},
   {GEOMACRO_PRIVATE_ORIGINAL_EXPORT_PATH:join(t.cwd,"leads.json")},
   {SUPABASE_DB_URL:"postgres://test.invalid/unsafe"},
   {B2_ACCOUNT_QUOTA_REQUIRED:"0"},
   {GITHUB_ACTIONS:"true"}
  ]){
   assert.throws(()=>authorizePrivateOriginalLeadExport({...t.env,...changed},{
    cwd:t.cwd}),/OWNER_PRIVATE_ORIGINAL_LEAD_EXPORT_/);
  }
 }finally{t.close()}
});
test("tampered original packed bytes cannot create a local private JSON file",async()=>{
 const t=setup();
 try{
  await assert.rejects(()=>exportPrivateOriginalLeadArchive({env:t.env,cwd:t.cwd,
   b2Factory:()=>({async get(){return Buffer.from("corrupt");}})
  }),/OWNER_PRIVATE_ORIGINAL_LEAD_EXPORT_EXACT_COMPRESSED_B2_BYTES_MISMATCH/);
  assert.throws(()=>readFileSync(t.path),{code:"ENOENT"});
 }finally{t.close()}
});

test("one private owner export restores the same three-category batch without elevating review status",async()=>{
 const t=setup();try{
  const records=["geopolitics","macro","rare_earth"].map((category,i)=>({...lead,category,original_article_identity_sha256:String(i+1).repeat(64)}));
  const plan=buildPrivateOriginalReviewArchive(records,{now,countryIso3:"IND"});
  const receipt=await exportPrivateOriginalLeadArchive({env:{...t.env,GEOMACRO_PRIVATE_ORIGINAL_ARCHIVE_KEY:plan.key},cwd:t.cwd,
    b2Factory:()=>({async get(){return plan.compressed;}})});
  assert.equal(receipt.private_review_leads,3);
  assert.equal(receipt.source_rights_verified,false);assert.equal(receipt.GRI_score_or_certificates_signed,false);
  assert.equal(JSON.parse(readFileSync(t.path,"utf8")).leads.length,3);
 }finally{t.close()}
});
