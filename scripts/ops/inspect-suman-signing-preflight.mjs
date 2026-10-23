#!/usr/bin/env node
// Safe, metadata-only, no-funds checklist for Suman's private interactive signer.
// Does NOT access private-key bytes, print paths, sign, dispatch or approve data.
import {existsSync,readFileSync,realpathSync,statSync} from "node:fs";
import {isAbsolute,dirname,relative} from "node:path";
import {userInfo} from "node:os";
import {createHash,createPublicKey} from "node:crypto";
import {pathToFileURL} from "node:url";

const required = Object.freeze({
  GEOMACRO_SUMAN_PRIVATE_KEY_PATH:"key",
  GEOMACRO_SUMAN_UNSIGNED_GRI_PATH:"gri",
  GEOMACRO_SUMAN_UNSIGNED_CERTIFICATES_PATH:"certs",
  GEOMACRO_SUMAN_SIGNED_GRI_OUTPUT_PATH:"gri_out",
  GEOMACRO_SUMAN_SIGNED_CERTIFICATES_OUTPUT_PATH:"certs_out"
});
const isHex = s=>typeof s==="string"&&/^[a-f0-9]{64}$/u.test(s);
const sha = b=>createHash("sha256").update(b).digest("hex");
const resultState=(issues,user)=>({
 schema:"geomacro.suman-private-signing-preflight.v1",
 status:issues.length?"BLOCKED_NOT_SAFE_TO_SIGN":"INPUT_SHAPES_PRESENT_REQUIRES_INDEPENDENT_HUMAN_REVIEW",
 os_account_matches_documented_suman_user:user==="suman-gri",
 issues:[...new Set(issues)],
 private_key_bytes_read:false,
 approval_or_independent_review_verified:false,
 commercial_rights_verified:false,
 public_signed_products_verified:false,
 signatures_created:0, b2_requests:0, d1_writes:0, payments:0
});

export function inspectSumanSigningInputs(env={}, {
 username="unknown",cwd=process.cwd()
}={}){
 const issues=[];
 if(username!=="suman-gri")issues.push("USE_SUMAN_OWN_PROTECTED_OS_SESSION");
 const paths={};
 for(const [name,label] of Object.entries(required)){
  const value=env[name];
  if(!isAbsolute(value??"")){
   issues.push("ABSOLUTE_PATH_UNSET_OR_INVALID_"+label.toUpperCase());
  }else paths[label]=value;
 }
 const file=(label,bytesMax)=>{
  const p=paths[label];if(!p)return null;
  try{
   const st=statSync(p);
   if(!st.isFile())throw Error("NOT_FILE");
   if(process.platform!=="win32"&&label==="key"&&(st.mode&0o077)!==0)
    issues.push("SIGNER_KEY_NOT_PRIVATE_0600");
   if(bytesMax!==undefined&&(st.size<10||st.size>bytesMax)){
    issues.push("INPUT_SIZE_INVALID_"+label.toUpperCase());
    return null;
   }
   return p;
  }catch{
   issues.push("FILE_MISSING_OR_UNREADABLE_"+label.toUpperCase());
   return null;
  }
 };
 file("key");
 const gri=file("gri",900000);
 const certs=file("certs",450000);
 const actualCwd=(()=>{try{return realpathSync(cwd)}catch{return null}})();
 const dirs={};
 for(const label of ["gri_out","certs_out"]){
  const p=paths[label];if(!p)continue;
  if(existsSync(p)){issues.push("SIGNED_OUTPUT_ALREADY_EXISTS_"+label.toUpperCase());continue;}
  try{
   const dir=realpathSync(dirname(p));
   const st=statSync(dir);
   if(!st.isDirectory()||(process.platform!=="win32"&&(st.mode&0o077)!==0))
    issues.push("OUTPUT_DIRECTORY_NOT_PRIVATE_0700_"+label.toUpperCase());
   const rel=actualCwd===null?"":relative(actualCwd,dir);
   if(actualCwd===null||rel===""||(!rel.startsWith("..")&&!isAbsolute(rel)))
    issues.push("OUTPUT_DIRECTORY_MUST_BE_OUTSIDE_REPOSITORY_"+label.toUpperCase());
   dirs[label]=dir;
  }catch{issues.push("OUTPUT_DIRECTORY_MISSING_OR_UNREADABLE_"+label.toUpperCase());}
 }
 if(paths.gri_out&&paths.certs_out&&paths.gri_out===paths.certs_out)
  issues.push("OUTPUT_FILES_MUST_BE_DISTINCT");
 const json=(p,label)=>{
  if(!p)return null;
  try{return JSON.parse(readFileSync(p,"utf8"))}
  catch{issues.push("INPUT_JSON_MISSING_OR_INVALID_"+label.toUpperCase());return null}
 };
 const input=json(gri,"gri");
 if(input&&(
    input.schema!=="geomacro.gri-v12-reviewed-current-input.v1"||
    input.private_only!==false||
    input.publication_review_authorized!==true||
    !Array.isArray(input.customerRows)||input.customerRows.length<3||
    !Array.isArray(input.events)||input.events.length<3
   ))issues.push("REVIEWED_GRI_STRUCTURE_INCOMPLETE");
 const cells=json(certs,"certs");
 if(cells&&(!Array.isArray(cells)||cells.length<3||cells.length>80))
  issues.push("COUNTRY_CERTIFICATE_ARRAY_SHAPE_INVALID");
 else if(Array.isArray(cells)){
  const seen=new Set();
  for(const cell of cells){
   if(!cell||cell.schema!=="geomacro.current-country-category-certification.v1"||
      cell.certification_state!=="CERTIFIED"||
      !/^[A-Z]{3}$/u.test(cell.country_iso3??"")||
      typeof cell.category!=="string"||
      !Array.isArray(cell.source_ids)||cell.source_ids.length<2){
    issues.push("COUNTRY_CERTIFICATE_STRUCTURE_INCOMPLETE");break;
   }
   const id=cell.country_iso3+"|"+cell.category;
   if(seen.has(id)){issues.push("COUNTRY_CERTIFICATE_DUPLICATE");break;}
   seen.add(id);
  }
 }
 if(!env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM||
    !isHex(env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256))
  issues.push("REVIEWER_PUBLIC_PEM_OR_APPROVED_PIN_UNSET");
 else{
  try{
   const pk=createPublicKey(env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM);
   if(pk.asymmetricKeyType!=="ed25519"||
      sha(pk.export({type:"spki",format:"der"}))!==env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256)
     issues.push("REVIEWER_PUBLIC_PEM_PIN_MISMATCH");
  }catch{issues.push("REVIEWER_PUBLIC_PEM_INVALID");}
 }
 return resultState(issues,username);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==3||process.argv[2]!=="--inspect-only-no-funds"){
  console.error("SUMAN_PREFLIGHT_INSPECT_ONLY_FLAG_REQUIRED");
  process.exitCode=2;
 }else{
  let user="unknown";
  try{user=userInfo().username}catch{}
  const r=inspectSumanSigningInputs(process.env,{username:user});
  console.log(JSON.stringify(r));
  if(r.status!=="INPUT_SHAPES_PRESENT_REQUIRES_INDEPENDENT_HUMAN_REVIEW")
   process.exitCode=2;
 }
}
