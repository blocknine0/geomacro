import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import worker from "../../workers/control-plane/src/index.mjs";
import {commercialLicenseKeyId,COMMERCIAL_LICENSE_KEY_URL}
 from "../../workers/control-plane/src/risk-stream-commercial-license.mjs";

test("public commercial-license verification endpoint publishes the pinned Ed25519 key without D1",async()=>{
 const pair=generateKeyPairSync("ed25519"),spki=pair.publicKey.export({format:"der",type:"spki"}).toString("base64");
 const response=await worker.fetch(new Request(COMMERCIAL_LICENSE_KEY_URL),{
  GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64:spki,
  DB:{prepare(){throw Error("public key route must not read D1")}}
 });
 assert.equal(response.status,200);
 assert.equal(response.headers.get("X-GeoMacro-Publisher"),"https://geomacro.live");
 const body=await response.json();
 assert.equal(body.schema,"geomacro.commercial-license-keyset.v1");
 assert.equal(body.verification_key_url,COMMERCIAL_LICENSE_KEY_URL);
 assert.deepEqual(body.keys,[{key_id:await commercialLicenseKeyId(spki),
  scheme:"Ed25519",public_key_spki_b64:spki,status:"active"}]);
});
