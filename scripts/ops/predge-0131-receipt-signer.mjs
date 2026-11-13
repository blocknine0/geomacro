import {createHash,createPrivateKey,createPublicKey,sign,verify} from "node:crypto";

const b64=value=>Buffer.from(value,"base64");
const fail=code=>{throw Error("PREDGE_0131_RECEIPT_"+code)};
export function loadPredge0131ReceiptSigner({privateKeyPkcs8B64,publicKeySpkiB64}={}){
 const priv=String(privateKeyPkcs8B64??"").trim(),pub=String(publicKeySpkiB64??"").trim();
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(priv)||!priv)fail("PRIVATE_KEY_REQUIRED");
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(pub)||!pub)fail("PUBLIC_KEY_REQUIRED");
 let privateKey,publicKey;
 try{
  const der=b64(priv),publicDer=b64(pub);
  if(!der.length||der.toString("base64")!==priv||!publicDer.length||publicDer.toString("base64")!==pub)
   fail("KEY_ENCODING_INVALID");
  privateKey=createPrivateKey({key:der,format:"der",type:"pkcs8"});
  publicKey=createPublicKey({key:publicDer,format:"der",type:"spki"});
 }catch(error){if(String(error?.message??"").startsWith("PREDGE_0131_RECEIPT_"))throw error;fail("KEY_ENCODING_INVALID")}
 if(privateKey.asymmetricKeyType!=="ed25519"||publicKey.asymmetricKeyType!=="ed25519")
  fail("SIGNING_ALGORITHM_INVALID");
 const derived=createPublicKey(privateKey).export({format:"der",type:"spki"}).toString("base64");
 if(derived!==pub)fail("KEY_PAIR_MISMATCH");
 const keyId="geomacro-license-ed25519:"+createHash("sha256").update(b64(pub)).digest("hex");
 const challenge=Buffer.from("geomacro-predge-addendum-v2-migration-0131-receipt-key-check-v1");
 const signature=sign(null,challenge,privateKey);
 if(!verify(null,challenge,publicKey,signature))fail("SIGNING_SELF_TEST_FAILED");
 return Object.freeze({privateKey,publicKey,keyId,publicKeySpkiB64:pub});
}
export function signPredge0131Receipt(unsigned,{privateKeyPkcs8B64,publicKeySpkiB64}={}){
 if(!unsigned||typeof unsigned!=="object"||Array.isArray(unsigned))fail("PAYLOAD_INVALID");
 const signer=loadPredge0131ReceiptSigner({privateKeyPkcs8B64,publicKeySpkiB64});
 const bytes=Buffer.from(JSON.stringify(unsigned),"utf8");
 return Object.freeze({...unsigned,signature_algorithm:"Ed25519",
  signature_key_id:signer.keyId,
  signature_public_key_spki_b64:signer.publicKeySpkiB64,
  signature_base64:sign(null,bytes,signer.privateKey).toString("base64")});
}
