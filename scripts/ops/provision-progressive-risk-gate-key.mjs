/**
 * Production deploy-only: derive a separate Ed25519 decision issuer from the
 * already protected GitHub root secret without adding a new paid service.
 * Domain separation prevents reuse of raw root bytes or an existing GRO key.
 * This key signs PROVISIONAL ADVISORY DECISIONS, never institutional GROs.
 *
 * Requires GITHUB_ENV so private key material is not put into workflow stdout.
 */
import {createHmac,createPrivateKey,createPublicKey,createHash} from "node:crypto";
import {appendFileSync} from "node:fs";
const secret=String(process.env.ROOT_LEDGER_TOKEN??"");
const destination=String(process.env.GITHUB_ENV??"");
if(secret.length<32||!destination||!process.env.GITHUB_ACTIONS)
  throw Error("PROGRESSIVE_PROTECTED_PROVISIONING_REQUIRED");
const seed=createHmac("sha256",secret)
 .update("geomacro.progressive-risk-gate.ed25519.v1","utf8").digest();
const pkcs8=Buffer.concat([
  Buffer.from("302e020100300506032b657004220420","hex"),seed
]);
const key=createPrivateKey({key:pkcs8,format:"der",type:"pkcs8"});
if(key.asymmetricKeyType!=="ed25519")throw Error("PROGRESSIVE_SIGNER_TYPE_MISMATCH");
const publicKey=createPublicKey(key).export({format:"der",type:"spki"});
const privateB64=pkcs8.toString("base64");
const publicB64=publicKey.toString("base64");
const keyId="geomacro-progressive-2026-11-v1";
process.stdout.write("::add-mask::"+privateB64+"\n");
appendFileSync(destination,
 ["RISK_GATE_DECISION_ED25519_KEY_ID="+keyId,
  "RISK_GATE_DECISION_ED25519_PRIVATE_KEY_PKCS8_B64="+privateB64,
  "RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64="+publicB64,""].join("\n"));
console.log("PROGRESSIVE_DECISION_KEY_ID="+keyId);
console.log("PROGRESSIVE_DECISION_PUBLIC_FINGERPRINT_SHA256="+
 createHash("sha256").update(publicKey).digest("hex"));
console.log("PROGRESSIVE_DECISION_PRIVATE_KEY_NOT_LOGGED=true");
