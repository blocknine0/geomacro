#!/usr/bin/env node
/** Run ONLY on the privately controlled issuer's machine, never in CI with
 * real keys. Each role has its OWN protected root, key and review documents.
 * This script does not upload keys, documents, raw news, GROs or payments.
 */
import {createPrivateKey} from "node:crypto";
import {lstatSync,realpathSync,readFileSync,openSync,closeSync,writeFileSync,
 constants} from "node:fs";
import {isAbsolute,resolve,join,relative,sep} from "node:path";
import {pathToFileURL} from "node:url";
import {issueOfflineMachineAuthority,assembleOfflineMachineCommercialRequest}
 from "../lib/geomacro-offline-machine-issuer.mjs";

const FAIL="GEOMACRO_OFFLINE_ISSUER_FAILED_CLOSED";
const fail=()=>{throw Error(FAIL)};
const repo=realpathSync(new URL("../../",import.meta.url));
function inside(p,root){
 const r=relative(root,p);
 return r===""||(!r.startsWith(".."+sep)&&r!==".."&&!isAbsolute(r));
}
function secureRoot(env){
 const raw=env.GEOMACRO_OFFLINE_AUTHORITY_ROOT;
 if(!raw||!isAbsolute(raw))fail();
 const path=realpathSync(raw);
 const st=lstatSync(raw);
 if(st.isSymbolicLink()||!st.isDirectory()||
    (st.mode&0o077)!==0||inside(path,repo))fail();
 if(typeof process.getuid==="function"&&st.uid!==process.getuid())fail();
 return path;
}
function privateFile(path,max,{root}={}){
 if(!isAbsolute(path))fail();
 const physical=realpathSync(path),stat=lstatSync(path);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>max||
    (stat.mode&0o077)!==0||inside(physical,repo)||
    (root&&!inside(physical,root)))fail();
 if(typeof process.getuid==="function"&&stat.uid!==process.getuid())fail();
 const fd=openSync(physical,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{return readFileSync(fd)}finally{closeSync(fd)}
}
function privateChild(root,name,max){
 if(typeof name!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,110}$/u.test(name)||
    name==="."||name==="..")fail();
 return privateFile(join(root,name),max,{root});
}
function inputFiles(root,input){
 if(!input||typeof input!=="object")fail();
 const reviewBytes=privateChild(root,input.review_document_file,64*1024);
 const permissions=Array.isArray(input.permission_documents)?input.permission_documents:[];
 if(permissions.length>4)fail();
 return {
  reviewDocumentBytes:reviewBytes,
  permissionDocumentBytes:permissions.map(item=>({
    source_registry_id:item.source_registry_id,
    bytes:privateChild(root,item.file,128*1024),
  })),
 };
}
function save(root,name,obj){
 if(typeof name!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,110}$/u.test(name)||
    name==="."||name===".."||typeof obj!=="object")fail();
 const path=join(root,name);
 const fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|
   constants.O_NOFOLLOW,0o600);
 try{writeFileSync(fd,JSON.stringify(obj)+"\n","utf8")}finally{closeSync(fd)}
}
export async function runOfflineMachineIssuerCli(args=process.argv.slice(2),env=process.env){
 const flags=Object.fromEntries(args.map(a=>{
   const m=/^--([a-z-]+)=([A-Za-z0-9_.-]{1,110})$/u.exec(a);
   if(!m)fail();return[m[1],m[2]];
 }));
 if(args.length!==Object.keys(flags).length||!["issue","assemble"].includes(flags.mode)||
    !flags.input||!flags.out)fail();
 const root=secureRoot(env);
 const input=JSON.parse(privateChild(root,flags.input,384*1024).toString("utf8"));
 if(flags.mode==="issue"){
  if(!["facts","rights"].includes(flags.role)||
     input.schema!=="geomacro.offline-issuer-submission.v1")fail();
  const name=flags.role.toUpperCase();
  const other=flags.role==="facts"?"RIGHTS":"FACTS";
  const pemPath=env["GEOMACRO_MACHINE_"+name+"_PRIVATE_PEM_FILE"];
  if(!pemPath)fail();
  // Never accept private key bytes in JSON/CLI/logs or in GitHub checkout.
  const pem=privateFile(pemPath,8192).toString("utf8");
  const receipt=await issueOfflineMachineAuthority({
   role:flags.role,proof:input.proof,candidates:input.candidates,
   review:input.review,...inputFiles(root,input),
   privateKeyPem:pem,
   publicKeyPem:env["GEOMACRO_MACHINE_"+name+"_PUBLIC_KEY_PEM"],
   pinnedPublicSha256:env["GEOMACRO_MACHINE_"+name+"_PUBLIC_KEY_SHA256"],
   otherAuthorityPublicSha256:env["GEOMACRO_MACHINE_"+other+"_PUBLIC_KEY_SHA256"],
   groPublicSpkiB64:env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64,
  });
  save(root,flags.out,receipt);
  return {status:"ROLE_SIGNATURE_CREATED_OFFLINE_PRIVATE",role:flags.role,
    signed_public_hot:false,b2_requests:0,d1_writes:0,payments:0};
 }
 if(flags.role||input.schema!=="geomacro.offline-machine-assembly.v1")fail();
 const attestations=[input.facts_attestation_file,input.rights_attestation_file]
  .map(n=>JSON.parse(privateChild(root,n,32*1024).toString("utf8")));
 const payload=assembleOfflineMachineCommercialRequest({
  proof:input.proof,candidates:input.candidates,event:input.event,
  countryName:input.country_name??null,attestations,
  factsPublicPem:env.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM,
  rightsPublicPem:env.GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_PEM,
  factsPublicSha256:env.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256,
  rightsPublicSha256:env.GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256,
  groPublicSpkiB64:env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64,
 });
 save(root,flags.out,payload);
 return {status:"DUAL_OFFLINE_SIGNATURES_VERIFIED_PRIVATE_HANDOFF",
  accepted_for_actual_gro_publication:false,b2_requests:0,d1_writes:0,payments:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 runOfflineMachineIssuerCli().then(x=>console.log(JSON.stringify(x)))
 .catch(()=>{console.error(FAIL);process.exitCode=2});
}
