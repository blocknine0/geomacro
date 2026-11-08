/**
 * Step 3 lossless private recovery checkpoint.
 * Produces no plaintext files. All provider errors are normalized, never
 * forwarded into logs. Real PUT/GET proof is compulsory before any D1 DDL.
 */
import {
 createHash,createCipheriv,createDecipheriv,createPrivateKey,createPublicKey,
 randomBytes,sign,verify,timingSafeEqual
} from "node:crypto";

const ACCOUNT=/^[a-f0-9]{32}$/iu;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
const SHA=/^[a-f0-9]{64}$/u;
const BUCKET=/^[a-z0-9][a-z0-9-]{2,62}$/u;
const iso=now=>new Date(now).toISOString();
const digest=b=>createHash("sha256").update(b).digest("hex");
const fail=why=>{throw Error("STEP3_RECOVERY_"+why)};
const eq=(a,b)=>a.length===b.length&&timingSafeEqual(a,b);
const base64=b=>Buffer.from(b).toString("base64");
const parseKey=value=>{
 if(typeof value!=="string"||!/^[A-Za-z0-9+/]{43}=$/u.test(value))fail("AES_KEY_UNAVAILABLE");
 const key=Buffer.from(value,"base64");
 if(key.length!==32||base64(key)!==value)fail("AES_KEY_INVALID");
 return key;
};
function signer(raw){
 if(typeof raw!=="string"||raw.length<100)fail("SIGNING_KEY_UNAVAILABLE");
 try{
  const obj=JSON.parse(raw);
  const key=createPrivateKey({key:obj,format:"jwk"});
  if(!["ed25519","ec"].includes(key.asymmetricKeyType))fail("SIGNING_ALGORITHM_NOT_ALLOWED");
  const publicKey=createPublicKey(key);
  const spki=publicKey.export({type:"spki",format:"der"});
  return {key,publicKey,
   algorithm:key.asymmetricKeyType==="ed25519"?"Ed25519":"ES256",
   public_key_sha256:digest(spki)};
 }catch(e){if(String(e.message).startsWith("STEP3_RECOVERY_"))throw e;
  fail("SIGNING_KEY_INVALID")}
}
export function buildRecoveryObjectKey({dbId,migrationSha,now=new Date()}){
 if(!UUID.test(dbId??"")||!SHA.test(migrationSha??"")||
    !(now instanceof Date)||!Number.isFinite(now.getTime()))
  fail("IDENTITY_OR_TIME_INVALID");
 return "backups/d1/manifests/"+dbId.toLowerCase()+"/"+
  iso(now).replace(/[-:]/gu,"").replace(".000","")+
  "_"+migrationSha+".enc";
}
function endpoint({account,bucket,key}){
 // Cloudflare R2 REST requires slashes in the object key unescaped.
 const encoded=key.split("/").map(encodeURIComponent).join("/");
 return "https://api.cloudflare.com/client/v4/accounts/"+account+
  "/r2/buckets/"+bucket+"/objects/"+encoded;
}
async function cfRequest(url,{token,fetchImpl,method="GET",body=null}={}){
 try{
  // R2 Objects API accepts the exact binary body, not multipart/form-data.
  // https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/objects/methods/upload/
  if(body!==null&&(!Buffer.isBuffer(body)||body.length<1||body.length>1048576))
   fail("PROVIDER_OBJECT_BODY_INVALID");
  const response=await fetchImpl(url,{method,redirect:"error",cache:"no-store",
   headers:{Authorization:"Bearer "+token,"Cache-Control":"no-store",
    ...(body!==null?{"Content-Type":"application/octet-stream"}:{})},
   ...(body!==null?{body}:{}),signal:AbortSignal.timeout(20000)});
  if(!response||response.redirected||response.status<200||response.status>=300)
   fail("PROVIDER_REQUEST_FAILED");
  return response;
 }catch(e){if(String(e.message).startsWith("STEP3_RECOVERY_"))throw e;
  fail("PROVIDER_REQUEST_UNAVAILABLE")}
}
function encryptPayload(key,payload){
 const iv=randomBytes(12);
 const cipher=createCipheriv("aes-256-gcm",key,iv,{authTagLength:16});
 const ciphertext=Buffer.concat([cipher.update(payload),cipher.final()]);
 const tag=cipher.getAuthTag();
 return {v:1,alg:"AES-256-GCM",iv:base64(iv),
  ciphertext:base64(ciphertext),tag:base64(tag)};
}
function decryptPayload(key,envelope){
 if(envelope?.v!==1||envelope?.alg!=="AES-256-GCM"||
    typeof envelope.iv!=="string"||typeof envelope.ciphertext!=="string"||
    typeof envelope.tag!=="string")fail("ENVELOPE_INVALID");
 try{
  const iv=Buffer.from(envelope.iv,"base64"),tag=Buffer.from(envelope.tag,"base64");
  if(iv.length!==12||tag.length!==16)fail("ENVELOPE_IV_OR_TAG_INVALID");
  const dec=createDecipheriv("aes-256-gcm",key,iv,{authTagLength:16});
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(Buffer.from(envelope.ciphertext,"base64")),dec.final()]);
 }catch(e){if(String(e.message).startsWith("STEP3_RECOVERY_"))throw e;
  fail("ENCRYPTED_BOOKMARK_AUTH_TAG_INVALID")}
}
function signManifest(manifest,identity){
 const payload=Buffer.from(JSON.stringify(manifest),"utf8");
 const sig=sign(identity.algorithm==="Ed25519"?null:"sha256",payload,identity.key);
 return {schema:"geomacro.d1-recovery-signed-manifest.v1",manifest,
  attestation:{algorithm:identity.algorithm,
   public_key_sha256:identity.public_key_sha256,signature_b64:base64(sig)}};
}
export function verifyRecoveryManifest(serialized,identity){
 try{
  const signed=JSON.parse(Buffer.from(serialized).toString("utf8"));
  if(signed?.schema!=="geomacro.d1-recovery-signed-manifest.v1"||
     signed?.attestation?.algorithm!==identity.algorithm||
     signed?.attestation?.public_key_sha256!==identity.public_key_sha256||
     !SHA.test(signed?.manifest?.manifest_sha256??"")||
     typeof signed?.attestation?.signature_b64!=="string")
   fail("SIGNED_MANIFEST_FIELDS_INVALID");
  const payload=Buffer.from(JSON.stringify(signed.manifest));
  if(!verify(identity.algorithm==="Ed25519"?null:"sha256",payload,
     identity.publicKey,Buffer.from(signed.attestation.signature_b64,"base64")))
   fail("SIGNED_MANIFEST_SIGNATURE_INVALID");
  return signed.manifest;
 }catch(e){if(String(e.message).startsWith("STEP3_RECOVERY_"))throw e;
  fail("SIGNED_MANIFEST_INVALID")}
}
export async function captureDurableD1Checkpoint({
 env=process.env,dbId,migrationSha,now=new Date(),fetchImpl=fetch
}={}){
 if(!ACCOUNT.test(env.CLOUDFLARE_ACCOUNT_ID??"")||
    !UUID.test(dbId??"")||!SHA.test(migrationSha??"")||
    !BUCKET.test(env.GEOMACRO_D1_RECOVERY_R2_BUCKET??"")||
    env.GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED!=="YES"||
    typeof env.CLOUDFLARE_API_TOKEN!=="string"||
    env.CLOUDFLARE_API_TOKEN.length<20)
  fail("PRIVATE_RECOVERY_PROVIDER_IDENTITY_UNVERIFIED");
 const key=parseKey(env.GEOMACRO_D1_RECOVERY_AES256_KEY_B64);
 const signerIdentity=signer(env.SIGNING_JWK);
 const account=env.CLOUDFLARE_ACCOUNT_ID;
 const token=env.CLOUDFLARE_API_TOKEN;
 const bucket=env.GEOMACRO_D1_RECOVERY_R2_BUCKET;
 const objectKey=buildRecoveryObjectKey({dbId,migrationSha,now});
 // Stage labels are fixed and safe to emit; no object content is logged.
 let stage="BOOKMARK_GET";
 try{
  const response=await cfRequest(
   "https://api.cloudflare.com/client/v4/accounts/"+account+
    "/d1/database/"+dbId+"/time_travel/bookmark",
   {token,fetchImpl});
  let data;try{data=await response.json()}catch{fail("BOOKMARK_RESPONSE_INVALID")}
  const bookmark=data?.result?.bookmark;
  if(data?.success!==true||typeof bookmark!=="string"||
     bookmark.length<16||bookmark.length>4096)
   fail("REAL_D1_BOOKMARK_UNVERIFIED");
  const bookmarkHash=digest(Buffer.from(bookmark,"utf8"));
  const plaintext=Buffer.from(JSON.stringify({
   schema:"geomacro.d1-private-recovery-payload.v1",
   database_uuid:dbId.toLowerCase(),utc_timestamp:iso(now),
   target_migration_sha:migrationSha,bookmark
  }));
  const envelope=encryptPayload(key,plaintext);
  // No plaintext or raw bookmark ever touches disk or an artifact.
  const encrypted=Buffer.from(JSON.stringify(envelope),"utf8");
  const manifest={
   schema:"geomacro.d1-recovery-manifest.v1",
   database_uuid:dbId.toLowerCase(),utc_timestamp:iso(now),
   target_migration_sha:migrationSha,
   manifest_sha256:digest(encrypted),encrypted_byte_length:encrypted.length,
   encryption_iv:envelope.iv,encryption_algorithm:"AES-256-GCM",
   encrypted_object_key:objectKey,
   bookmark_sha256:bookmarkHash,
  };
  const signed=Buffer.from(JSON.stringify(signManifest(manifest,signerIdentity)));
  const encryptedUrl=endpoint({account,bucket,key:objectKey});
  const manifestUrl=endpoint({account,bucket,key:objectKey+".manifest.json"});
  stage="ENCRYPTED_OBJECT_PUT";
  await cfRequest(encryptedUrl,{token,fetchImpl,method:"PUT",body:encrypted});
  stage="ENCRYPTED_OBJECT_GET";
  const remote=Buffer.from(await (await cfRequest(encryptedUrl,{token,fetchImpl})).arrayBuffer());
  if(!eq(encrypted,remote)||digest(remote)!==manifest.manifest_sha256||
     remote.length!==manifest.encrypted_byte_length)
   fail("ENCRYPTED_R2_READBACK_MISMATCH");
  const opened=decryptPayload(key,JSON.parse(remote.toString("utf8")));
  if(!eq(opened,plaintext))fail("ENCRYPTED_R2_DECRYPTED_PAYLOAD_MISMATCH");
  stage="SIGNED_MANIFEST_PUT";
  await cfRequest(manifestUrl,{token,fetchImpl,method:"PUT",body:signed});
  stage="SIGNED_MANIFEST_GET";
  const remoteManifest=Buffer.from(await (
   await cfRequest(manifestUrl,{token,fetchImpl})).arrayBuffer());
  if(!eq(remoteManifest,signed))fail("SIGNED_MANIFEST_R2_READBACK_MISMATCH");
  const verified=verifyRecoveryManifest(remoteManifest,signerIdentity);
  if(verified.manifest_sha256!==digest(remote)||
     verified.database_uuid!==dbId.toLowerCase()||
     verified.target_migration_sha!==migrationSha||
     verified.bookmark_sha256!==bookmarkHash)
   fail("RECOVERY_IDENTITY_RECHECK_FAILED");
  return Object.freeze({
   status:"PASS_REAL_PROVIDER_R2_BYTE_READBACK",
   real_provider_bookmark_observed:true,
   private_r2_encrypted_readback_verified:true,
   signed_manifest_readback_verified:true,
   database_uuid_sha256:digest(dbId.toLowerCase()),
   bookmark_sha256:bookmarkHash,
   encryption:"AES-256-GCM",encrypted_byte_length:encrypted.length,
   manifest_sha256:manifest.manifest_sha256,
   object_key:objectKey,manifest_object_key:objectKey+".manifest.json",
   key_id_sha256:signerIdentity.public_key_sha256,
   migration_sha256:migrationSha,
   encrypted_payload_leaked_to_artifact:false,
   plaintext_bookmark_leaked_to_artifact:false
  });
 }catch(e){
  if(/^STEP3_RECOVERY_PROVIDER_REQUEST_(?:FAILED|UNAVAILABLE)$/u.test(e?.message??""))
   fail("CLOUDFLARE_"+stage+"_HTTP_OR_NETWORK_UNVERIFIED");
  throw e;
 }finally{key.fill(0)}
}

