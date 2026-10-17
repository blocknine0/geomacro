#!/usr/bin/env bun
/** Private founder-controlled reviewer-free machine GRO RESEARCH signing only.
 * No public x402, D1 writes, B2 PUT, Supabase or partner allowance.
 * The actual original-page readback and B2 rights preflight happen in the
 * imported server routine. This script has NO independent reviewer key gate.
 */
import {createHash} from "node:crypto";
import {closeSync,constants,openSync,readFileSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {assertPrivateReviewPaths} from "./accept-private-live-on-demand-gro";
import {signGeomacroMachinePrivateResearchGRO}
  from "../../src/lib/geomacro-machine-research-gro.server";
import {loadRiskObjectVerificationKeysFromEnv}
  from "../../src/lib/risk-object-signing.server";
import type {MachineOriginalWithRegistry}
  from "../../src/lib/geomacro-machine-source-rights.server";
import type {CountryRiskEventInput}
  from "../../src/lib/country-risk-engine";
const FAIL="GEOMACRO_MACHINE_RESEARCH_PRIVATE_ACCEPTANCE_FAILED";
const MAX_OUTPUT_BYTES=256*1024;
function signer(){
  const key_id=process.env.RISK_OBJECT_SIGNING_KEY_ID;
  const private_key_pkcs8_b64=process.env.RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64;
  const public_key_spki_b64=process.env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64;
  if(!key_id||!private_key_pkcs8_b64||!public_key_spki_b64)throw Error(FAIL);
  return {key_id,private_key_pkcs8_b64,public_key_spki_b64};
}
export async function acceptGeomacroMachineResearchGRO(
  inputPath:string,outputPath:string,
):Promise<{status:"SIGNED_PRIVATE_RESEARCH_ONLY_NOT_PAID";
  record_sha256:string;country_iso3:string;category:string}>{
  // 0700 owner-only private directory OUTSIDE repository, input 0600,
  // no symlink escapes and output O_EXCL O_NOFOLLOW; reused strict guard.
  const paths=assertPrivateReviewPaths(inputPath,outputPath);
  const raw=readFileSync(paths.input,"utf8");
  let input:any;
  try{input=JSON.parse(raw)}catch{throw Error(FAIL)}
  if(!input||input.schema!=="geomacro.private-machine-gro-request.v1"||
    typeof input.category!=="string"||
    !/^[A-Z]{3}$/.test(input.country_iso3)||
    !input.event||!Array.isArray(input.candidates)||
    input.candidates.length<2||input.candidates.length>4)
    throw Error(FAIL);
  const signed=await signGeomacroMachinePrivateResearchGRO({
    category:input.category,country_iso3:input.country_iso3,
    country_name:input.country_name??null,
    event:input.event as CountryRiskEventInput,
    candidates:input.candidates as MachineOriginalWithRegistry[],
    now:new Date(),
  },{
    signingMaterial:signer(),
    verificationKeys:loadRiskObjectVerificationKeysFromEnv(),
  });
  if(!signed.gro_signature_verified||signed.licensed_commercial_delivery_allowed||
    signed.x402_payment_authorized||signed.semantic_same_event_claim_verified||
    signed.article_commercial_rights_verified||
    signed.public_hot_published||
    createHash("sha256").update(signed.signed_gro_canonical_json,"utf8")
      .digest("hex")!==signed.record_sha256)
    throw Error(FAIL);
  const serialized=JSON.stringify(signed);
  if(Buffer.byteLength(serialized,"utf8")>MAX_OUTPUT_BYTES)throw Error(FAIL);
  let fd:number|undefined;
  try{
    fd=openSync(paths.output,constants.O_CREAT|constants.O_EXCL|
      constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
    writeFileSync(fd,serialized+"\n","utf8");
    closeSync(fd);fd=undefined;
  }finally{if(fd!==undefined)closeSync(fd)}
  return {status:"SIGNED_PRIVATE_RESEARCH_ONLY_NOT_PAID",
    record_sha256:signed.record_sha256,
    country_iso3:input.country_iso3,category:input.category};
}
async function main(){
  const args=process.argv.slice(2);
  const input=args.find(x=>x.startsWith("--input="))?.slice(8);
  const out=args.find(x=>x.startsWith("--out="))?.slice(6);
  if(!input||!out||args.length!==2)throw Error(FAIL);
  const result=await acceptGeomacroMachineResearchGRO(input,out);
  console.log(JSON.stringify(result));
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(()=>{console.error(FAIL);process.exitCode=3});
}
