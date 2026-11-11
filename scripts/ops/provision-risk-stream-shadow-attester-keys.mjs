#!/usr/bin/env node
/**
 * Provision REAL independently controlled public Ed25519 attester keys.
 *
 * This tool intentionally DOES NOT create key pairs, sign facts, or manufacture
 * commercial-rights evidence. The independently operated attesters must supply
 * the two public keys and signed real-original candidate JSONL beforehand.
 *
 * Default is a non-mutating preflight. --apply writes ONLY public keys to the
 * protected GitHub environment; optionally to the already-isolated shadow Worker.
 */
import {spawnSync} from "node:child_process";
import {createPublicKey} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {validateAttesterKeys,verifyIndependentAttestations}
 from "../lib/risk-stream-shadow-attesters.mjs";

const REPO="blocknine0/geomacro",ENV="production";
const FACTS="RISK_STREAM_MACHINE_FACTS_SPKI_B64";
const RIGHTS="RISK_STREAM_MACHINE_RIGHTS_SPKI_B64";
function assert(condition,code){if(!condition)throw Error(code)}
function publicSpki(file){
 const value=readFileSync(file,"utf8").trim();
 if(value.startsWith("-----BEGIN PUBLIC KEY-----")){
  const key=createPublicKey(value);
  assert(key.asymmetricKeyType==="ed25519","EXPECTED_ED25519_PUBLIC_KEY");
  return key.export({format:"der",type:"spki"}).toString("base64");
 }
 return value;
}
function verifySample(file,keys){
 const lines=readFileSync(file,"utf8").trim().split(/\r?\n/u).filter(Boolean);
 assert(lines.length>0&&lines.length<=50,"REAL_ORIGINAL_SAMPLE_COUNT_1_TO_50");
 for(const line of lines){
  assert(line.length<=300000,"SAMPLE_RECORD_TOO_LARGE");
  let item;try{item=JSON.parse(line)}catch{throw Error("SIGNED_SAMPLE_JSON_INVALID")}
  verifyIndependentAttestations(item,keys);
 }
 return lines.length;
}
function workerConfig(file){
 const cfg=JSON.parse(readFileSync(file,"utf8"));
 assert(cfg.name==="geomacro-risk-stream-shadow"&&
  cfg.vars?.STREAM_MODE==="SHADOW_AUDIT"&&
  cfg.vars?.RISK_STREAM_ACTIVE==="0"&&
  cfg.vars?.STREAM_INGESTION_ENABLED==="false"&&
  cfg.d1_databases?.length===1&&
  cfg.d1_databases[0].database_name==="geomacro-risk-stream-shadow"&&
  cfg.r2_buckets?.length===1&&
  cfg.r2_buckets[0].bucket_name==="geomacro-risk-stream-shadow-private"&&
  !cfg.routes,"NOT_ISOLATED_SHADOW_WORKER_CONFIG");
}
function command(name,args,stdin){
 const r=spawnSync(name,args,{input:stdin,encoding:"utf8",timeout:60000,
  maxBuffer:200000});
 if(r.error||r.status!==0)
  throw Error("PUBLIC_KEY_PROVISION_FAILED_"+name+"_"+(r.status??"EXEC"));
 // Never print stdout/stderr, which could expose operator input.
}
export function preflight({factsFile,rightsFile,sampleFile}){
 const facts=publicSpki(factsFile),rights=publicSpki(rightsFile);
 const {keys,fingerprints}=validateAttesterKeys(facts,rights);
 const checked=verifySample(sampleFile,keys);
 return {facts,rights,checked,fingerprints};
}
export function provision({facts,rights,configFile=null}){
 for(const [key,value] of [[FACTS,facts],[RIGHTS,rights]])
  command("gh",["secret","set",key,"--repo",REPO,"--env",ENV],value+"\n");
 if(configFile){
  workerConfig(configFile);
  for(const [key,value] of [[FACTS,facts],[RIGHTS,rights]])
   command("npx",["-y","wrangler@4.136.3","secret","put",key,
    "--config",configFile],value+"\n");
 }
}
async function main(argv){
 const apply=argv.includes("--apply");
 const w=argv.indexOf("--worker-config");
 assert(w===-1||w===3||w===4,"WORKER_CONFIG_FLAG_POSITION_INVALID");
 const filenames=argv.filter(x=>x!=="--apply"&&x!=="--worker-config");
 assert(argv.filter(x=>x==="--apply").length<=1,"DUPLICATE_APPLY");
 const configFile=w===-1?null:argv[w+1];
 if(configFile){
  const i=filenames.indexOf(configFile);
  if(i!==-1)filenames.splice(i,1);
 }
 assert(filenames.length===3&&
  (!configFile||apply),"USAGE_facts.spki_b64_rights.spki_b64_real-originals.jsonl_--apply_[--worker-config_file]");
 if(configFile)workerConfig(configFile);
 const p=preflight({factsFile:filenames[0],rightsFile:filenames[1],
  sampleFile:filenames[2]});
 if(apply)provision({...p,configFile});
 console.log(JSON.stringify({
  schema:"geomacro.shadow-public-attester-provision.v1",
  status:apply?"PUBLIC_KEYS_UPLOADED_REAL_ATTESTATION_SAMPLES_VERIFIED":
   "NON_MUTATING_ATTESTER_PREFLIGHT_PASS",
  verified_real_original_samples:p.checked,
  public_key_sha256:p.fingerprints,
  github_environment:ENV,shadow_worker_binding_applied:!!(apply&&configFile),
  independent_operator_ownership_requires_external_governance_proof:true,
  public_keys_are_not_signing_or_rights_authority:true,
  signed_gro_count_not_asserted:true,commercial_release_authorized:false
 }));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main(process.argv.slice(2)).catch(e=>{
  console.error(String(e?.message||e).slice(0,160));process.exitCode=1;
 });