/** Signed truthful status receipt. Signature proves authorship/integrity only;
 * it never upgrades NOT_YET_VERIFIED into a real provider PASS.
 */
export function signStep3StatusReceipt(receipt,privateJwk){
 const identity=signer(privateJwk);
 if(!receipt||typeof receipt!=="object"||
    !["NOT_YET_VERIFIED","PASS"].includes(receipt.status))
  fail("STATUS_RECEIPT_INVALID");
 const payload=Buffer.from(JSON.stringify(receipt),"utf8");
 return {
  schema:"geomacro.step3.signed-status-receipt.v1",receipt,
  attestation:{
   algorithm:identity.algorithm,
   public_key_sha256:identity.public_key_sha256,
   signature_b64:base64(sign(
    identity.algorithm==="Ed25519"?null:"sha256",payload,identity.key))
  }
 };
}
export function verifyStep3StatusReceipt(signed,publicJwk){
 if(signed?.schema!=="geomacro.step3.signed-status-receipt.v1"||
    !signed?.receipt||!signed?.attestation||
    typeof signed.attestation.signature_b64!=="string")
  fail("STATUS_RECEIPT_FORMAT_INVALID");
 let publicKey;
 try{publicKey=createPublicKey({key:JSON.parse(publicJwk),format:"jwk"})}
 catch{fail("STATUS_PUBLIC_KEY_INVALID")}
 const spki=publicKey.export({type:"spki",format:"der"});
 if(digest(spki)!==signed.attestation.public_key_sha256)
  fail("STATUS_RECEIPT_SIGNER_MISMATCH");
 const alg=publicKey.asymmetricKeyType==="ed25519"?"Ed25519":
  publicKey.asymmetricKeyType==="ec"?"ES256":null;
 if(alg!==signed.attestation.algorithm||
    !verify(alg==="Ed25519"?null:"sha256",
     Buffer.from(JSON.stringify(signed.receipt)),publicKey,
     Buffer.from(signed.attestation.signature_b64,"base64")))
  fail("STATUS_SIGNATURE_INVALID");
 return signed.receipt;
}

