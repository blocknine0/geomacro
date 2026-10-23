import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createHash,generateKeyPairSync} from "node:crypto";
import {inspectSumanSigningInputs} from "../ops/inspect-suman-signing-preflight.mjs";

const setup=()=>{
 const root=mkdtempSync(join(tmpdir(),"geomacro-suman-preflight-"));
 const repo=join(root,"repo");
 const dir=join(root,"suman-private");
 mkdirSync(repo,{mode:0o700});
 mkdirSync(dir,{mode:0o700});
 const key=join(dir,"reviewer-private-encrypted.pem");
 writeFileSync(key,"SYNTHETIC_ENCRYPTED_PRIVATE_KEY_PLACEHOLDER",{mode:0o600});
 const gri=join(dir,"unsigned-gri.json");
 const cert=join(dir,"unsigned-country-certificates.json");
 writeFileSync(gri,JSON.stringify({
  schema:"geomacro.gri-v12-reviewed-current-input.v1",
  private_only:false,publication_review_authorized:true,
  customerRows:[{},{},{}],events:[{},{},{}]
 }),{mode:0o600});
 writeFileSync(cert,JSON.stringify(["GEO","MAC","MIN"].map((category,i)=>({
  schema:"geomacro.current-country-category-certification.v1",
  country_iso3:["IND","USA","CHN"][i],category,
  certification_state:"CERTIFIED",source_ids:["original-1","original-2"]
 }))),{mode:0o600});
 const {publicKey}=generateKeyPairSync("ed25519");
 const pem=publicKey.export({format:"pem",type:"spki"}).toString();
 const pin=createHash("sha256").update(publicKey.export({format:"der",type:"spki"})).digest("hex");
 const env={
  GEOMACRO_SUMAN_PRIVATE_KEY_PATH:key,
  GEOMACRO_SUMAN_UNSIGNED_GRI_PATH:gri,
  GEOMACRO_SUMAN_UNSIGNED_CERTIFICATES_PATH:cert,
  GEOMACRO_SUMAN_SIGNED_GRI_OUTPUT_PATH:join(dir,"signed-gri.json"),
  GEOMACRO_SUMAN_SIGNED_CERTIFICATES_OUTPUT_PATH:join(dir,"signed-certs.json"),
  GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM:pem,
  GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256:pin
 };
 return {root,repo,dir,key,gri,cert,env,clean:()=>rmSync(root,{recursive:true,force:true})};
};

test("empty Pallab account is refused with no private values exposed or false signing",()=>{
 const r=inspectSumanSigningInputs({}, {username:"daspa",cwd:process.cwd()});
 assert.equal(r.status,"BLOCKED_NOT_SAFE_TO_SIGN");
 assert.ok(r.issues.includes("USE_SUMAN_OWN_PROTECTED_OS_SESSION"));
 assert.ok(r.issues.includes("ABSOLUTE_PATH_UNSET_OR_INVALID_KEY"));
 assert.ok(r.issues.includes("ABSOLUTE_PATH_UNSET_OR_INVALID_GRI"));
 assert.ok(r.issues.includes("ABSOLUTE_PATH_UNSET_OR_INVALID_CERTS"));
 assert.equal(r.private_key_bytes_read,false);
 assert.equal(r.signatures_created,0);
 assert.equal(r.payments,0);
 assert.equal(r.commercial_rights_verified,false);
});

test("metadata-only synthetic paths look ready but do not attest reviews, signatures or rights",()=>{
 const t=setup();
 try{
  const r=inspectSumanSigningInputs(t.env,{username:"suman-gri",cwd:t.repo});
  assert.equal(r.status,"INPUT_SHAPES_PRESENT_REQUIRES_INDEPENDENT_HUMAN_REVIEW");
  assert.deepEqual(r.issues,[]);
  assert.equal(r.approval_or_independent_review_verified,false);
  assert.equal(r.private_key_bytes_read,false);
  assert.equal(r.signatures_created,0);
  const printed=JSON.stringify(r);
  for(const privateValue of [t.dir,t.key,t.gri,t.env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM])
   assert.equal(printed.includes(privateValue),false);
 }finally{t.clean()}
});

test("wrong user, missing real input and reused output are blocked, without leaking paths",()=>{
 const t=setup();
 try{
  writeFileSync(t.env.GEOMACRO_SUMAN_SIGNED_GRI_OUTPUT_PATH,"already exists",{mode:0o600});
  const r=inspectSumanSigningInputs({...t.env,
    GEOMACRO_SUMAN_UNSIGNED_CERTIFICATES_PATH:join(t.root,"missing.json"),
    GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256:"f".repeat(64)
   },{username:"daspa",cwd:t.repo});
  assert.equal(r.status,"BLOCKED_NOT_SAFE_TO_SIGN");
  assert.ok(r.issues.includes("USE_SUMAN_OWN_PROTECTED_OS_SESSION"));
  assert.ok(r.issues.includes("FILE_MISSING_OR_UNREADABLE_CERTS"));
  assert.ok(r.issues.includes("SIGNED_OUTPUT_ALREADY_EXISTS_GRI_OUT"));
  assert.ok(r.issues.includes("REVIEWER_PUBLIC_PEM_PIN_MISMATCH"));
  assert.equal(JSON.stringify(r).includes(t.root),false);
 }finally{t.clean()}
});

test("structurally invalid inputs and weak key permissions fail closed",()=>{
 const t=setup();
 try{
  writeFileSync(t.gri,JSON.stringify({schema:"test",events:[]}),{mode:0o600});
  writeFileSync(t.cert,JSON.stringify([{category:"macro",country_iso3:"IND",source_ids:[]}]),{mode:0o600});
  const r=inspectSumanSigningInputs(t.env,{username:"suman-gri",cwd:t.repo});
  assert.ok(r.issues.includes("REVIEWED_GRI_STRUCTURE_INCOMPLETE"));
  assert.ok(r.issues.includes("COUNTRY_CERTIFICATE_ARRAY_SHAPE_INVALID"));
  assert.equal(r.status,"BLOCKED_NOT_SAFE_TO_SIGN");
 }finally{t.clean()}
});
