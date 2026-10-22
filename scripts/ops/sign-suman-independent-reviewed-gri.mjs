#!/usr/bin/env node
// Offline Suman Dey reviewed-GRI package signer, same Ed25519 identity for
// one GRI object and ALL country/category cells. Never create assertions:
// only cryptographically sign existing, human-inspected structured inputs.
import {readFileSync,writeFileSync,statSync,existsSync,realpathSync} from "node:fs";
import {isAbsolute,dirname,relative} from "node:path";
import {createPrivateKey,createPublicKey,createHash,sign,verify} from "node:crypto";
import {createInterface} from "node:readline/promises";
import {pathToFileURL} from "node:url";
import {readHumanKeyPassphrase} from "../lib/read-human-key-passphrase.mjs";
const fail=s=>{throw Error("SUMAN_INDEPENDENT_REVIEW_"+s)};
const sha=b=>createHash("sha256").update(b).digest("hex");
const HEX=/^[a-f0-9]{64}$/u;
export function signSumanIndependentReview({
 privateKey,privateKeyPassphrase,reviewerPublicKeyPem,reviewerApprovedSpkiSha256,
 unsignedGri,unsignedCountryCertificates
}={}){
 let priv,pub;
 try{
  priv=createPrivateKey(privateKeyPassphrase===undefined?privateKey:
    {key:privateKey,passphrase:privateKeyPassphrase});
  pub=createPublicKey(reviewerPublicKeyPem);
  if(priv.asymmetricKeyType!=="ed25519"||pub.asymmetricKeyType!=="ed25519")
   fail("ED25519_KEY_REQUIRED");
 }catch{fail("VALID_INDEPENDENT_ED25519_KEY_REQUIRED");}
 const actual=sha(createPublicKey(priv).export({format:"der",type:"spki"}));
 if(!HEX.test(reviewerApprovedSpkiSha256??"")||
    actual!==reviewerApprovedSpkiSha256||
    sha(pub.export({format:"der",type:"spki"}))!==actual)
    fail("APPROVED_SUMAN_SIGNER_KEY_NOT_MATCHED");
 if(!unsignedGri||typeof unsignedGri!=="object"||
    Array.isArray(unsignedGri)||unsignedGri.schema!==
     "geomacro.gri-v12-reviewed-current-input.v1"||
    unsignedGri.private_only!==false||
    unsignedGri.publication_review_authorized!==true||
    !Array.isArray(unsignedGri.customerRows)||unsignedGri.customerRows.length<3||
    !Array.isArray(unsignedGri.events)||unsignedGri.events.length<3||
    !Array.isArray(unsignedCountryCertificates)||
    unsignedCountryCertificates.length<3||
    unsignedCountryCertificates.length>80)
    fail("ACTUAL_REVIEWED_INPUT_STRUCTURE_REQUIRED");
 const signOne=value=>{
  const bytes=Buffer.from(JSON.stringify(value),"utf8");
  const sig=sign(null,bytes,priv);
  if(sig.length!==64||!verify(null,bytes,pub,sig))
   fail("LOCAL_SIGNATURE_SELF_CHECK_FAILED");
  return {signed_input:value,review_signature_base64:sig.toString("base64")};
 };
 const seen=new Set();
 for(const cert of unsignedCountryCertificates){
  if(!cert||typeof cert!=="object"||
     cert.schema!=="geomacro.current-country-category-certification.v1"||
     cert.certification_state!=="CERTIFIED"||
     !/^[A-Z]{3}$/u.test(cert.country_iso3??"")||
     typeof cert.category!=="string"||
     !Array.isArray(cert.source_ids)||cert.source_ids.length<2)
    fail("GENUINE_COUNTRY_CATEGORY_CERT_REQUIRED");
  const id=cert.country_iso3+"|"+cert.category;
  if(seen.has(id))fail("DUPLICATE_COUNTRY_CATEGORY_CERT");seen.add(id);
 }
 return {
  reviewedGri:signOne(unsignedGri),
  countryCertificates:unsignedCountryCertificates.map(signOne),
  // Successful local signing is not independent factual/legal attestation.
  // Canonical publisher must check every claim against original bytes.
  status:"LOCAL_SIGNATURES_ONLY_PENDING_CANONICAL_REVIEW"
 };
}
async function main(env=process.env){
 if(process.argv.length!==3||process.argv[2]!=="--human-sign-reviewed-gri"||
    env.CI==="true"||env.GITHUB_ACTIONS==="true"||
    !process.stdin.isTTY||!process.stdout.isTTY)
   fail("PRIVATE_HUMAN_INTERACTIVE_ONLY");
 const privatePath=env.GEOMACRO_SUMAN_PRIVATE_KEY_PATH;
 const griInput=env.GEOMACRO_SUMAN_UNSIGNED_GRI_PATH;
 const certInput=env.GEOMACRO_SUMAN_UNSIGNED_CERTIFICATES_PATH;
 const griOutput=env.GEOMACRO_SUMAN_SIGNED_GRI_OUTPUT_PATH;
 const certOutput=env.GEOMACRO_SUMAN_SIGNED_CERTIFICATES_OUTPUT_PATH;
 for(const p of [privatePath,griInput,certInput,griOutput,certOutput]){
  if(!isAbsolute(p??""))fail("ABSOLUTE_LOCAL_PATH_REQUIRED");
 }
 if(griOutput===certOutput||existsSync(griOutput)||existsSync(certOutput))
  fail("IMMUTABLE_OUTPUT_REQUIRED");
 const repo=realpathSync(process.cwd());
 for(const p of [griOutput,certOutput]){
  const dir=realpathSync(dirname(p));
  const rel=relative(repo,dir);
  if(rel===""||(!rel.startsWith("..")&&!isAbsolute(rel)))
   fail("SIGNED_OUTPUT_MUST_STAY_OUTSIDE_REPOSITORY");
  if(process.platform!=="win32"&&(statSync(dir).mode&0o077)!==0)
   fail("PRIVATE_OUTPUT_DIRECTORY_0700_REQUIRED");
 }
 const kp=realpathSync(privatePath);
 if(process.platform!=="win32"&&(statSync(kp).mode&0o077)!==0)
  fail("PRIVATE_SIGNER_KEY_0600_REQUIRED");
 const readJson=(p,max)=>{
  if(statSync(p).size>max||statSync(p).size<10)fail("INPUT_SIZE_INVALID");
  try{return JSON.parse(readFileSync(p,"utf8"));}
  catch{fail("INPUT_JSON_INVALID");}
 };
 const unsignedGri=readJson(griInput,900_000);
 const unsignedCountryCertificates=readJson(certInput,450_000);
 const rl=createInterface({input:process.stdin,output:process.stdout});
 try{
  process.stdout.write("Suman Dey | Independent GRI reviewer\n");
  process.stdout.write("GRI input SHA256: "+sha(readFileSync(griInput))+"\n");
  process.stdout.write("Country certificates SHA256: "+sha(readFileSync(certInput))+"\n");
  const answer=await rl.question("After genuine independent review, type SIGN SUMAN EXACT REVIEW: ");
  if(answer!=="SIGN SUMAN EXACT REVIEW")fail("HUMAN_REVIEW_NOT_AUTHORIZED");
 }finally{rl.close();}
 const encryptedKeyBytes=readFileSync(kp);
 if(!encryptedKeyBytes.toString("ascii",0,80).includes("BEGIN ENCRYPTED PRIVATE KEY"))
  fail("SHARED_LAPTOP_ENCRYPTED_PRIVATE_KEY_REQUIRED");
 const privateKeyPassphrase=await readHumanKeyPassphrase(
   "Suman: enter YOUR private signing-key passphrase (hidden): ");
 const result=signSumanIndependentReview({
  privateKey:encryptedKeyBytes,privateKeyPassphrase,
  reviewerPublicKeyPem:env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM,
  reviewerApprovedSpkiSha256:env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256,
  unsignedGri,unsignedCountryCertificates
 });
 const opts={flag:"wx",mode:0o600};
 writeFileSync(griOutput,JSON.stringify(result.reviewedGri),opts);
 writeFileSync(certOutput,JSON.stringify(result.countryCertificates),opts);
 process.stdout.write(JSON.stringify({status:result.status,
  reviewed_gri_signatures:1,
  reviewed_country_certificate_signatures:result.countryCertificates.length,
  independently_signed_publisher_ready:false,payments:0})+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(()=>{console.error("SUMAN_INDEPENDENT_REVIEW_SIGNING_REFUSED");process.exitCode=2;});
}
