#!/usr/bin/env bun
/**
 * Reviewer-FREE but audited and separately article-rights approved:
 * private CANONICAL GRO preparation. No customer API, funds or publication.
 *
 * Input/output: owner-only directory outside repo, file mode 0600.
 * Inputs MUST be trusted, independently signed machine-facts + legal-rights
 * attestations; an owner asserting two booleans is not commercial acceptance.
 */
import {createHash} from "node:crypto";
import {closeSync,constants,openSync,readFileSync,writeFileSync}
 from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {assertPrivateReviewPaths} from "./accept-private-live-on-demand-gro";
import {prepareGeomacroMachineCommercialGRO}
 from "../../src/lib/geomacro-machine-commercial-qualification.server";
import {loadRiskObjectVerificationKeysFromEnv}
 from "../../src/lib/risk-object-signing.server";

const FAIL="GEOMACRO_MACHINE_COMMERCIAL_PRIVATE_ACCEPTANCE_FAILED";
const MAX_OUT=256*1024;
function signer(){
  const key_id=process.env.RISK_OBJECT_SIGNING_KEY_ID;
  const private_key_pkcs8_b64=process.env.RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64;
  const public_key_spki_b64=process.env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64;
  if(!key_id||!private_key_pkcs8_b64||!public_key_spki_b64)
    throw Error(FAIL);
  return {key_id,private_key_pkcs8_b64,public_key_spki_b64};
}
export function parsePrivateMachineCommercialRequest(raw:string){
  let data:unknown;
  try{data=JSON.parse(raw)}catch{throw Error(FAIL)}
  if(!data||typeof data!=="object"||Array.isArray(data))throw Error(FAIL);
  const x=data as Record<string,unknown>;
  const category=x.category;
  if(x.schema!=="geomacro.private-machine-commercial-request.v1"||
     !["geopolitics","macro","rare_earth"].includes(String(category))||
     !/^[A-Z]{3}$/u.test(String(x.country_iso3))||
     (x.country_name!=null&&(typeof x.country_name!=="string"||x.country_name.length>120))||
     !x.event||typeof x.event!=="object"||Array.isArray(x.event)||
     !Array.isArray(x.candidates)||x.candidates.length<2||x.candidates.length>4||
     !x.envelope||typeof x.envelope!=="object"||
     Array.isArray(x.envelope))
    throw Error(FAIL);
  // The exact dual-signed proof is validated by the trusted verifier; it may
  // not import any customer-provided public keys or signing authorization.
  if("payment_authorized" in x||"public_hot_published" in x||
     "independent_reviewer_attested" in x||"profile" in x||
     "signingMaterial" in x||"verificationKeys" in x)throw Error(FAIL);
  return {
    category:category as "geopolitics"|"macro"|"rare_earth",
    country_iso3:x.country_iso3 as string,
    country_name:x.country_name as string|null|undefined,
    event:x.event,
    candidates:x.candidates,envelope:x.envelope,
  };
}
export async function acceptMachineCommercialPrivateGRO(inputPath:string,outputPath:string):
 Promise<{status:"MACHINE_COMMERCIAL_SIGNED_PRIVATE_NO_FUNDS";
   country_iso3:string;category:string;record_sha256:string}>{
  const paths=assertPrivateReviewPaths(inputPath,outputPath);
  const input=parsePrivateMachineCommercialRequest(readFileSync(paths.input,"utf8"));
  const signed=await prepareGeomacroMachineCommercialGRO({
    category:input.category,country_iso3:input.country_iso3,
    country_name:input.country_name,
    events:[input.event as import("../../src/lib/country-risk-engine").CountryRiskEventInput],
    now:new Date(),
  },{
    candidates:input.candidates as import("../../src/lib/geomacro-machine-source-rights.server").MachineOriginalWithRegistry[],
    envelope:input.envelope as import("../../src/lib/geomacro-machine-commercial-qualification.server").MachineCommercialEnvelope,
  },{
    signingMaterial:signer(),
    verificationKeys:loadRiskObjectVerificationKeysFromEnv(),
  });
  if(signed.profile!=="CANONICAL"||!signed.locally_verified||
     signed.payment_authorized!==false||signed.persistence_performed!==false||
     signed.live_review_authorized!==false||signed.external_partner_approved!==false||
     signed.subject_id!==input.country_iso3||
     createHash("sha256").update(signed.signed_risk_object_json).digest("hex")!==
       signed.record_sha256)throw Error(FAIL);
  const output=JSON.stringify({
    schema:"geomacro.private-machine-commercial-prepared-gro.v1",
    profile:"GEOMACRO_AUTOMATED_CROSS_SOURCE_NOT_EXTERNAL_REVIEWED_V1",
    country_iso3:input.country_iso3,category:input.category,
    record_sha256:signed.record_sha256,
    signing_key_id:signed.signing_key_id,
    canonical_signed_gro_json:signed.signed_risk_object_json,
    local_signature_verified:true,
    rights_policy_attested:true,
    machine_same_event_attested:true,
    external_reviewer_attested:false,
    independently_published_and_readback_verified:false,
    paid_customer_delivery_authorized:false,
    x402_payment_authorized:false,
    persistence_performed:false,
  });
  if(Buffer.byteLength(output,"utf8")>MAX_OUT)throw Error(FAIL);
  let fd:number|undefined;
  try{
    fd=openSync(paths.output,constants.O_CREAT|constants.O_EXCL|
      constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
    writeFileSync(fd,output+"\n","utf8");
    closeSync(fd);fd=undefined;
  }finally{if(fd!==undefined)closeSync(fd)}
  return {status:"MACHINE_COMMERCIAL_SIGNED_PRIVATE_NO_FUNDS",
    country_iso3:input.country_iso3,category:input.category,
    record_sha256:signed.record_sha256};
}
async function main(){
  const args=process.argv.slice(2);
  const input=args.find(x=>x.startsWith("--input="))?.slice(8);
  const out=args.find(x=>x.startsWith("--out="))?.slice(6);
  if(!input||!out||args.length!==2)throw Error(FAIL);
  const result=await acceptMachineCommercialPrivateGRO(input,out);
  console.log(JSON.stringify(result));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(()=>{console.error(FAIL);process.exitCode=3});
}
