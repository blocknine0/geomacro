import { commerceSha256, stableCommerceJson } from "./agent-commerce-delivery.server";

/**
 * Immutable canonical UTF-8 HTTP response BODY, not a hash of a mutable JS object.
 * Freeze and verify BEFORE any settlement, then return these exact same bytes
 * after the authenticated Durable Object ledger commits delivery.
 *
 * The separately signed intelligence projection and x402 PAYMENT-RESPONSE
 * header remain bound by their own original quote/provider contracts.
 */
export type FrozenCapabilityHttpBody = Readonly<{ body: string; sha256: string }>;
const SHA256_RE=/^[0-9a-f]{64}$/u;

function assertJson(value:unknown, seen=new Set<object>(), depth=0):void {
  if(depth>64) throw Error("X402_FINAL_HTTP_BODY_NOT_JSON");
  if(value===null || typeof value==="string" || typeof value==="boolean") return;
  if(typeof value==="number" && Number.isFinite(value)) return;
  if(typeof value!=="object" || seen.has(value) ||
      (!Array.isArray(value) && Object.getPrototypeOf(value)!==Object.prototype &&
       Object.getPrototypeOf(value)!==null)) throw Error("X402_FINAL_HTTP_BODY_NOT_JSON");
  seen.add(value);
  if(Array.isArray(value)) {
    for(let i=0;i<value.length;i++) {
      if(!Object.hasOwn(value,i)) throw Error("X402_FINAL_HTTP_BODY_NOT_JSON");
      assertJson(value[i],seen,depth+1);
    }
  } else for(const item of Object.values(value)) assertJson(item,seen,depth+1);
  seen.delete(value);
}

export function freezeCanonicalCapabilityHttpBody(payload: unknown): FrozenCapabilityHttpBody {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload))
    throw Error("X402_FINAL_HTTP_BODY_INVALID");
  assertJson(payload);
  const body=stableCommerceJson(payload);
  let parsed: unknown;
  try { parsed=JSON.parse(body); }
  catch { throw Error("X402_FINAL_HTTP_BODY_NOT_JSON"); }
  if (stableCommerceJson(parsed)!==body)
    throw Error("X402_FINAL_HTTP_BODY_NONCANONICAL");
  // Reject non-finite values and undefined keys instead of sending JSON
  // different from the immutable ledger prepared response.
  const bodyBytes=Buffer.byteLength(body,"utf8");
  if (bodyBytes<2 || bodyBytes>96*1024)
    throw Error("X402_FINAL_HTTP_BODY_SIZE_INVALID");
  return Object.freeze({body,sha256:commerceSha256(body)});
}

export function sendFrozenCapabilityHttpBody(
  frozen: FrozenCapabilityHttpBody,
  ledgerResponseSha256: string,
  headers: Record<string,string>,
): Response {
  // Rehash immutable pre-settlement wire bytes and compare the actual
  // authenticated ledger's prepared response hash before returning HTTP 200.
  if (!SHA256_RE.test(ledgerResponseSha256) ||
      commerceSha256(frozen.body)!==frozen.sha256 ||
      frozen.sha256!==ledgerResponseSha256)
    throw Error("X402_FINAL_HTTP_LEDGER_BODY_HASH_MISMATCH");
  return new Response(frozen.body,{
    status:200,
    headers:{
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store",
      "X-Content-Type-Options":"nosniff",
      ...headers,
      "X-Geomacro-Delivery-SHA256":frozen.sha256,
      "X-Geomacro-Brand":"Geomacro",
    },
  });
}
