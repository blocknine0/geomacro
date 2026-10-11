#!/usr/bin/env bun
/**
 * Manual-only, owner-controlled FIRST GENUINE LIVE signed GRO acceptance.
 *
 * Use with a *real* private independently reviewed, reviewer-Ed25519-signed
 * original-event bundle. Never put review evidence, keys, or output in GitHub,
 * Actions artifacts, stdout, public D1, or a repository directory.
 *
 * No public API, B2 PUT, Supabase read/write, D1 write, x402 or partner call.
 * Missing live evidence, trusted review key, rights or signer = NO ARTIFACT.
 */
import { createHash } from "node:crypto";
import {
  closeSync, constants, lstatSync, openSync, readFileSync,
  realpathSync, writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  scoreAndSignQualifiedOnDemandCountry,
  type OnDemandCountryScoringInput,
} from "../../src/lib/on-demand-qualified-country-risk.server";
import {
  createReviewedRightsOnDemandQualifier,
  type TrustedReviewBundle,
} from "../../src/lib/on-demand-reviewed-rights-qualifier.server";
import { loadRiskObjectVerificationKeysFromEnv } from "../../src/lib/risk-object-signing.server";

const MAX_REVIEW_INPUT_BYTES=1024*1024;
const MAX_SIGNED_OUTPUT_BYTES=256*1024;
const ISO=/^[A-Z]{3}$/;
const MODES=new Set(["geopolitics","macro","rare_earth"]);
const REPO_ROOT=realpathSync(new URL("../../",import.meta.url));
const FAIL="ON_DEMAND_LIVE_GRO_ACCEPTANCE_FAILED";

function inside(root:string,target:string):boolean {
  const suffix=relative(root,target);
  return suffix==="" || (suffix!==".." && !suffix.startsWith(".."+sep) && !isAbsolute(suffix));
}
function securedDirectory():string {
  const configured=process.env.GEOMACRO_PRIVATE_REVIEW_DIR;
  if(!configured || !isAbsolute(configured))throw Error(FAIL);
  const real=realpathSync(configured);
  const stat=lstatSync(real);
  if(!stat.isDirectory() || (stat.mode & 0o077)!==0 ||
     (typeof process.getuid==="function" && stat.uid!==process.getuid()) ||
     inside(REPO_ROOT,real))throw Error(FAIL);
  return real;
}
/** Protected unit-testable path guard; rejected symlinks can never escape dir. */
export function assertPrivateReviewPaths(inputPath:string,outPath:string):{
  input:string;output:string;
} {
  const root=securedDirectory();
  if(!inputPath || !outPath || !isAbsolute(inputPath) || !isAbsolute(outPath) ||
     inputPath===outPath)throw Error(FAIL);
  const inputReal=realpathSync(inputPath);
  const stat=lstatSync(inputPath);
  if(!stat.isFile() || stat.isSymbolicLink() ||
     stat.size<1 || stat.size>MAX_REVIEW_INPUT_BYTES ||
     (stat.mode&0o077)!==0 ||
     (typeof process.getuid==="function" && stat.uid!==process.getuid()) ||
     !inside(root,inputReal) || inside(REPO_ROOT,inputReal))throw Error(FAIL);
  const outputDir=realpathSync(dirname(outPath));
  const output=resolve(outputDir,outPath.split(sep).at(-1)!);
  if(!inside(root,output) || inside(REPO_ROOT,output) ||
     output===inputReal || outputDir!==root)throw Error(FAIL);
  return {input:inputReal,output};
}