/**
 * Recovery reader for a SEPARATELY reviewed restore operator.
 * Bookmark is passed only to an in-process callback; never written to logs,
 * stdout, GitHub artifacts or returned in the public receipt.
 * This function DOES NOT invoke D1 Time Travel restore.
 */
export async function withVerifiedD1RecoveryBookmark({
 env=process.env,objectKey,expectedDbId,expectedMigrationSha,
 fetchImpl=fetch,onBookmark
}={}){
 if(!UUID.test(expectedDbId??"")||!SHA.test(expectedMigrationSha??"")||
    typeof objectKey!=="string"||
    !objectKey.startsWith("backups/d1/manifests/"+
      expectedDbId.toLowerCase()+"/")||
    !objectKey.endsWith("_"+expectedMigrationSha+".enc")||
    typeof onBookmark!=="function")
  fail("COLD_RECOVERY_IDENTITY_INVALID");
 const account=env.CLOUDFLARE_ACCOUNT_ID;
 const bucket=env.GEOMACRO_D1_RECOVERY_R2_BUCKET;
 const token=env.CLOUDFLARE_API_TOKEN;
 if(!ACCOUNT.test(account??"")||!BUCKET.test(bucket??"")||
    typeof token!=="string"||token.length<20)
  fail("COLD_RECOVERY_PROVIDER_UNAVAILABLE");
 const key=parseKey(env.GEOMACRO_D1_RECOVERY_AES256_KEY_B64);
 const identity=signer(env.SIGNING_JWK);
 const base={account,bucket,key:objectKey};
 try{
  const signedBytes=Buffer.from(await (await cfRequest(
   endpoint({...base,key:objectKey+".manifest.json"}),
   {token,fetchImpl})).arrayBuffer());
  const manifest=verifyRecoveryManifest(signedBytes,identity);
  const encrypted=Buffer.from(await (await cfRequest(endpoint(base),
   {token,fetchImpl})).arrayBuffer());
  if(manifest.database_uuid!==expectedDbId.toLowerCase()||
     manifest.target_migration_sha!==expectedMigrationSha||
     manifest.encrypted_object_key!==objectKey||
     manifest.encrypted_byte_length!==encrypted.byteLength||
     manifest.manifest_sha256!==digest(encrypted))
   fail("COLD_RECOVERY_SIGNED_MANIFEST_MISMATCH");
  const envelope=JSON.parse(encrypted.toString("utf8"));
  if(envelope.iv!==manifest.encryption_iv)
   fail("COLD_RECOVERY_IV_MISMATCH");
  const plaintext=decryptPayload(key,envelope);
  let data;try{data=JSON.parse(plaintext.toString("utf8"))}
  catch{fail("COLD_RECOVERY_DECRYPTED_PAYLOAD_INVALID")}
  if(data?.schema!=="geomacro.d1-private-recovery-payload.v1"||
     data.database_uuid!==expectedDbId.toLowerCase()||
     data.target_migration_sha!==expectedMigrationSha||
     data.utc_timestamp!==manifest.utc_timestamp||
     typeof data.bookmark!=="string"||
     digest(Buffer.from(data.bookmark))!==manifest.bookmark_sha256)
   fail("COLD_RECOVERY_BOOKMARK_IDENTITY_MISMATCH");
  const outcome=await onBookmark(data.bookmark);
  return {status:"PASS_SIGNED_ENCRYPTED_RECOVERY_READBACK",
   database_uuid_sha256:digest(expectedDbId.toLowerCase()),
   bookmark_sha256:manifest.bookmark_sha256,
   encrypted_object_sha256:digest(encrypted),
   result:outcome};
 }finally{key.fill(0)}
}
