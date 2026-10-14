import { paymentBindingForAgentQuery, type AgentQueryPlan } from "./agent-query-plan";
import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { canonicalRiskObjectJson, assertRiskObjectJsonKeysSafe,
  normalizeRiskObjectVerificationKeys,
  type RiskObjectSigningMaterial, type RiskObjectVerificationKeys,
} from "./risk-object-signing.server";
import { assertAttributedWdiStructuralProduct, certifiedWdiAttributionRights,
  type buildAttributedWdiStructuralProduct } from "./wdi-attributed-structural-product.server";
import { readB2CommercialSourceRightsReceipt } from "./b2-live.server";
import { freezeWdiPrequoteInDurableLedger, readbackWdiPrequoteFromDurableLedger,
  type WdiDurablePrequote } from "./agent-commerce-delivery.server";

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


/**
 * Strict pre-quote adapter around the EXISTING adaptive query/payment-binding
 * contract. Verifies the exact signed, attributed buyer bytes BEFORE creating
 * a binding. Never quotes, stores, settles, or self-certifies B2 source rights.
 * Durable proof must later be confirmed by the existing x402 delivery ledger.
 */
export function prepareWdiStructuralNoFundsQuoteBinding(input:{
  signed_answer:SignedWdiStructuralAnswer;
  verification_keys:RiskObjectVerificationKeys;
  query_plan:AgentQueryPlan;
  certified_rights_receipt_sha256:string;
  payment_terms:{amountAtomic:string;network:string;asset:string;payTo:string};
}){
  const plan=input.query_plan;
  const result=verifyWdiStructuralAnswer(input.signed_answer,input.verification_keys,{
    query_plan_hash:plan.query_plan_hash,
    certified_rights_receipt_sha256:input.certified_rights_receipt_sha256,
  });
  if(!result.valid)throw Error("WDI_QUOTE_PREPARATION_SIGNATURE_UNVERIFIED");
  if(plan.delivery_tier!=="structural_baseline" ||
     plan.fulfillment_mode!=="published_only" ||
     plan.subjects.length!==1 ||plan.subjects[0].type!=="country"||
     plan.subjects[0].country_iso3!=="CHN" ||
     plan.topics.length!==1||plan.topics[0]!=="macro_risk" ||
     plan.required_modules.length!==1 ||
     plan.required_modules[0]!=="macro_monetary"||
     plan.as_of!==null||
     !/\b(?:cpi|consumer price inflation)\b/iu.test(plan.question_key))
    throw Error("WDI_QUOTE_PREPARATION_PLAN_OUT_OF_SCOPE");
  const terms=input.payment_terms;
  if(!/^[1-9][0-9]{0,17}$/u.test(terms.amountAtomic) ||
     !/^[a-z][a-z0-9:-]{1,100}$/iu.test(terms.network) ||
     !/^0x[0-9a-f]{40}$/iu.test(terms.asset) ||
     !/^0x[0-9a-f]{40}$/iu.test(terms.payTo))
    throw Error("WDI_QUOTE_PREPARATION_TERMS_INVALID");
  const customer_bytes=canonicalRiskObjectJson(input.signed_answer);
  const customer_sha256=shaBytes(Buffer.from(customer_bytes,"utf8"));
  const payment_binding=paymentBindingForAgentQuery({
    queryPlan:plan,amountAtomic:terms.amountAtomic,
    network:terms.network,asset:terms.asset,payTo:terms.payTo,
  });
  // Existing x402 extensions presently bind only the query plan hash.
  // Record BOTH hashes in the candidate contract, but never advertise this
  // as a ready x402 quote until a durable pre-quote reader proves byte parity.
  const prepared_binding_sha256=digest({
    schema:"geomacro.wdi-prepared-answer-binding.v1",
    query_plan_hash:plan.query_plan_hash,
    customer_sha256, payment_binding,
    certified_rights_receipt_sha256:input.certified_rights_receipt_sha256,
  });
  return {
    schema:"geomacro.wdi-prepared-answer-binding.v1" as const,
    query_plan_hash:plan.query_plan_hash,
    source_rights_sha256:input.certified_rights_receipt_sha256,
    signed_customer_answer_sha256:customer_sha256,
    prepared_binding_sha256,
    legacy_x402_payment_binding:payment_binding,
    customer_bytes,
    customer_visible_attribution_present:true as const,
    independently_signature_verified:true as const,
    durable_prequote_readback_verified:false as const,
    quote_authorized:false as const,
    payment_authorized:false as const,
    settlement_attempted:false as const,
  };
}


/**
 * WDI-only, no-funds durable preparation. A genuine rights receipt is read
 * again on EACH new freeze; the GitHub production attestation is not a token
 * that silently certifies Lovable. Readback proves exact immutable buyer bytes
 * and replay; public 402, facilitator calls and settlement remain disabled.
 */
