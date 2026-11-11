#!/usr/bin/env node
// Independently operated Ed25519 attesters supply PUBLIC keys only.
// No derivation from the GeoMacro shared ledger root, GRO signer or fixtures.
import {createHash,createPublicKey,verify as edVerify} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {riskStreamOriginalClaims} from "../../workers/control-plane/src/risk-stream-pipeline.mjs";
const SPKI_PREFIX="302a300506032b6570032100";
function fromB64(value){
 if(typeof value!=="string"||!/^[A-Za-z0-9+/]+={0,2}$/u.test(value))
  throw Error("SHADOW_ATTESTER_BASE64_INVALID");
 const b=Buffer.from(value,"base64");
 if(b.toString("base64")!==value)throw Error("SHADOW_ATTESTER_BASE64_NONCANONICAL");
 return b;
}
export function validateAttesterKeys(facts,rights){
 const names={facts,rights},keys={},fingerprints={};
 for(const [role,value] of Object.entries(names)){
  const raw=fromB64(value);
  if(raw.length!==44||raw.subarray(0,12).toString("hex")!==SPKI_PREFIX)
   throw Error("SHADOW_ATTESTER_ED25519_SPKI_INVALID_"+role);
  const publicKey=createPublicKey({key:raw,format:"der",type:"spki"});
  if(publicKey.asymmetricKeyType!=="ed25519")
   throw Error("SHADOW_ATTESTER_CURVE_INVALID_"+role);
  keys[role]=publicKey;
  fingerprints[role]=createHash("sha256").update(raw).digest("hex");
 }
 if(fingerprints.facts===fingerprints.rights)
  throw Error("SHADOW_INDEPENDENT_ATTESTER_KEYS_REQUIRED");
 return {keys,fingerprints};
}
export function verifyIndependentAttestations(event,keys){
 if(event?.schema!=="geomacro.risk-stream-candidate.v1"||
   event.kind!=="VERIFIED_ORIGINAL"||
   typeof event.raw_payload!=="string"||!event.proof)
  throw Error("SHADOW_ATTESTED_ORIGINAL_REQUIRED");
 const hash=createHash("sha256").update(event.raw_payload).digest("hex");
 if(hash!==event.original_page_sha256)
  throw Error("SHADOW_ORIGINAL_BYTES_HASH_MISMATCH");
 const claim=riskStreamOriginalClaims(event);
 const pairs=[
  ["facts","facts_signature_b64","geomacro.machine-original-facts.v1"],
  ["rights","rights_signature_b64","geomacro.machine-commercial-rights.v1"]
 ];
 for(const [role,field,domain] of pairs){
  const signature=fromB64(event.proof[field]);
  if(signature.length!==64||!edVerify(null,
    Buffer.from(domain+"\n"+claim),keys[role],signature))
   throw Error("SHADOW_ATTESTATION_INVALID_"+role);
 }
 return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const {keys,fingerprints}=validateAttesterKeys(
   process.env.RISK_STREAM_MACHINE_FACTS_SPKI_B64,
   process.env.RISK_STREAM_MACHINE_RIGHTS_SPKI_B64);
  if(process.argv[2]!=="verify"||!process.argv[3])
   throw Error("USAGE_verify_REAL_ATTESTED_CANDIDATES_JSONL");
  const events=readFileSync(process.argv[3],"utf8").trim().split("\n").map(JSON.parse);
  if(!events.length||events.length>50)throw Error("SHADOW_ATTESTER_SAMPLE_COUNT_INVALID");
  for(const event of events)verifyIndependentAttestations(event,keys);
  console.log(JSON.stringify({status:"REAL_INDEPENDENT_ATTESTATION_SIGNATURES_VERIFIED",
   checked:events.length,fingerprints,commercial_release_authorized:false}));
 }catch(e){console.error(String(e?.message||e));process.exitCode=1}
}
