// Isolated commercial-verdict Ed25519 primitives. Never generates production keys.
const enc = new TextEncoder();
export function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    if (keys.some(k => k === "__proto__" || k === "constructor" || k === "prototype")) throw Error("FORBIDDEN_JSON_KEY");
    return "{" + keys.map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  throw Error("NON_CANONICAL_JSON");
}
export async function sha256(value) {
  const bytes = await crypto.subtle.digest("SHA-256", enc.encode(typeof value === "string" ? value : canonical(value)));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, "0")).join("");
}
export function encodeBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}
export function decodeBase64(s) {
  if (typeof s !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) throw Error("INVALID_BASE64");
  const bytes = Uint8Array.from(atob(s), c => c.charCodeAt(0));
  if (encodeBase64(bytes) !== s) throw Error("NONCANONICAL_BASE64");
  return bytes;
}
function unsignedEnvelope(body, keyId) {
  return {...body, integrity: {algorithm:"Ed25519", canonicalization:"geomacro-canonical-json-v1", key_id:keyId, payload_sha256:null, signature:null}};
}
export async function signEnvelope(body, signer) {
  if (!signer?.privateKey || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(signer.keyId)) throw Error("SIGNER_NOT_CONFIGURED");
  const base = unsignedEnvelope(body, signer.keyId);
  const hash = await sha256(base);
  const signable = {...base, integrity:{...base.integrity, payload_sha256:hash}};
  const signature = await crypto.subtle.sign("Ed25519", signer.privateKey, enc.encode(canonical(signable)));
  return {...signable, integrity:{...signable.integrity, signature:encodeBase64(signature)}};
}
export async function verifyEnvelope(signed, resolveKey) {
  if (!signed?.integrity || signed.integrity.algorithm !== "Ed25519" ||
      signed.integrity.canonicalization !== "geomacro-canonical-json-v1") return false;
  const {signature,key_id: keyId,payload_sha256:hash} = signed.integrity;
  if (!/^[a-f0-9]{64}$/.test(hash || "")) return false;
  const signable = {...signed,integrity:{...signed.integrity,signature:null}};
  const bare = {...signable,integrity:{...signable.integrity,payload_sha256:null}};
  if (await sha256(bare) !== hash) return false;
  const key = await resolveKey(keyId);
  if (!key) return false;
  try { return await crypto.subtle.verify("Ed25519", key, decodeBase64(signature), enc.encode(canonical(signable))); }
  catch { return false; }
}
