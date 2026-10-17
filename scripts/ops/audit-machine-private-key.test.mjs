import {test} from "node:test";
import {strict as assert} from "node:assert";
import {createHash,createPrivateKey,createPublicKey,generateKeyPairSync} from "node:crypto";
import {spawnSync} from "node:child_process";
import {mkdtempSync,writeFileSync,chmodSync,symlinkSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {auditIssuerPrivateKey} from "./audit-machine-private-key.mjs";
const fixture=()=>{
 const issuer=generateKeyPairSync("ed25519"),gro=generateKeyPairSync("ed25519");
 return {issuer,env:{
  GEOMACRO_MACHINE_KEY_AUDIT_ROLE:"facts",
  GEOMACRO_MACHINE_KEY_AUDIT_PRIVATE_PKCS8_B64:
    issuer.privateKey.export({format:"der",type:"pkcs8"}).toString("base64"),
  GEOMACRO_MACHINE_KEY_AUDIT_PUBLIC_PEM:
    issuer.publicKey.export({format:"pem",type:"spki"}).toString(),
  GEOMACRO_MACHINE_KEY_AUDIT_PUBLIC_SHA256:createHash("sha256")
    .update(issuer.publicKey.export({format:"der",type:"spki"})).digest("hex"),
  RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:
    gro.publicKey.export({format:"der",type:"spki"}).toString("base64"),
 }};
};
test("separate facts and rights private keys match only their pinned identity",()=>{
 for(const role of ["facts","rights"]){
  const {env}=fixture();env.GEOMACRO_MACHINE_KEY_AUDIT_ROLE=role;
  const r=auditIssuerPrivateKey(env);
  assert.equal(r.state,"PINNED_PRIVATE_KEY_MATCH");
  assert.equal(r.issued_event_signature,false);
  assert.equal(r.article_rights_verified,false);
  assert.equal(r.b2_requests+r.d1_writes+r.payments+r.supabase_requests,0);
  assert(!JSON.stringify(r).includes(env.GEOMACRO_MACHINE_KEY_AUDIT_PRIVATE_PKCS8_B64));
  assert(!JSON.stringify(r).includes(env.GEOMACRO_MACHINE_KEY_AUDIT_PUBLIC_SHA256));
 }
});
test("missing GitHub environment secret is not evidence that the offline key is lost",()=>{
 const {env}=fixture();delete env.GEOMACRO_MACHINE_KEY_AUDIT_PRIVATE_PKCS8_B64;
 const r=auditIssuerPrivateKey(env);
 assert.equal(r.state,"NOT_AVAILABLE_IN_THIS_ENVIRONMENT");
 assert.equal(r.issuer_private_key_available,false);
});
test("wrong private, wrong pin, reused GRO signer and malformed private all fail closed",()=>{
 const {env,issuer}=fixture();const other=fixture();
 const gro=issuer.publicKey.export({format:"der",type:"spki"}).toString("base64");
 for(const bad of [
  {...env,GEOMACRO_MACHINE_KEY_AUDIT_PRIVATE_PKCS8_B64:
   other.env.GEOMACRO_MACHINE_KEY_AUDIT_PRIVATE_PKCS8_B64},
  {...env,GEOMACRO_MACHINE_KEY_AUDIT_PUBLIC_SHA256:"f".repeat(64)},
  {...env,RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:gro},
  {...env,GEOMACRO_MACHINE_KEY_AUDIT_PRIVATE_PKCS8_B64:"invalid"},
 ]){
  assert.equal(auditIssuerPrivateKey(bad).state,"PRIVATE_KEY_OR_PIN_INVALID");
 }
 assert.throws(()=>auditIssuerPrivateKey({
  ...env,GEOMACRO_MACHINE_KEY_AUDIT_ROLE:"facts_and_rights"}),/ROLE_INVALID/);
});
test("CLI prints no private bytes, never signs, and treats intentionally offline keys as inventory-only",()=>{
 const {env}=fixture();
 const good=spawnSync(process.execPath,["scripts/ops/audit-machine-private-key.mjs"],{
  encoding:"utf8",env:{...process.env,...env}});
 assert.equal(good.status,0,good.stderr);
 const p=JSON.parse(good.stdout);
 assert.equal(p.state,"PINNED_PRIVATE_KEY_MATCH");
 assert(!good.stdout.includes(env.GEOMACRO_MACHINE_KEY_AUDIT_PRIVATE_PKCS8_B64));
 const missing=spawnSync(process.execPath,["scripts/ops/audit-machine-private-key.mjs"],{
  encoding:"utf8",env:{...process.env,...env,
    GEOMACRO_MACHINE_KEY_AUDIT_PRIVATE_PKCS8_B64:""}});
 assert.equal(missing.status,0);
 assert.equal(JSON.parse(missing.stdout).state,"NOT_AVAILABLE_IN_THIS_ENVIRONMENT");
 const invalid=spawnSync(process.execPath,["scripts/ops/audit-machine-private-key.mjs"],{
  encoding:"utf8",env:{...process.env,...env,
    GEOMACRO_MACHINE_KEY_AUDIT_PUBLIC_SHA256:"0".repeat(64)}});
 assert.equal(invalid.status,2);
 assert.equal(JSON.parse(invalid.stdout).state,"PRIVATE_KEY_OR_PIN_INVALID");
});

test("owner-only PEM file held outside repo matches public pin and rejects insecure exposure",()=>{
 const {env,issuer}=fixture(),dir=mkdtempSync(join(tmpdir(),"geomacro-issuer-"));
 const path=join(dir,"offline-issuer.pem");
 try{
  writeFileSync(path,issuer.privateKey.export({format:"pem",type:"pkcs8"}),{mode:0o600});
  const offline={...env,GEOMACRO_MACHINE_KEY_AUDIT_PRIVATE_PKCS8_B64:"",
   GEOMACRO_MACHINE_KEY_AUDIT_PRIVATE_PEM_FILE:path};
  assert.equal(auditIssuerPrivateKey(offline).state,"PINNED_PRIVATE_KEY_MATCH");
  chmodSync(path,0o644);
  assert.equal(auditIssuerPrivateKey(offline).state,"PRIVATE_KEY_OR_PIN_INVALID");
  chmodSync(path,0o600);
  const symlink=join(dir,"link.pem");symlinkSync(path,symlink);
  assert.equal(auditIssuerPrivateKey({
   ...offline,GEOMACRO_MACHINE_KEY_AUDIT_PRIVATE_PEM_FILE:symlink
  }).state,"PRIVATE_KEY_OR_PIN_INVALID");
  assert.equal(auditIssuerPrivateKey({
   ...offline,GEOMACRO_MACHINE_KEY_AUDIT_PRIVATE_PKCS8_B64:
    env.GEOMACRO_MACHINE_KEY_AUDIT_PRIVATE_PKCS8_B64
  }).state,"PRIVATE_KEY_OR_PIN_INVALID");
 }finally{rmSync(dir,{recursive:true,force:true});}
});
