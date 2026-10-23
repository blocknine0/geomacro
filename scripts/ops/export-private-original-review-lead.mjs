#!/usr/bin/env node
/**
 * Authorized custodian: retrieve ONE genuine private first-party original
 * pre-review lead archive. Never uploads sources to Actions, Github or chat.
 * Zero signatures, rights approvals, scores, D1/B2 writes or funds.
 */
import {createHash} from "node:crypto";
import {existsSync,lstatSync,realpathSync,statSync,writeFileSync} from "node:fs";
import {dirname,isAbsolute,relative,resolve} from "node:path";
import {gunzipSync} from "node:zlib";
import {pathToFileURL} from "node:url";
import {createB2Client} from "./b2-s3-client.mjs";
import {buildPrivateOriginalReviewArchive} from "../lib/private-original-review-b2-handoff.mjs";

const fail=x=>{throw Error("OWNER_PRIVATE_ORIGINAL_LEAD_EXPORT_"+x)};
const sha=b=>createHash("sha256").update(b).digest("hex");
const PREFIX="geomacro-evidence/v1/private/original-pre-review/";
export function authorizePrivateOriginalLeadExport(env=process.env,{
 cwd=process.cwd(),platform=process.platform
}={}){
 if(env.GITHUB_ACTIONS==="true"||env.CI==="true"||
    env.GEOMACRO_PRIVATE_ORIGINAL_EXPORT_ACK!=="YES_NO_FUNDS")
  fail("AUTHORIZED_LOCAL_CUSTODIAN_REQUIRED");
 for(const key of ["SUPABASE_DB_URL","SUPABASE_URL",
  "APP_SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SERVICE_ROLE_KEY",
  "COINBASE_API_KEY","COINBASE_X402_MAINNET_ACK",
  "GEOMACRO_COMMERCIAL_LAUNCH_ACK"])
  if(env[key])fail("FUNDS_OR_SUPABASE_FORBIDDEN");
 if(env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
    env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=="original_review_export"||
    env.B2_REQUEST_BUDGET!=="3"||
    !env.B2_KEY_ID||!env.B2_APPLICATION_KEY||
    !env.CLOUDFLARE_ACCOUNT_ID||!env.CLOUDFLARE_API_TOKEN||
    !env.D1_DATABASE_ID)
  fail("EXISTING_SHARED_B2_D1_GOVERNOR_REQUIRED");
 const key=env.GEOMACRO_PRIVATE_ORIGINAL_ARCHIVE_KEY;
 const match=typeof key==="string"&&key.match(
   /^geomacro-evidence\/v1\/private\/original-pre-review\/(\d{4})\/(\d\d)\/(\d\d)\/([a-f0-9]{64})\.json\.gz$/u
 );
 if(!match||match[1]<"2026"||Number(match[2])<1||
    Number(match[2])>12||Number(match[3])<1||Number(match[3])>31)
  fail("EXACT_PRIVATE_B2_ARCHIVE_KEY_REQUIRED");
 const path=env.GEOMACRO_PRIVATE_ORIGINAL_EXPORT_PATH;
 if(!isAbsolute(path??"")||!path.endsWith(".json")||
    existsSync(path))fail("NEW_ABSOLUTE_PRIVATE_JSON_OUTPUT_REQUIRED");
 const parent=realpathSync(dirname(path)),repo=realpathSync(cwd);
 const rel=relative(repo,parent),st=statSync(parent);
 if(!st.isDirectory()||(platform!=="win32"&&(st.mode&0o077)!==0)||
    rel===""||(!rel.startsWith("..")&&!isAbsolute(rel)))
  fail("PRIVATE_OUTPUT_PARENT_0700_OUTSIDE_REPOSITORY_REQUIRED");
 return Object.freeze({key,expectedSha:match[4],path:resolve(path)});
}
export async function exportPrivateOriginalLeadArchive({
 env=process.env,b2Factory=createB2Client,cwd=process.cwd(),
 platform=process.platform
}={}){
 const cfg=authorizePrivateOriginalLeadExport(env,{cwd,platform});
 const b2=b2Factory({
  endpointUrl:"https://s3.us-east-005.backblazeb2.com",
  bucket:"geomacro-private-archive",
  accessKey:env.B2_KEY_ID,secretKey:env.B2_APPLICATION_KEY,
 });
 const bytes=Buffer.from(await b2.get(cfg.key));
 if(bytes.length<50||bytes.length>40_000||
    sha(bytes)!==cfg.expectedSha)fail("EXACT_COMPRESSED_B2_BYTES_MISMATCH");
 let doc;
 try{doc=JSON.parse(gunzipSync(bytes,{maxOutputLength:60_000}).toString("utf8"))}
 catch{fail("PRIVATE_REVIEW_ARCHIVE_GZIP_INVALID");}
 if(doc?.schema!=="geomacro.private-original-review-lead-archive.v1"||
    !Array.isArray(doc.leads)||doc.leads.length<1||doc.leads.length>3||
    doc.rights_verified!==false||doc.facts_and_rights_signed!==false||
    doc.reviewer_signed!==false||doc.GRI_scored!==false||
    doc.country_certificates_issued!==false||
    doc.commercial_eligible!==false||doc.x402_payment_authorized!==false)
  fail("NONCOMMERCIAL_UNREVIEWED_LEAD_REQUIRED");
 const recomputed=buildPrivateOriginalReviewArchive(doc.leads,{
  now:new Date(doc.created_at),countryIso3:doc.country_iso3
 });
 if(recomputed?.key!==cfg.key||!bytes.equals(recomputed.compressed))
  fail("VERIFIED_PRIVATE_ARCHIVE_RECOMPUTATION_MISMATCH");
 // Keep the original private source URL/title/hash in 0600 output file only.
 // No overwrite, no deletion and no secret/public-source stdout disclosure.
 writeFileSync(cfg.path,JSON.stringify(doc,null,2)+"\n",{flag:"wx",mode:0o600});
 const st=lstatSync(cfg.path);
 if(!st.isFile()||st.isSymbolicLink()||
    (platform!=="win32"&&(st.mode&0o077)!==0))
  fail("PRIVATE_REVIEW_FILE_PERMISSIONS_INVALID");
 return Object.freeze({
  schema:"geomacro.authorized-original-private-review-export.v1",
  status:"ORIGINAL_LEAD_B2_READBACK_AND_PRIVATE_CUSTODY_VERIFIED",
  country_iso3:doc.country_iso3,private_review_leads:doc.leads.length,
  gzip_bytes_sha256_verified:true,private_output_written:true,
  private_paths_urls_titles_or_hashes_logged:false,
  original_html_bytes_exported:false,
  independent_review_done:false,source_rights_verified:false,
  facts_or_rights_signed:false,GRI_score_or_certificates_signed:false,
  b2_puts:0,d1_writes:0,paid_delivery:false,payments:0
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==3||process.argv[2]!=="--authorized-private-review-no-funds")
   fail("EXPLICIT_READ_ONLY_EXPORT_FLAG_REQUIRED");
  console.log(JSON.stringify(await exportPrivateOriginalLeadArchive()));
 }catch{
  console.error("OWNER_PRIVATE_ORIGINAL_LEAD_EXPORT_NOT_ACCEPTED");
  process.exitCode=2;
 }
}
