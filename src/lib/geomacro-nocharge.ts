import {GEOMACRO_CAPABILITY_PRICES} from "./capability-pricing-catalog";

/**
 * One strictly no-charge receipt. This is not a paid-delivery response, a
 * commercial rights assertion, a payment refund, or a signed risk object.
 * Call only after the existing server-side pre-payment eligibility gate.
 */
export const GEOMACRO_NOCHARGE_SCHEMA="geomacro.nocharge.v1" as const;
export const GEOMACRO_NOCHARGE_REASONS=[
  "UNCHANGED_NO_CHARGE","STALE_NO_CHARGE","UNAVAILABLE_NO_CHARGE",
  "INSUFFICIENT_EVIDENCE_NO_CHARGE","FAILED_NO_CHARGE",
] as const;
export type NoChargeReason=typeof GEOMACRO_NOCHARGE_REASONS[number];
export type NoChargeSubject=Readonly<{type:"global"|"country"|"corridor"|"query";id:string}>;
export type GeomacroNoChargeResponse=Readonly<{
  schema:typeof GEOMACRO_NOCHARGE_SCHEMA;
  request_id:string;
  capability:keyof typeof GEOMACRO_CAPABILITY_PRICES;
  billing:Readonly<{charged:false;price_usdc:"0";reason:NoChargeReason}>;
  subject:NoChargeSubject;
  reason_detail:string;
  content_hash?:string;
  retry_after_s?:number;
}>;

const HASH=/^sha256:[a-f0-9]{64}$/u;
const PUBLIC_ID=/^[a-zA-Z0-9_.:-]{1,128}$/u;
const REQUEST_ID=/^[a-zA-Z0-9_-]{8,128}$/u;
const SAFE_TEXT=/^[^<>\r\n]{1,200}$/u;
const SOURCE_IDENTITY=/(?:https?:\/\/|www\.|\bsource[_-]?id\b|\bprovider[_-]?id\b|\baccess[_-]?token\b)/iu;
const TYPES=["global","country","corridor","query"] as const;
const ALLOWED_REASONS=new Set<string>(GEOMACRO_NOCHARGE_REASONS);

/** ETags may be HTTP-quoted, but wildcard, weak or multi-ETag headers never match. */
export function exactGeomacroIfNoneMatch(header:string|null,hash:string):boolean{
  if(!HASH.test(hash)||typeof header!=="string")return false;
  return header===hash||header==='"'+hash+'"';
}

type BaseInput=Readonly<{
  request_id:string;capability:string;subject:NoChargeSubject;
  reason_detail:string;retry_after_s?:number;
  // These must be checked from the real server path, NEVER customer fields.
  payment_attempted:false;delivery_committed:false;
}>;
function assertSafeBase(input:BaseInput):void{
  if(input.payment_attempted!==false||input.delivery_committed!==false)
    throw Error("NOCHARGE_AFTER_PAYMENT_OR_DELIVERY");
  if(!REQUEST_ID.test(input.request_id)||
    !Object.hasOwn(GEOMACRO_CAPABILITY_PRICES,input.capability)||
    !input.subject||!TYPES.includes(input.subject.type)||
    !PUBLIC_ID.test(input.subject.id)||
    (input.subject.type==="country"&&!/^[A-Z]{3}$/u.test(input.subject.id))||
    typeof input.reason_detail!=="string"||
    !SAFE_TEXT.test(input.reason_detail)||
    SOURCE_IDENTITY.test(input.reason_detail)||
    (input.retry_after_s!==undefined&&
      (!Number.isSafeInteger(input.retry_after_s)||
       input.retry_after_s<0||input.retry_after_s>86400)))
    throw Error("NOCHARGE_INVALID_OR_PRIVATE_DETAILS");
}

export function makeGeomacroNoChargeResponse(
  input:BaseInput&Readonly<{reason:Exclude<NoChargeReason,"UNCHANGED_NO_CHARGE">}>,
):GeomacroNoChargeResponse{
  assertSafeBase(input);
  if(!ALLOWED_REASONS.has(input.reason)||String(input.reason)==="UNCHANGED_NO_CHARGE")
    throw Error("NOCHARGE_REASON_NOT_PERMITTED");
  const response:GeomacroNoChargeResponse={
    schema:GEOMACRO_NOCHARGE_SCHEMA,request_id:input.request_id,
    capability:input.capability as GeomacroNoChargeResponse["capability"],
    billing:{charged:false,price_usdc:"0",reason:input.reason},
    subject:{type:input.subject.type,id:input.subject.id},
    reason_detail:input.reason_detail,
    ...(input.retry_after_s===undefined?{}:{retry_after_s:input.retry_after_s}),
  };
  return Object.freeze(response);
}

/**
 * If-None-Match is only a free replay when the *server-verified current*
 * deliverable content hash is exactly the supplied current content hash.
 * Never infer the hash from user input, source age, or an unsigned sample.
 */
export function makeGeomacroUnchangedNoChargeResponse(
 input:BaseInput&Readonly<{
   if_none_match:string|null;
   content_hash:string;
   verified_current_content_hash:string;
 }>,
):GeomacroNoChargeResponse|null{
  assertSafeBase(input);
  if(!HASH.test(input.content_hash)||
     input.verified_current_content_hash!==input.content_hash||
     !exactGeomacroIfNoneMatch(input.if_none_match,input.content_hash))
    return null;
  return Object.freeze({
    schema:GEOMACRO_NOCHARGE_SCHEMA,request_id:input.request_id,
    capability:input.capability as GeomacroNoChargeResponse["capability"],
    billing:{charged:false as const,price_usdc:"0" as const,
      reason:"UNCHANGED_NO_CHARGE" as const},
    subject:{type:input.subject.type,id:input.subject.id},
    reason_detail:input.reason_detail,content_hash:input.content_hash,
    ...(input.retry_after_s===undefined?{}:{retry_after_s:input.retry_after_s}),
  });
}
