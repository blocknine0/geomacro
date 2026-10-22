#!/usr/bin/env node
// SINGLE owner key, ONE human signature for exact candidate+evidence hashes.
// The private key NEVER enters GitHub Actions, B2, D1 or a source runner.
// This command may only sign interactively at Pallab Das's private machine.
import {readFileSync,writeFileSync,statSync,realpathSync,existsSync} from "node:fs";
import {dirname,isAbsolute,resolve,relative} from "node:path";
import {createPrivateKey,createPublicKey,createHash,randomBytes,sign} from "node:crypto";
import {createInterface} from "node:readline/promises";
import {pathToFileURL} from "node:url";
import {readHumanKeyPassphrase} from "../lib/read-human-key-passphrase.mjs";
import {OWNER_APPROVER,OWNER_APPROVAL_SCHEMA,ownerApprovalCanonicalPayload,
  assertOwnerApprovalEnvelope} from "../lib/pallab-human-gri-batch-approval.mjs";
const SHA=/^[a-f0-9]{64}$/u;
const fail=s=>{throw Error("OWNER_HUMAN_LOCAL_SIGN_"+s)};
export function signOwnerReviewedCandidate({
 privateKey,privateKeyPassphrase,publicKeyPem,publicKeySpkiSha256,candidateSha256,evidenceSha256,
 now=new Date(),nonceHex
}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    !SHA.test(candidateSha256??"")||!SHA.test(evidenceSha256??"")||
    !/^[a-f0-9]{32}$/u.test(nonceHex??""))
    fail("APPROVED_EXACT_DIGESTS_AND_CLOCK_REQUIRED");
 let key,derived;
 try{
  key=createPrivateKey(privateKeyPassphrase===undefined?privateKey:
    {key:privateKey,passphrase:privateKeyPassphrase});
  if(key.asymmetricKeyType!=="ed25519")fail("ED25519_PRIVATE_KEY_REQUIRED");
  derived=createPublicKey(key).export({format:"der",type:"spki"});
 }catch{fail("OWNER_PRIVATE_KEY_UNUSABLE");}
 if(!SHA.test(publicKeySpkiSha256??"")||
    createHash("sha256").update(derived).digest("hex")!==publicKeySpkiSha256)
    fail("OWNER_PRIVATE_PUBLIC_PIN_MISMATCH");
 const payload={
  schema:OWNER_APPROVAL_SCHEMA,
  human_approver:OWNER_APPROVER,
  decision:"OWNER_APPROVES_EXACT_DERIVED_GRI_CANDIDATE",
  candidate_gri_sha256:candidateSha256,
  evidence_manifest_sha256:evidenceSha256,
  approved_at:now.toISOString(),
  expires_at:new Date(now.getTime()+90*60_000).toISOString(),
  nonce_hex:nonceHex
 };
 const envelope={payload,signature_base64:sign(null,
   ownerApprovalCanonicalPayload(payload),key).toString("base64")};
 assertOwnerApprovalEnvelope({envelope,approvedOwnerPublicKeyPem:publicKeyPem,
  approvedOwnerSpkiSha256:publicKeySpkiSha256,
  expectedCandidateGriSha256:candidateSha256,
  expectedEvidenceManifestSha256:evidenceSha256,now});
 return envelope;
}
async function run(env=process.env){
 if(process.argv.length!==3||process.argv[2]!=="--human-sign-exact-batch"||
    !process.stdin.isTTY||!process.stdout.isTTY||
    env.CI==="true"||env.GITHUB_ACTIONS==="true")
   fail("INTERACTIVE_PRIVATE_WORKSTATION_ONLY");
 const keyPath=env.GEOMACRO_OWNER_LOCAL_ED25519_PRIVATE_KEY_PATH;
 const outPath=env.GEOMACRO_OWNER_APPROVAL_OUTPUT_JSON;
 if(!isAbsolute(keyPath??"")||!isAbsolute(outPath??"")||
    !outPath.endsWith(".json")||existsSync(outPath))
   fail("PRIVATE_ABSOLUTE_NO_OVERWRITE_PATHS_REQUIRED");
 const key=realpathSync(keyPath);
 const kstat=statSync(key);
 if(!kstat.isFile()||process.platform!=="win32"&&(kstat.mode&0o077)!==0)
   fail("PRIVATE_KEY_FILE_0600_REQUIRED");
 const outDir=realpathSync(dirname(outPath));
 const repo=realpathSync(process.cwd()),rel=relative(repo,outDir);
 if(rel===""||(!rel.startsWith("..")&&!isAbsolute(rel)))
   fail("OUTPUT_MUST_BE_OUTSIDE_REPOSITORY");
 const dstat=statSync(outDir);
 if(process.platform!=="win32"&&(dstat.mode&0o077)!==0)
   fail("PRIVATE_OUTPUT_DIRECTORY_0700_REQUIRED");
 const candidateSha256=env.GEOMACRO_OWNER_CANDIDATE_GRI_SHA256??"";
 const evidenceSha256=env.GEOMACRO_OWNER_EVIDENCE_MANIFEST_SHA256??"";
 if(!SHA.test(candidateSha256)||!SHA.test(evidenceSha256))
   fail("REAL_CANDIDATE_AND_EVIDENCE_SHA256_REQUIRED");
 const rl=createInterface({input:process.stdin,output:process.stdout});
 try{
  process.stdout.write("Approver: Pallab Das | OWNER-REVIEWED, NOT INDEPENDENT GRI\n");
  process.stdout.write("Candidate: "+candidateSha256+"\nEvidence:  "+evidenceSha256+"\n");
  const confirm=await rl.question("Type APPROVE EXACT OWNER REVIEW to cryptographically sign these exact hashes: ");
  if(confirm!=="APPROVE EXACT OWNER REVIEW")fail("HUMAN_DECLINED");
 }finally{rl.close();}
 const encryptedKeyBytes=readFileSync(key);
 if(!encryptedKeyBytes.toString("ascii",0,80).includes("BEGIN ENCRYPTED PRIVATE KEY"))
  fail("SHARED_LAPTOP_ENCRYPTED_PRIVATE_KEY_REQUIRED");
 const privateKeyPassphrase=await readHumanKeyPassphrase(
   "Pallab: enter YOUR private signing-key passphrase (hidden): ");
 const envelope=signOwnerReviewedCandidate({
  privateKey:encryptedKeyBytes,privateKeyPassphrase,
  publicKeyPem:env.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM,
  publicKeySpkiSha256:env.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256,
  candidateSha256,evidenceSha256,nonceHex:randomBytes(16).toString("hex")
 });
 writeFileSync(outPath,JSON.stringify(envelope,null,2)+"\n",
   {mode:0o600,flag:"wx"});
 process.stdout.write(JSON.stringify({status:"OWNER_SIGNATURE_WRITTEN_PRIVATE_LOCALLY",
  independent_reviewer_verified:false,paid_or_signed_hot_unlocked:false})+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 run().catch(()=>{console.error("OWNER_HUMAN_LOCAL_SIGNATURE_FAILED_CLOSED");process.exitCode=2;});
}
