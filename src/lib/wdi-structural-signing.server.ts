import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { canonicalRiskObjectJson, assertRiskObjectJsonKeysSafe,
  normalizeRiskObjectVerificationKeys,
  type RiskObjectSigningMaterial, type RiskObjectVerificationKeys,
} from "./risk-object-signing.server";
import { assertAttributedWdiStructuralProduct,
  type buildAttributedWdiStructuralProduct } from "./wdi-attributed-structural-product.server";

const DOMAIN="geomacro.signed-wdi-structural-answer.v1\n";
const SHA=/^[a-f0-9]{64}$/u;
type Product=ReturnType<typeof buildAttributedWdiStructuralProduct>;
const digest=(x:unknown)=>createHash("sha256").update(canonicalRiskObjectJson(x),"utf8").digest("hex");
const strictB64=(v:string)=>{
  if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(v))
    throw Error("STRUCTURAL_SIGNATURE_BASE64_INVALID");
  const buf=Buffer.from(v,"base64");
  if(!buf.length || buf.toString("base64")!==v)throw Error("STRUCTURAL_SIGNATURE_BASE64_INVALID");
  return buf;
};
const ed=(key:KeyObject)=>{
  if(key.asymmetricKeyType!=="ed25519")throw Error("STRUCTURAL_SIGNER_MUST_BE_ED25519");
  return key;
};
const privateKey=(b64:string)=>ed(createPrivateKey({key:strictB64(b64),format:"der",type:"pkcs8"}));
const publicKey=(b64:string)=>ed(createPublicKey({key:strictB64(b64),format:"der",type:"spki"}));
const shaBytes=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
const message=(p:Product, receipt:string,plan:string)=>{
  const signedContents={
    schema_version:"geomacro.signed-wdi-structural-answer.v1" as const,
    query_plan_hash:plan,
    certified_rights_receipt_sha256:receipt,
    structural_product:p,
  };
  const canonical=Buffer.from(DOMAIN+canonicalRiskObjectJson(signedContents),"utf8");
  return {signedContents,canonical};
};
export type SignedWdiStructuralAnswer=ReturnType<typeof signWdiStructuralAnswer>;

/** Separate version and domain from GRO. A risk-object signing material may
 * be supplied by an authorized signing service; never silently use GRO keys
 * or self-trust an embedded public key. */
export function signWdiStructuralAnswer(input:{
  product:Product;certified_rights_receipt_sha256:string;
  query_plan_hash:string;material:RiskObjectSigningMaterial;
}){
  assertAttributedWdiStructuralProduct(input.product);
  if(!SHA.test(input.certified_rights_receipt_sha256) ||
     !SHA.test(input.query_plan_hash) ||
     input.product.integrity.payload_hash_sha256!==digest((()=>{
       const {integrity,...body}=input.product;return body;
     })()) ||
     !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u.test(input.material.key_id))
    throw Error("STRUCTURAL_SIGNING_INPUT_UNQUALIFIED");
  const key=privateKey(input.material.private_key_pkcs8_b64);
  const pub=createPublicKey(key).export({format:"der",type:"spki"}).toString("base64");
  if(input.material.public_key_spki_b64 &&
     input.material.public_key_spki_b64!==pub)
    throw Error("STRUCTURAL_SIGNER_PUBLIC_KEY_MISMATCH");
  const {signedContents,canonical}=message(input.product,
    input.certified_rights_receipt_sha256,input.query_plan_hash);
  const signature=sign(null,canonical,key).toString("base64");
  return {
    ...signedContents,
    integrity:{
      canonicalization:"geomacro-canonical-json" as const,
      hash_scheme:"SHA-256" as const,
      signed_payload_sha256:shaBytes(canonical),
      signature_scheme:"Ed25519" as const,
      signing_key_id:input.material.key_id,
      signature_base64:signature,
      signer_public_key_spki_b64:pub,
      signed_current_risk_object:false as const,
      gro_signature:false as const,
    },
  };
}
/** Caller must supply an independently trusted registered public key.
 * Reject unregistered/retired/revoked keys, forged bytes, attribution changes,
 * query/rights substitution, malformed signature and temporal invalidity. */
export function verifyWdiStructuralAnswer(
  value:SignedWdiStructuralAnswer,keys:RiskObjectVerificationKeys,
  expected:{query_plan_hash:string;certified_rights_receipt_sha256:string},
):{valid:boolean;reason:string}{
  try {
    assertRiskObjectJsonKeysSafe(value);
    if(value.schema_version!=="geomacro.signed-wdi-structural-answer.v1"||
       value.query_plan_hash!==expected.query_plan_hash ||
       value.certified_rights_receipt_sha256!==expected.certified_rights_receipt_sha256 ||
       !SHA.test(value.certified_rights_receipt_sha256))
      throw Error("SIGNED_WDI_QUERY_OR_RIGHTS_BINDING_MISMATCH");
    assertAttributedWdiStructuralProduct(value.structural_product);
    if(value.structural_product.integrity.signature_status!=="UNSIGNED_NOT_A_GRO" ||
       value.integrity.signature_scheme!=="Ed25519" ||
       value.integrity.canonicalization!=="geomacro-canonical-json" ||
       value.integrity.signed_current_risk_object!==false ||
       value.integrity.gro_signature!==false)
      throw Error("SIGNED_WDI_SCHEMA_OR_BOUNDARY_INVALID");
    const registry=normalizeRiskObjectVerificationKeys(keys);
    const key=registry[value.integrity.signing_key_id];
    if(!key || key.status==="revoked" || key.status==="retired")
      throw Error("SIGNED_WDI_KEY_NOT_TRUSTED");
    if(key.public_key_spki_b64!==value.integrity.signer_public_key_spki_b64)
      throw Error("SIGNED_WDI_KEY_REGISTRY_MISMATCH");
    const checked=Date.parse(value.structural_product.uncertainty.checked_at);
    if(!Number.isFinite(checked) ||
       (key.not_before && checked<Date.parse(key.not_before)) ||
       (key.not_after && checked>Date.parse(key.not_after)))
      throw Error("SIGNED_WDI_KEY_LIFECYCLE_INVALID");
    const {canonical}=message(value.structural_product,
      value.certified_rights_receipt_sha256,value.query_plan_hash);
    if(shaBytes(canonical)!==value.integrity.signed_payload_sha256)
      throw Error("SIGNED_WDI_HASH_MISMATCH");
    if(!verify(null,canonical,publicKey(key.public_key_spki_b64),
      strictB64(value.integrity.signature_base64)))
      throw Error("SIGNED_WDI_SIGNATURE_INVALID");
    return {valid:true,reason:"VERIFIED"};
  }catch(e){return {valid:false,reason:e instanceof Error?e.message:"INVALID_STRUCTURAL_SIGNATURE"};}
}
