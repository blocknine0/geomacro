import {createPrivateKey,createPublicKey,sign,verify} from "node:crypto";

export const PREDGE_0131_RECEIPT_KEY_ID="geomacro-risk-2026-03";
export const PREDGE_0131_RECEIPT_PUBLIC_SPKI_B64="MCowBQYDK2VwAyEAeMsePxig7TEUR3fykcx9wcBqomj9KBuJ/TXTX2QSN2k=";

export function loadPredge0131ReceiptSigner({
 keySource,keyId,trustedPublicSpkiB64=PREDGE_0131_RECEIPT_PUBLIC_SPKI_B64,
 expectedKeyId=PREDGE_0131_RECEIPT_KEY_ID,
}={}){
 const source=String(keySource??"").trim();
 const id=String(keyId??"").trim();
 if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)||id!==expectedKeyId)
  throw Error("PREDGE_0131_RECEIPT_SIGNER_ID_INVALID");
 let privateKey;
 try{
  if(source.startsWith("{")){
   const jwk=JSON.parse(source);
   if(jwk?.kty!=="OKP"||jwk?.crv!=="Ed25519"||typeof jwk?.d!=="string")
    throw Error("invalid JWK shape");
   privateKey=createPrivateKey({key:jwk,format:"jwk"});
  }else{
   if(!/^[A-Za-z0-9+/]+={0,2}$/.test(source))throw Error("invalid PKCS8 base64");
   const der=Buffer.from(source,"base64");
   if(!der.length||der.toString("base64")!==source)throw Error("invalid PKCS8 base64");
   privateKey=createPrivateKey({key:der,format:"der",type:"pkcs8"});
  }
 }catch{throw Error("PREDGE_0131_RECEIPT_SIGNER_PRIVATE_KEY_INVALID")}
 if(privateKey.asymmetricKeyType!=="ed25519")
  throw Error("PREDGE_0131_RECEIPT_SIGNER_ALGORITHM_INVALID");
 const publicKey=createPublicKey(privateKey);
 const publicSpkiB64=publicKey.export({type:"spki",format:"der"}).toString("base64");
 if(publicSpkiB64!==trustedPublicSpkiB64)
  throw Error("PREDGE_0131_RECEIPT_SIGNER_PUBLIC_KEY_MISMATCH");
 const challenge=Buffer.from("geomacro-predge-addendum-v2-migration-0131-receipt-key-check-v1");
 const signature=sign(null,challenge,privateKey);
 if(!verify(null,challenge,publicKey,signature))
  throw Error("PREDGE_0131_RECEIPT_SIGNER_SELF_TEST_FAILED");
 return Object.freeze({privateKey,keyId:id,publicSpkiB64});
}
export function signPredge0131Receipt(unsigned,{keySource,keyId,
 trustedPublicSpkiB64=PREDGE_0131_RECEIPT_PUBLIC_SPKI_B64,
 expectedKeyId=PREDGE_0131_RECEIPT_KEY_ID}={}){
 if(!unsigned||typeof unsigned!=="object"||Array.isArray(unsigned))
  throw Error("PREDGE_0131_RECEIPT_PAYLOAD_INVALID");
 const signer=loadPredge0131ReceiptSigner({keySource,keyId,trustedPublicSpkiB64,expectedKeyId});
 const bytes=Buffer.from(JSON.stringify(unsigned),"utf8");
 return Object.freeze({...unsigned,signature_algorithm:"Ed25519",
  signature_key_id:signer.keyId,
  signature_base64:sign(null,bytes,signer.privateKey).toString("base64")});
}