export async function durablyFreezeWdiNoFundsAnswer(input:{
  signed_answer:SignedWdiStructuralAnswer;
  verification_keys:RiskObjectVerificationKeys;
  query_plan:AgentQueryPlan;
  payment_terms:{amountAtomic:string;network:string;asset:string;payTo:string};
  expected_frozen_quote_reference?:string;
},opts:{
  now?:Date;
  readRightsReceipt?:typeof readB2CommercialSourceRightsReceipt;
  freeze?:typeof freezeWdiPrequoteInDurableLedger;
  readback?:typeof readbackWdiPrequoteFromDurableLedger;
}={}){
  const now=opts.now??new Date();
  if(!Number.isFinite(now.getTime()))
    throw Error("WDI_DURABLE_CLOCK_INVALID");
  const rights=await (opts.readRightsReceipt??readB2CommercialSourceRightsReceipt)();
  if(!rights || !SHA.test(rights.compressed_sha256))
    throw Error("WDI_DURABLE_GENUINE_RECEIPT_UNAVAILABLE");
  const generatedAt=Date.parse(rights.generated_at);
  const expiry=generatedAt+24*60*60*1000;
  if(!Number.isFinite(generatedAt) || rights.generated_at!==new Date(generatedAt).toISOString() ||
     generatedAt>now.getTime()+5*60_000 || now.getTime()>=expiry)
    throw Error("WDI_DURABLE_RIGHTS_RECEIPT_EXPIRED");
  const certified=certifiedWdiAttributionRights(rights.rows);
  if(!certified.eligible || !certified.receipt_sha256)
    throw Error("WDI_DURABLE_WDI_RIGHTS_NOT_CERTIFIED");
  const candidate=prepareWdiStructuralNoFundsQuoteBinding({
    signed_answer:input.signed_answer,
    verification_keys:input.verification_keys,
    query_plan:input.query_plan,
    certified_rights_receipt_sha256:certified.receipt_sha256,
    payment_terms:input.payment_terms,
  });
  const bindingHash=digest({
    schema:"geomacro.wdi-durable-prequote-binding.v1",
    prepared_binding_sha256:candidate.prepared_binding_sha256,
    receipt_sha256:rights.compressed_sha256,
    receipt_generated_at:rights.generated_at,
    expires_at_ms:expiry,
  });
  // An existing quote ID must NEVER be repointed to a different payment,
  // signer, query, rights snapshot, expiry or customer response.
  if(input.expected_frozen_quote_reference !== undefined &&
     input.expected_frozen_quote_reference !== bindingHash)
    throw Error("WDI_FROZEN_QUOTE_REPLAY_BINDING_MISMATCH");
  const frozen:WdiDurablePrequote={
    bindingHash,queryHash:candidate.query_plan_hash,
    rightsHash:candidate.source_rights_sha256,
    receiptHash:rights.compressed_sha256,
    answerHash:candidate.signed_customer_answer_sha256,
    termsHash:candidate.legacy_x402_payment_binding,
    rightsGeneratedAt:rights.generated_at,
    customerBytes:candidate.customer_bytes,
  };
  const freeze=opts.freeze??freezeWdiPrequoteInDurableLedger;
  const readback=opts.readback??readbackWdiPrequoteFromDurableLedger;
  const result=await freeze(frozen);
  if(result.binding_hash!==bindingHash ||
     result.answer_sha256!==frozen.answerHash ||
     result.expires_at_ms!==expiry ||
     !["FROZEN","EXACT_REPLAY"].includes(result.disposition))
    throw Error("WDI_DURABLE_FREEZE_ACK_MISMATCH");
  // Two independent authenticated storage reads: one post-write integrity
  // check and one idempotent replay. Never accept reconstructed customer JSON.
  const check=async()=>{
    const item=await readback(bindingHash);
    if(item.bindingHash!==bindingHash ||
       item.queryHash!==frozen.queryHash ||
       item.rightsHash!==frozen.rightsHash ||
       item.receiptHash!==frozen.receiptHash ||
       item.answerHash!==frozen.answerHash ||
       item.termsHash!==frozen.termsHash ||
       item.rightsGeneratedAt!==rights.generated_at ||
       item.expiresAtMs!==expiry ||
       item.customerBytes!==frozen.customerBytes ||
       shaBytes(Buffer.from(item.customerBytes,"utf8"))!==frozen.answerHash ||
       item.payment_authorized!==false ||
       item.settlement_attempted!==false ||
       (opts.now??new Date()).getTime()>=expiry)
      throw Error("WDI_DURABLE_PREQUOTE_READBACK_MISMATCH");
    let stored:SignedWdiStructuralAnswer;
    try{stored=JSON.parse(item.customerBytes) as SignedWdiStructuralAnswer;}
    catch{throw Error("WDI_DURABLE_STORED_CUSTOMER_BYTES_INVALID");}
    const verified=verifyWdiStructuralAnswer(stored,input.verification_keys,{
      query_plan_hash:input.query_plan.query_plan_hash,
      certified_rights_receipt_sha256:certified.receipt_sha256,
    });
    if(!verified.valid ||
       canonicalRiskObjectJson(stored)!==item.customerBytes)
      throw Error("WDI_DURABLE_STORED_SIGNATURE_OR_ATTRIBUTION_UNVERIFIED");
    return item.customerBytes;
  };
  const original=await check();
  const replay=await check();
  if(original!==replay)throw Error("WDI_DURABLE_REPLAY_BYTES_MISMATCH");
  return {
    schema:"geomacro.wdi-durable-no-funds-prequote.v1" as const,
    frozen_quote_reference:bindingHash,
    signed_customer_answer_sha256:frozen.answerHash,
    query_plan_hash:frozen.queryHash,
    source_rights_fingerprint:frozen.rightsHash,
    rights_receipt_compressed_sha256:frozen.receiptHash,
    rights_generated_at:frozen.rightsGeneratedAt,
    rights_expires_at:new Date(expiry).toISOString(),
    payment_terms_binding:frozen.termsHash,
    write_disposition:result.disposition,
    durable_prequote_readback_verified:true as const,
    identical_no_funds_replay_verified:true as const,
    independently_signature_verified:true as const,
    customer_visible_attribution_present:true as const,
    quote_authorized:false as const,
    payment_authorized:false as const,
    settlement_attempted:false as const,
  };
}