export function parsePrivateReviewedRequest(raw:string):{
  category:"geopolitics"|"macro"|"rare_earth";
  country_iso3:string;
  country_name?:string|null;
  events:OnDemandCountryScoringInput["events"];
  review_bundle:TrustedReviewBundle;
}{
  let item:unknown;
  try{item=JSON.parse(raw)}catch{throw Error(FAIL)}
  if(!item || typeof item!=="object" || Array.isArray(item))throw Error(FAIL);
  const data=item as Record<string,unknown>;
  if(data.schema!=="geomacro.private-on-demand-gro-review-bundle.v1" ||
     !MODES.has(String(data.category)) || !ISO.test(String(data.country_iso3)) ||
     (data.country_name!=null && (typeof data.country_name!=="string" ||
       data.country_name.length>120)) ||
     !Array.isArray(data.events) || data.events.length<1 ||
     data.events.length>12 || !data.review_bundle ||
     typeof data.review_bundle!=="object" ||
     !Array.isArray((data.review_bundle as TrustedReviewBundle).rows) ||
     !Array.isArray((data.review_bundle as TrustedReviewBundle).eventPackages) ||
     (data.review_bundle as TrustedReviewBundle).rows.length!==data.events.length ||
     (data.review_bundle as TrustedReviewBundle).eventPackages.length!==data.events.length)
    throw Error(FAIL);
  return {
    category:data.category as "geopolitics"|"macro"|"rare_earth",
    country_iso3:data.country_iso3 as string,
    country_name:data.country_name as string|null|undefined,
    events:data.events as OnDemandCountryScoringInput["events"],
    review_bundle:data.review_bundle as TrustedReviewBundle,
  };
}
function trustedSigner() {
  const key_id=process.env.RISK_OBJECT_SIGNING_KEY_ID;
  const private_key_pkcs8_b64=process.env.RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64;
  const public_key_spki_b64=process.env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64;
  if(!key_id || !private_key_pkcs8_b64 || !public_key_spki_b64 ||
     !process.env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM)
    throw Error(FAIL);
  return {key_id,private_key_pkcs8_b64,public_key_spki_b64};
}

/** Manual-private run only, executed in Node/Bun with a secure filesystem. */
export async function acceptReviewedLiveGRO(inputPath:string,outPath:string):
  Promise<{status:"SIGNED_PRIVATE_NOT_PAID";record_sha256:string;category:string;country_iso3:string}> {
  const privatePaths=assertPrivateReviewPaths(inputPath,outPath);
  const reviewed=parsePrivateReviewedRequest(readFileSync(privatePaths.input,"utf8"));
  const signer=trustedSigner();
  const artifact=await scoreAndSignQualifiedOnDemandCountry({
    category:reviewed.category,country_iso3:reviewed.country_iso3,
    country_name:reviewed.country_name,events:reviewed.events,now:new Date(),
  },{
    qualifyEvidence:createReviewedRightsOnDemandQualifier(reviewed.review_bundle),
    signingMaterial:signer,
    verificationKeys:loadRiskObjectVerificationKeysFromEnv(),
  });
  if(artifact.locally_verified!==true || artifact.payment_authorized!==false ||
     artifact.external_partner_approved!==false || artifact.persistence_performed!==false ||
     artifact.subject_id!==reviewed.country_iso3 ||
     createHash("sha256").update(artifact.signed_risk_object_json,"utf8").digest("hex")!==
       artifact.record_sha256)throw Error(FAIL);
  const serialized=JSON.stringify({
    schema:"geomacro.private-reviewed-on-demand-signed-gro.v1",
    // The exact signed canonical bytes must survive downstream independent
    // verifier replay. This file is private and never customer-facing.
    canonical_signed_gro_json:artifact.signed_risk_object_json,
    record_sha256:artifact.record_sha256,
    payload_hash:artifact.payload_hash,
    signing_key_id:artifact.signing_key_id,
    category:reviewed.category,country_iso3:reviewed.country_iso3,
    local_signature_verified:true,
    independent_partner_approved:false,
    payment_authorized:false,public_current_hot_verified:false,
  });
  if(Buffer.byteLength(serialized,"utf8")>MAX_SIGNED_OUTPUT_BYTES)throw Error(FAIL);
  let fd:number|undefined;
  try{
    fd=openSync(privatePaths.output,constants.O_CREAT|constants.O_EXCL|
      constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
    writeFileSync(fd,serialized+"\n","utf8");
    closeSync(fd);fd=undefined;
  }finally{if(fd!==undefined)closeSync(fd);}
  return {
    status:"SIGNED_PRIVATE_NOT_PAID",record_sha256:artifact.record_sha256,
    category:reviewed.category,country_iso3:reviewed.country_iso3,
  };
}

async function main(){
  const args=process.argv.slice(2);
  const input=args.find(x=>x.startsWith("--input="))?.slice("--input=".length);
  const out=args.find(x=>x.startsWith("--out="))?.slice("--out=".length);
  if(!input || !out || args.length!==2)throw Error(FAIL);
  const verified=await acceptReviewedLiveGRO(input,out);
  // Only metadata: NEVER log private signed bytes, source, vendor, rights or key.
  console.log(JSON.stringify(verified));
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(()=>{console.error(FAIL);process.exitCode=3});
}
