#!/usr/bin/env node
/** Independent read-only provider census of EVERY version in the Phase2H B2 prefix.
 * Not an archive writer and not a historical deletion claim from an empty list.
 * Each native request consumes a shared atomic D1 B2 quota ticket first.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {createB2D1AccountGovernor} from "./b2-d1-account-governor.mjs";
import {assertPhase2hB2Lifecycle,PHASE2H_B2_PREFIX} from "./phase2h-verify-b2-72h-lifecycle.mjs";

const DAY=86_400_000;
const MAX_PAGES=4;
const FAIL=code=>{throw Error("PHASE2H_B2_VERSION_"+code)};
const PREFIX=PHASE2H_B2_PREFIX;
const nameRe=/^geomacro-evidence\/v1\/private\/phase2h-raw-news\/20\d{2}\/\d{2}\/\d{2}\/[a-f0-9]{64}\.json\.gz$/u;
export const RECEIPT_SCHEMA="geomacro.phase2h.independent-b2-versions.v1";
// Keep provider failures actionable without ever returning raw HTTP bodies,
// account identifiers, keys, buckets, source titles or stack traces.
export function safeB2RetentionError(error){
 const code=String(error?.message??"");
 return /^(?:PHASE2H_B2_VERSION_[A-Z_]+|PHASE2H_B2_72H_[A-Z_]+|B2_GLOBAL_DAILY_QUOTA_EXHAUSTED|B2_ACCOUNT_GLOBAL_QUOTA_[A-Z0-9_]+)$/u.test(code)?
  code:"PHASE2H_B2_VERSION_INDEPENDENT_PROVIDER_PROOF_UNAVAILABLE";
}

export function checkB2VersionsPage(page,now=new Date()){
 if(!Number.isFinite(now.getTime())||!Array.isArray(page?.files)||page.files.length>1000)
  FAIL("PROVIDER_PAGE_INVALID");
 const cursorName=page.nextFileName??null,cursorId=page.nextFileId??null;
 if((cursorName===null)!==(cursorId===null)||cursorName!==null&&
   (typeof cursorName!=="string"||typeof cursorId!=="string"||!cursorName.startsWith(PREFIX)))
  FAIL("PAGINATION_INVALID");
 let uploads=0,hides=0,overdue=0;
 for(const file of page.files){
  if(!nameRe.test(file?.fileName??"")||!["upload","hide"].includes(file?.action)||
     typeof file.fileId!=="string"||file.fileId.length<10)
   FAIL("UNRECOGNIZED_PREFIX_VERSION");
  const ts=Number(file.uploadTimestamp);
  if(!Number.isSafeInteger(ts)||ts<0||ts>now.getTime()+60_000)
   FAIL("VERSION_CLOCK_INVALID");
  if(file.action==="upload"){
   uploads++;
   if(ts<=now.getTime()-3*DAY)overdue++;
  }else hides++;
 }
 return {uploads,hides,overdue,nextFileName:cursorName,nextFileId:cursorId};
}
export async function verifyPhase2hB2VersionInventory({
 env=process.env,fetchImpl=fetch,now=new Date(),
 governor=createB2D1AccountGovernor({env,fetchImpl}),
}={}){
 const hasReadId=(env.B2_ARCHIVE_READ_KEY_ID??"").length>0;
 const hasReadSecret=(env.B2_ARCHIVE_READ_APPLICATION_KEY??"").length>0;
 if(hasReadId!==hasReadSecret)FAIL("ARCHIVE_READ_PAIR_INCOMPLETE");
 const useReadKey=hasReadId&&hasReadSecret;
 const selectedId=useReadKey?env.B2_ARCHIVE_READ_KEY_ID:env.B2_KEY_ID;
 const selectedSecret=useReadKey?env.B2_ARCHIVE_READ_APPLICATION_KEY:env.B2_APPLICATION_KEY;
 if(env.GITHUB_ACTIONS!=="true"||env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   env.GITHUB_REF!=="refs/heads/main"||env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
   env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=="phase2h_b2_retention"||
   (selectedId??"").length<12||(selectedSecret??"").length<16)
  FAIL("PROTECTED_MAIN_REQUIRED");
 const get=async(url,kind,headers)=>{
  await governor.reserve(kind);
  let response;
  try{response=await fetchImpl(url,{method:"GET",headers,cache:"no-store",
    redirect:"error",signal:AbortSignal.timeout(15000)});}
  catch{FAIL("PROVIDER_NETWORK_UNAVAILABLE")}
  if(response.status!==200||response.redirected)FAIL("PROVIDER_HTTP_UNVERIFIED");
  try{return await response.json()}catch{FAIL("PROVIDER_JSON_INVALID")}
 };
 const auth=await get("https://api.backblazeb2.com/b2api/v4/b2_authorize_account",
  "NATIVE_AUTH",{Authorization:"Basic "+Buffer.from(
   selectedId+":"+selectedSecret).toString("base64")});
 const storage=auth?.apiInfo?.storageApi,allowed=storage?.allowed;
 // Native v4 account IDs are opaque provider-issued strings, not
 // guaranteed hexadecimal. Use a safe bounded token for URLSearchParams
 // rather than incorrectly rejecting a real authorized account.
 if(!Array.isArray(allowed?.capabilities))
  FAIL("PROVIDER_CAPABILITIES_UNVERIFIED");
 if(typeof auth.authorizationToken!=="string"||!auth.authorizationToken.length)
  FAIL("PROVIDER_TOKEN_UNVERIFIED");
 if(typeof auth.accountId!=="string"||!/^[a-zA-Z0-9_-]{6,128}$/u.test(auth.accountId))
  FAIL("PROVIDER_ACCOUNT_ID_UNVERIFIED");
 if(!allowed.capabilities.includes("listBuckets"))
  FAIL("PROVIDER_LIST_BUCKETS_CAPABILITY_MISSING");
 if(!allowed.capabilities.includes("listFiles"))
  FAIL("PROVIDER_LIST_FILES_CAPABILITY_MISSING");
 const api=String(storage.apiUrl??"");
 if(!/^https:\/\/api\d+\.backblazeb2\.com$/u.test(api))
  FAIL("PROVIDER_ORIGIN_INVALID");
 const bucketURL=new URL(api+"/b2api/v4/b2_list_buckets");
 bucketURL.searchParams.set("accountId",auth.accountId);
 bucketURL.searchParams.set("bucketName","geomacro-private-archive");
 const headers={Authorization:auth.authorizationToken};
 const bucketData=await get(bucketURL.href,"GET",headers);
 const exact=bucketData?.buckets?.filter(x=>x.bucketName==="geomacro-private-archive")??[];
 if(exact.length!==1||typeof exact[0].bucketId!=="string")
  FAIL("PRIVATE_BUCKET_NOT_VERIFIED");
 assertPhase2hB2Lifecycle(exact[0].lifecycleRules);
 const bucketId=exact[0].bucketId;
 let pages=0,uploads=0,hides=0,overdue=0;
 let nextName=null,nextId=null;
 const seen=new Set();
 while(pages<MAX_PAGES){
  const url=new URL(api+"/b2api/v4/b2_list_file_versions");
  url.searchParams.set("bucketId",bucketId);
  url.searchParams.set("prefix",PREFIX);
  url.searchParams.set("maxFileCount","1000");
  if(nextName!==null){
   url.searchParams.set("startFileName",nextName);
   url.searchParams.set("startFileId",nextId);
  }
  const p=checkB2VersionsPage(await get(url.href,"GET",headers),now);
  uploads+=p.uploads;hides+=p.hides;overdue+=p.overdue;pages++;
  if(p.nextFileName===null){nextName=null;break}
  const key=p.nextFileName+"\n"+p.nextFileId;
  if(seen.has(key))FAIL("REPEATED_CURSOR");
  seen.add(key);nextName=p.nextFileName;nextId=p.nextFileId;
 }
 if(nextName!==null)FAIL("CENSUS_EXCEEDS_BOUNDED_PAGES");
 return {schema:RECEIPT_SCHEMA,checked_at:now.toISOString(),
  provider_lifecycle_exact_prefix_verified:true,
  current_prefix_inventory_complete:true,private_originals_exposed:false,
  existing_credential_used:useReadKey?"ARCHIVE_READ":"PRIMARY_ARCHIVE",
  live_versions:uploads,hide_markers:hides,versions_older_than_72h:overdue,
  pages_checked:pages,provider_b2_requests:2+pages,
  past_versions_independently_deleted:false,
  archive_put_get_readback_verified_by_this_audit:false,
  status:overdue>0?"OVERDUE_B2_FILE_VERSIONS_PRESENT":
    uploads===0?"EMPTY_PREFIX_NO_ARCHIVE_PROOF":"CURRENT_PREFIX_NO_OVERDUE_VERSIONS",
  no_payments:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const receipt=await verifyPhase2hB2VersionInventory();
  mkdirSync("artifacts/phase2h",{recursive:true,mode:0o700});
  writeFileSync("artifacts/phase2h/independent-b2-versions.json",
   JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(receipt));
  if(receipt.versions_older_than_72h>0)process.exitCode=3;
 }catch(e){
  console.error(safeB2RetentionError(e));
  process.exitCode=2;
 }
}
